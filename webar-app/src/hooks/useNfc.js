// Thin wrapper around @capgo/capacitor-nfc: builds/parses NDEF records for
// the write-menu data types (Text, URL, Contact, Wi-Fi, Email, Location,
// Social Media) and keeps a local scan/write history in localStorage.
//
// Native hardware only. registerPlugin() (inside the package) automatically
// routes to the real native bridge on Android/iOS, or to the package's own
// web stub everywhere else (browser/desktop) — that stub's isSupported()
// resolves false and every other method rejects "unimplemented", which the
// functions below catch and surface as "NFC isn't available here."
import { CapacitorNfc } from '@capgo/capacitor-nfc';
import { Capacitor } from '@capacitor/core';

const HISTORY_KEY = 'memoera_nfc_history';
const MAX_HISTORY = 100;

// Web NFC — Chrome on Android only, and only over HTTPS. This is what makes
// NFC usable at memoera.in: the Capacitor plugin above resolves to a stub in
// any browser, so before this every NFC action failed on the website and only
// worked inside the installed APK.
//
// Safari does not implement Web NFC and Apple has not signalled that it will,
// so iPhone users still need the native app to write a tag. Reading a tag to
// open a URL needs neither — iOS does that itself.
export function isWebNfcAvailable() {
  return typeof window !== 'undefined'
    && 'NDEFReader' in window
    && window.isSecureContext;
}

function isNative() {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
}

export async function isNfcSupported() {
  if (isNative()) {
    try {
      const { supported } = await CapacitorNfc.isSupported();
      return !!supported;
    } catch {
      return false;
    }
  }
  return isWebNfcAvailable();
}

export async function getNfcStatus() {
  try {
    const { status } = await CapacitorNfc.getStatus();
    return status;
  } catch {
    return 'UNKNOWN';
  }
}

export async function openNfcSettings() {
  try { await CapacitorNfc.showSettings(); } catch {}
}

// ── History (local only — no backend for this feature) ─────────────────────
export function loadNfcHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function pushHistory(entry) {
  try {
    const list = loadNfcHistory();
    list.unshift({ ...entry, id: Date.now() + '-' + Math.random().toString(36).slice(2), at: new Date().toISOString() });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, MAX_HISTORY)));
  } catch {}
}

export function clearNfcHistory() {
  try { localStorage.removeItem(HISTORY_KEY); } catch {}
}

// ── NDEF record builders ─────────────────────────────────────────────────
const enc = new TextEncoder();
const toBytes = (str) => Array.from(enc.encode(str));

function textRecord(text, lang = 'en') {
  const langBytes = toBytes(lang);
  const textBytes = toBytes(text);
  return {
    tnf: 0x01, // TNF_WELL_KNOWN
    type: [0x54], // 'T'
    id: [],
    payload: [langBytes.length & 0x3f, ...langBytes, ...textBytes],
  };
}

function uriRecord(uri) {
  // Prefix code 0x00 (no abbreviation) keeps this simple/robust — the extra
  // few bytes don't matter for the short URLs/addresses this screen writes.
  return {
    tnf: 0x01, // TNF_WELL_KNOWN
    type: [0x55], // 'U'
    id: [],
    payload: [0x00, ...toBytes(uri)],
  };
}

function vcardRecord(vcard) {
  return {
    tnf: 0x02, // TNF_MIME_MEDIA
    type: toBytes('text/vcard'),
    id: [],
    payload: toBytes(vcard),
  };
}

function buildVcard({ name, phone, email, org }) {
  const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
  if (name)  lines.push(`FN:${name}`, `N:${name};;;;`);
  if (org)   lines.push(`ORG:${org}`);
  if (phone) lines.push(`TEL;TYPE=CELL:${phone}`);
  if (email) lines.push(`EMAIL:${email}`);
  lines.push('END:VCARD');
  return lines.join('\n');
}

// Builds the NDEF record(s) for a given write-menu type + form values.
// Wi-Fi is written as a plain readable TEXT record in the common
// "WIFI:S:<ssid>;T:<sec>;P:<pass>;;" convention some consumer NFC-writer
// apps use — it's informational (any NFC reader can show the credentials),
// not the official low-level Wi-Fi Simple Config NDEF format, which needs a
// dedicated MIME record type most phones don't auto-join from anyway.
export function buildRecordsFor(type, values) {
  switch (type) {
    case 'text':
      return [textRecord(values.text || '')];
    case 'url':
    case 'social':
      return [uriRecord(values.url || '')];
    case 'contact':
      return [vcardRecord(buildVcard(values))];
    case 'wifi': {
      const sec = values.security || 'WPA';
      return [textRecord(`WIFI:S:${values.ssid || ''};T:${sec};P:${values.password || ''};;`)];
    }
    case 'email': {
      const params = [];
      if (values.subject) params.push(`subject=${encodeURIComponent(values.subject)}`);
      if (values.body) params.push(`body=${encodeURIComponent(values.body)}`);
      const q = params.length ? `?${params.join('&')}` : '';
      return [uriRecord(`mailto:${values.address || ''}${q}`)];
    }
    case 'location':
      return [uriRecord(`geo:${values.lat || '0'},${values.lng || '0'}`)];
    default:
      throw new Error('Unknown NFC write type: ' + type);
  }
}

// ── Scan session ─────────────────────────────────────────────────────────
// Starts a scanning session and resolves with the first tag detected (or
// rejects on timeout/cancel). Caller is responsible for calling
// stopNfcScan() when done with a write, since write() acts on "the last
// discovered tag" from an still-open session.
// Web NFC scanning is one long-lived NDEFReader with an abort signal, whereas
// the plugin is start/stop plus an event listener. These module-level handles
// bridge the two so callers keep the same start / addListener / stop shape.
let webScanAbort = null;
let webScanHandlers = [];

export async function startNfcScan({ alertMessage } = {}) {
  if (!isNative()) {
    if (!isWebNfcAvailable()) {
      throw new Error('NFC scanning needs Chrome on Android, or the Memoera app.');
    }
    try {
      const reader = new window.NDEFReader();
      webScanAbort = new AbortController();
      // Shaped like the plugin's nfcEvent payload so listeners don't branch.
      reader.onreading = (e) => {
        const records = [...(e.message?.records || [])].map((r) => ({
          recordType: r.recordType, mediaType: r.mediaType,
          data: r.data, encoding: r.encoding, lang: r.lang,
        }));
        const payload = { nfcTag: { message: { records }, id: e.serialNumber } };
        webScanHandlers.forEach((h) => { try { h(payload); } catch { /* one bad listener shouldn't kill the scan */ } });
      };
      await reader.scan({ signal: webScanAbort.signal });
    } catch (e) {
      webScanAbort = null;
      if (e?.name === 'NotAllowedError') throw new Error('NFC permission was denied.');
      throw new Error(e?.message || 'Could not start NFC scanning.');
    }
    return;
  }
  try {
    await CapacitorNfc.startScanning({ invalidateAfterFirstRead: false, alertMessage: alertMessage || 'Hold a tag near the back of your phone.' });
  } catch {
    throw new Error('NFC is not available on this device.');
  }
}

export async function stopNfcScan() {
  if (!isNative()) {
    try { webScanAbort?.abort(); } catch {}
    webScanAbort = null;
    webScanHandlers = [];
    return;
  }
  try { await CapacitorNfc.stopScanning(); } catch {}
}

export function addNfcListener(handler) {
  if (!isNative()) {
    webScanHandlers.push(handler);
    return { remove: async () => { webScanHandlers = webScanHandlers.filter((h) => h !== handler); } };
  }
  try {
    return CapacitorNfc.addListener('nfcEvent', handler);
  } catch {
    return { remove: async () => {} };
  }
}

// Web NFC uses its own high-level record shape rather than the raw NDEF byte
// layout the Capacitor plugin wants, so the same write is expressed twice.
function webNdefRecords(type, values) {
  switch (type) {
    case 'url':
    case 'social':
      return [{ recordType: 'url', data: values.url || '' }];
    case 'email':
      return [{ recordType: 'url', data: `mailto:${values.address || ''}` }];
    case 'location':
      return [{ recordType: 'url', data: `geo:${values.lat || '0'},${values.lng || '0'}` }];
    case 'contact':
      return [{ recordType: 'mime', mediaType: 'text/vcard',
                data: new TextEncoder().encode(buildVcard(values)) }];
    case 'wifi':
      return [{ recordType: 'text',
                data: `WIFI:S:${values.ssid || ''};T:${values.security || 'WPA'};P:${values.password || ''};;` }];
    case 'text':
    default:
      return [{ recordType: 'text', data: values.text || '' }];
  }
}

export async function writeNfcTag(type, values) {
  // Browser path — Chrome on Android. The NDEFReader write() call itself is
  // what prompts the user and waits for a tag to be presented.
  if (!isNative()) {
    if (!isWebNfcAvailable()) {
      throw new Error('NFC writing needs Chrome on Android, or the Memoera app.');
    }
    try {
      const writer = new window.NDEFReader();
      await writer.write({ records: webNdefRecords(type, values) });
    } catch (e) {
      if (e?.name === 'NotAllowedError') throw new Error('NFC permission was denied.');
      if (e?.name === 'NotSupportedError') throw new Error('This device cannot write NFC tags.');
      throw new Error(e?.message || 'Failed to write to tag. It may be read-only.');
    }
    pushHistory({ direction: 'write', type, summary: summarizeWrite(type, values) });
    return;
  }

  const records = buildRecordsFor(type, values);
  try {
    await CapacitorNfc.write({ allowFormat: true, records });
  } catch (e) {
    throw new Error(e?.message?.includes('not available') ? 'NFC is not available on this device.' : (e?.message || 'Failed to write to tag.'));
  }
  pushHistory({ direction: 'write', type, summary: summarizeWrite(type, values) });
}

export async function eraseNfcTag() {
  try {
    await CapacitorNfc.erase();
  } catch (e) {
    throw new Error(e?.message?.includes('not available') ? 'NFC is not available on this device.' : (e?.message || 'Failed to erase tag.'));
  }
  pushHistory({ direction: 'erase', type: 'erase', summary: 'Tag data cleared' });
}

export function recordReadHistory(summary) {
  pushHistory({ direction: 'read', type: 'read', summary });
}

function summarizeWrite(type, values) {
  switch (type) {
    case 'text':     return values.text || '';
    case 'url':      return values.url || '';
    case 'social':   return values.url || '';
    case 'contact':  return values.name || values.phone || '';
    case 'wifi':     return values.ssid || '';
    case 'email':    return values.address || '';
    case 'location': return `${values.lat || '0'}, ${values.lng || '0'}`;
    default:         return '';
  }
}

// ── Decode a tag's NDEF message into a human-readable summary for the Read screen ──
const dec = new TextDecoder();
const fromBytes = (arr) => dec.decode(new Uint8Array(arr || []));

export function decodeNdefRecord(record) {
  if (!record) return { label: 'Empty', value: '' };

  // Web NFC hands back a different shape from the plugin: a string recordType
  // and a DataView of already-decoded payload, with no TNF and no language
  // prefix to strip. Detect and handle it before the raw-NDEF path below.
  if (typeof record.recordType === 'string') {
    let value = '';
    try {
      if (record.data instanceof DataView || ArrayBuffer.isView(record.data)) {
        value = new TextDecoder(record.encoding || 'utf-8').decode(record.data);
      } else if (typeof record.data === 'string') {
        value = record.data;
      }
    } catch { value = ''; }
    const LABELS = { text: 'Text', url: 'Link', mime: 'Contact', absoluteURL: 'Link' };
    return { label: LABELS[record.recordType] || record.recordType, value };
  }

  const type = fromBytes(record.type);
  const tnf = record.tnf;

  if (tnf === 0x01 && type === 'T') {
    const bytes = record.payload || [];
    const statusByte = bytes[0] || 0;
    const langLen = statusByte & 0x3f;
    const text = fromBytes(bytes.slice(1 + langLen));
    return { label: 'Text', value: text };
  }
  if (tnf === 0x01 && type === 'U') {
    const bytes = record.payload || [];
    const text = fromBytes(bytes.slice(1)); // prefix code ignored — we only ever wrote 0x00
    return { label: 'Link', value: text };
  }
  if (tnf === 0x02 && type === 'text/vcard') {
    return { label: 'Contact', value: fromBytes(record.payload) };
  }
  return { label: type || 'Unknown', value: fromBytes(record.payload) };
}
