import { useState, useEffect, useCallback, useRef } from 'react';
import {
  isNfcSupported, isWebNfcAvailable, getNfcStatus, openNfcSettings,
  startNfcScan, stopNfcScan, addNfcListener, decodeNdefRecord,
  writeNfcRecords, eraseNfcTag, estimateRecordBytes, normalizeTag,
  loadNfcHistory, clearNfcHistory,
} from '../hooks/useNfc.js';

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const TEAL = "#00C9A7";
const GOLD = "#C9A84C";
const VIOLET = "#8B5CF6";
const DANGER = "#FF6B6B";

const SAVED_KEY = 'memoera_nfc_saved_tags';

// Everything that can be written to a tag. Each entry declares its own form,
// so adding a record type is a data change rather than a new screen.
const RECORD_TYPES = [
  { type: 'url',      icon: '🔗', label: 'URL / Link',   hint: 'Open a website on tap',
    fields: [{ k: 'url', label: 'Address', placeholder: 'https://memoera.in', required: true }] },
  { type: 'text',     icon: '📝', label: 'Text',         hint: 'Plain text note',
    fields: [{ k: 'text', label: 'Text', placeholder: 'Anything you like', required: true, multiline: true }] },
  { type: 'phone',    icon: '📞', label: 'Phone number', hint: 'Start a call',
    fields: [{ k: 'phone', label: 'Number', placeholder: '9876543210', required: true, numeric: true }] },
  { type: 'sms',      icon: '💬', label: 'SMS',          hint: 'Prefilled message',
    fields: [{ k: 'phone', label: 'Number', placeholder: '9876543210', required: true, numeric: true },
             { k: 'text',  label: 'Message', placeholder: 'Hi!', multiline: true }] },
  { type: 'email',    icon: '✉️', label: 'Email',        hint: 'Compose an email',
    fields: [{ k: 'address', label: 'To', placeholder: 'hello@memoera.in', required: true },
             { k: 'subject', label: 'Subject', placeholder: 'Optional' },
             { k: 'body',    label: 'Body', placeholder: 'Optional', multiline: true }] },
  { type: 'contact',  icon: '👤', label: 'Contact card', hint: 'Save to contacts',
    fields: [{ k: 'name',  label: 'Name', placeholder: 'Ramesh Kumar', required: true },
             { k: 'org',   label: 'Business', placeholder: 'Ramesh Motors' },
             { k: 'phone', label: 'Phone', placeholder: '9876543210', numeric: true },
             { k: 'email', label: 'Email', placeholder: 'ramesh@example.com' }] },
  { type: 'wifi',     icon: '📶', label: 'Wi-Fi',        hint: 'Share network details',
    fields: [{ k: 'ssid', label: 'Network name', placeholder: 'MyShop-WiFi', required: true },
             { k: 'password', label: 'Password', placeholder: '' },
             { k: 'security', label: 'Security', placeholder: 'WPA' }] },
  { type: 'location', icon: '📍', label: 'Location',     hint: 'Open in Maps',
    fields: [{ k: 'lat', label: 'Latitude', placeholder: '12.9716', required: true },
             { k: 'lng', label: 'Longitude', placeholder: '77.5946', required: true }] },
  { type: 'social',   icon: '📱', label: 'Social link',  hint: 'Instagram, WhatsApp, YouTube…',
    fields: [{ k: 'url', label: 'Profile link', placeholder: 'https://instagram.com/…', required: true }] },
];

const typeMeta = (t) => RECORD_TYPES.find((r) => r.type === t) || { icon: '▦', label: t };

export default function NfcToolsScreen({ onBack, onStickers }) {
  const [view, setView]       = useState('home');   // home|tag|record|write|add|form|other|saved
  const [support, setSupport] = useState('checking');
  const [scanning, setScanning] = useState(false);
  const [scanPurpose, setScanPurpose] = useState('read');
  const [tag, setTag]         = useState(null);
  const [activeRecord, setActiveRecord] = useState(null);
  const [draft, setDraft]     = useState([]);       // records queued for writing
  const [formType, setFormType] = useState(null);
  const [formValues, setFormValues] = useState({});
  const [saved, setSaved]     = useState([]);
  const [toast, setToast]     = useState('');
  const [busy, setBusy]       = useState(false);
  const listenerRef = useRef(null);

  const say = useCallback((m) => { setToast(m); setTimeout(() => setToast(''), 3200); }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await isNfcSupported();
      if (cancelled) return;
      if (!ok) { setSupport('unsupported'); return; }
      const st = await getNfcStatus();
      if (cancelled) return;
      setSupport(st === 'NFC_DISABLED' ? 'disabled' : 'ok');
    })();
    try { setSaved(JSON.parse(localStorage.getItem(SAVED_KEY) || '[]')); } catch { /* corrupt store */ }
    return () => { cancelled = true; };
  }, []);

  const endScan = useCallback(async () => {
    if (listenerRef.current) { await listenerRef.current.remove(); listenerRef.current = null; }
    await stopNfcScan();
    setScanning(false);
  }, []);

  useEffect(() => () => { endScan(); }, [endScan]);

  // One scan routine for every action — read, write and erase all begin by
  // waiting for a tag, so the "Ready to Scan" sheet is shared.
  const beginScan = useCallback(async (purpose) => {
    if (support === 'unsupported') { say('NFC is not available here.'); return; }
    if (support === 'disabled') { openNfcSettings(); return; }
    setScanPurpose(purpose);
    setScanning(true);
    try {
      await startNfcScan({ alertMessage: 'Hold your phone against the tag' });
      listenerRef.current = addNfcListener(async (event) => {
        const t = normalizeTag(event);
        if (purpose === 'read') {
          setTag(t); setView('tag'); say('Tag read.');
        } else if (purpose === 'write') {
          try { await writeNfcRecords(draft); say('Written to tag.'); }
          catch (e) { say(e.message || 'Write failed.'); }
        } else if (purpose === 'erase') {
          try { await eraseNfcTag(); say('Tag erased.'); }
          catch (e) { say(e.message || 'Erase failed.'); }
        }
        endScan();
      });
    } catch (e) {
      say(e.message || 'Could not start scanning.');
      setScanning(false);
    }
  }, [support, draft, endScan, say]);

  const addDraft = () => {
    const meta = typeMeta(formType);
    const missing = (meta.fields || []).filter((f) => f.required && !(formValues[f.k] || '').trim());
    if (missing.length) { say(`${missing[0].label} is required.`); return; }
    setDraft((d) => [...d, { type: formType, values: { ...formValues } }]);
    setFormType(null); setFormValues({});
    setView('write');
  };

  const saveDraft = () => {
    if (!draft.length) { say('Nothing to save.'); return; }
    const name = window.prompt('Name this tag set', `Tag set ${saved.length + 1}`);
    if (!name) return;
    const next = [...saved, { id: Date.now(), name, records: draft }];
    setSaved(next);
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(next)); } catch { /* quota */ }
    say('Saved.');
  };

  const removeSaved = (id) => {
    const next = saved.filter((s) => s.id !== id);
    setSaved(next);
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(next)); } catch { /* quota */ }
  };

  const bytes = estimateRecordBytes(draft);

  return (
    <div style={st.screen}>
      <div style={st.header}>
        <button onClick={() => (view === 'home' ? onBack() : setView(view === 'form' ? 'add' : view === 'add' ? 'write' : 'home'))}
          style={st.back}>←</button>
        <div style={st.title}>{
          { home: 'NFC Tools', tag: 'Tag detail', record: 'Record', write: 'Write',
            add: 'Add a record', form: typeMeta(formType).label, other: 'Other', saved: 'Saved tag sets' }[view]
        }</div>
        {view === 'write' && draft.length > 0 && (
          <button onClick={saveDraft} style={st.headerAction}>Save</button>
        )}
      </div>

      <div style={st.body}>
        {view === 'home' && (
          <Home support={support} onRead={() => beginScan('read')}
            onWrite={() => setView('write')} onOther={() => setView('other')}
            onSaved={() => setView('saved')} onStickers={onStickers} />
        )}
        {view === 'tag' && (
          <TagDetail tag={tag} onRecord={(r) => { setActiveRecord(r); setView('record'); }} />
        )}
        {view === 'record' && <RecordDetail record={activeRecord} />}
        {view === 'write' && (
          <WriteView draft={draft} bytes={bytes} busy={busy}
            onAdd={() => setView('add')}
            onRemove={(i) => setDraft((d) => d.filter((_, j) => j !== i))}
            onWrite={() => { setBusy(true); beginScan('write'); setBusy(false); }} />
        )}
        {view === 'add' && (
          <AddRecord onPick={(t) => { setFormType(t); setFormValues({}); setView('form'); }} />
        )}
        {view === 'form' && (
          <RecordForm meta={typeMeta(formType)} values={formValues}
            onChange={setFormValues} onAdd={addDraft} />
        )}
        {view === 'other' && (
          <OtherView onErase={() => beginScan('erase')} />
        )}
        {view === 'saved' && (
          <SavedView saved={saved} onLoad={(s) => { setDraft(s.records); setView('write'); say('Loaded.'); }}
            onRemove={removeSaved} />
        )}
      </div>

      {scanning && (
        <ReadySheet purpose={scanPurpose} onCancel={endScan} />
      )}
      {toast && <div style={st.toast}>{toast}</div>}
    </div>
  );
}

// ── Home ────────────────────────────────────────────────────────────────────

function Home({ support, onRead, onWrite, onOther, onSaved, onStickers }) {
  const webOnly = !isWebNfcAvailable() && support === 'unsupported';
  return (
    <>
      {onStickers && (
        <button onClick={onStickers} style={st.hero}>
          <span style={{ fontSize: 22 }}>◎</span>
          <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
            <span style={st.heroTitle}>My MemoEra Stickers</span>
            <span style={st.heroSub}>Activate a sticker and choose what a tap opens</span>
          </span>
          <span style={{ color: TEAL, fontSize: 18 }}>→</span>
        </button>
      )}

      <CapabilityNotice support={support} webOnly={webOnly} />

      <div style={st.actionGrid}>
        <Action icon="⌁"  label="Read"  sub="Scan a tag and see what's on it" onClick={onRead} tint={TEAL} />
        <Action icon="✎"  label="Write" sub="Put links, text or contacts on a tag" onClick={onWrite} tint={VIOLET} />
        <Action icon="⚙"  label="Other" sub="Erase a tag" onClick={onOther} tint={GOLD} />
        <Action icon="★"  label="Saved" sub="Reuse a saved set of records" onClick={onSaved} tint="#60A5FA" />
      </div>
    </>
  );
}

// Honest, per-platform statement of what will actually work here. Web NFC
// exists only in Chrome on Android — Safari has never implemented it, so on an
// iPhone the website genuinely cannot read or write tags, and saying so beats
// letting someone tap Read and watch nothing happen.
function CapabilityNotice({ support, webOnly }) {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  if (support === 'ok') {
    return (
      <div style={{ ...st.notice, borderColor: `${TEAL}55`, background: `${TEAL}12` }}>
        <span style={{ color: TEAL, fontWeight: 800 }}>✓ NFC ready</span>
        <span style={st.noticeText}>Hold a tag against the back of your phone when asked.</span>
      </div>
    );
  }
  if (support === 'disabled') {
    return (
      <div style={{ ...st.notice, borderColor: `${GOLD}55`, background: `${GOLD}12` }}>
        <span style={{ color: GOLD, fontWeight: 800 }}>NFC is switched off</span>
        <span style={st.noticeText}>Turn it on in your device settings, then come back. Tap any button below to open settings.</span>
      </div>
    );
  }
  return (
    <div style={{ ...st.notice, borderColor: `${DANGER}55`, background: `${DANGER}10` }}>
      <span style={{ color: DANGER, fontWeight: 800 }}>
        {isIOS ? 'iPhone browsers can’t use NFC' : 'NFC not available here'}
      </span>
      <span style={st.noticeText}>
        {isIOS
          ? 'Safari has no NFC support, so reading and writing tags needs the Memoera app. Tapping a MemoEra sticker still works — iOS opens the link by itself, no app needed.'
          : webOnly
            ? 'Reading and writing tags needs Chrome on an Android phone, or the Memoera app. Desktops have no NFC hardware.'
            : 'This device has no NFC hardware.'}
      </span>
    </div>
  );
}

const Action = ({ icon, label, sub, onClick, tint }) => (
  <button onClick={onClick} style={{ ...st.action, borderColor: `${tint}44` }}>
    <span style={{ ...st.actionIcon, background: `${tint}1c`, color: tint }}>{icon}</span>
    <span style={st.actionLabel}>{label}</span>
    <span style={st.actionSub}>{sub}</span>
  </button>
);

// ── Tag detail ──────────────────────────────────────────────────────────────

function TagDetail({ tag, onRecord }) {
  if (!tag) return <Empty text="No tag data." />;
  const rows = [
    ['Serial number', tag.serial || '—'],
    ['Tag type', tag.type || (tag.limited ? 'Not exposed by the browser' : '—')],
    ['Technologies', tag.techTypes?.length ? tag.techTypes.map((t) => t.split('.').pop()).join(', ')
      : (tag.limited ? 'Not exposed by the browser' : '—')],
    ['Capacity', tag.maxSize != null ? `${tag.maxSize} bytes` : (tag.limited ? 'Not exposed by the browser' : '—')],
    ['Writable', tag.isWritable == null ? (tag.limited ? 'Not exposed by the browser' : '—') : (tag.isWritable ? 'Yes' : 'No')],
    ['Records', String(tag.records?.length || 0)],
  ];
  return (
    <>
      <Card>
        {rows.map(([k, v]) => (
          <div key={k} style={st.kv}>
            <span style={st.kvKey}>{k}</span>
            <span style={st.kvVal}>{v}</span>
          </div>
        ))}
      </Card>

      {tag.limited && (
        <div style={{ ...st.notice, borderColor: 'rgba(255,255,255,.14)' }}>
          <span style={st.noticeText}>
            Chrome's Web NFC gives a website the serial number and the records only —
            tag type, capacity and memory need low-level access it deliberately withholds.
            The Memoera app shows the full detail.
          </span>
        </div>
      )}

      <div style={st.sectionLabel}>Records on this tag</div>
      {(tag.records || []).length === 0 && <Empty text="This tag is empty." />}
      {(tag.records || []).map((r, i) => {
        const d = decodeNdefRecord(r);
        return (
          <button key={i} onClick={() => onRecord(r)} style={st.row}>
            <span style={st.rowIcon}>{d.label === 'Link' ? '🔗' : d.label === 'Contact' ? '👤' : '📝'}</span>
            <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
              <span style={st.rowTitle}>Record {i + 1} · {d.label}</span>
              <span style={st.rowSub}>{d.value || '(empty)'}</span>
            </span>
            <span style={{ color: 'rgba(255,255,255,.3)' }}>›</span>
          </button>
        );
      })}
    </>
  );
}

function RecordDetail({ record }) {
  if (!record) return <Empty text="No record." />;
  const d = decodeNdefRecord(record);
  const raw = record.payload
    ? record.payload.map((b) => '0x' + b.toString(16).padStart(2, '0').toUpperCase()).join(' ')
    : '(not exposed by the browser)';
  return (
    <Card>
      <div style={st.kv}><span style={st.kvKey}>Type</span><span style={st.kvVal}>{d.label}</span></div>
      <div style={st.kv}><span style={st.kvKey}>Value</span><span style={{ ...st.kvVal, color: TEAL, wordBreak: 'break-all' }}>{d.value || '—'}</span></div>
      <div style={st.kv}><span style={st.kvKey}>Size</span><span style={st.kvVal}>{record.payload?.length ?? '—'} bytes</span></div>
      <div style={{ ...st.sectionLabel, marginTop: 12 }}>Raw payload</div>
      <code style={st.raw}>{raw}</code>
    </Card>
  );
}

// ── Write ───────────────────────────────────────────────────────────────────

function WriteView({ draft, bytes, busy, onAdd, onRemove, onWrite }) {
  return (
    <>
      <button onClick={onAdd} style={{ ...st.primary, width: '100%' }}>+ Add a record</button>

      {draft.length === 0 ? (
        <Empty text="No records yet. Add one to build what the tag will hold." />
      ) : (
        <>
          <div style={st.sectionLabel}>{draft.length} record{draft.length === 1 ? '' : 's'} · about {bytes} bytes</div>
          {draft.map((r, i) => {
            const m = typeMeta(r.type);
            return (
              <div key={i} style={st.row}>
                <span style={st.rowIcon}>{m.icon}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={st.rowTitle}>{m.label}</span>
                  <span style={st.rowSub}>{Object.values(r.values).filter(Boolean)[0] || ''}</span>
                </span>
                <button onClick={() => onRemove(i)} style={st.rowRemove}>✕</button>
              </div>
            );
          })}
          <button onClick={onWrite} disabled={busy}
            style={{ ...st.primary, width: '100%', marginTop: 14,
              background: `linear-gradient(135deg, ${VIOLET}, #A78BFA)`, color: '#fff' }}>
            Write to tag · {bytes} bytes
          </button>
        </>
      )}
    </>
  );
}

const AddRecord = ({ onPick }) => (
  <>
    {RECORD_TYPES.map((r) => (
      <button key={r.type} onClick={() => onPick(r.type)} style={st.row}>
        <span style={st.rowIcon}>{r.icon}</span>
        <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
          <span style={st.rowTitle}>{r.label}</span>
          <span style={st.rowSub}>{r.hint}</span>
        </span>
        <span style={{ color: 'rgba(255,255,255,.3)' }}>›</span>
      </button>
    ))}
  </>
);

function RecordForm({ meta, values, onChange, onAdd }) {
  return (
    <>
      <Card>
        {(meta.fields || []).map((f) => (
          <div key={f.k} style={{ marginBottom: 12 }}>
            <div style={st.fieldLabel}>{f.label}{f.required ? ' *' : ''}</div>
            {f.multiline ? (
              <textarea value={values[f.k] || ''} placeholder={f.placeholder}
                onChange={(e) => onChange({ ...values, [f.k]: e.target.value })}
                style={{ ...st.input, minHeight: 84, resize: 'vertical' }} />
            ) : (
              <input value={values[f.k] || ''} placeholder={f.placeholder}
                inputMode={f.numeric ? 'numeric' : 'text'}
                onChange={(e) => onChange({ ...values, [f.k]: e.target.value })}
                style={st.input} />
            )}
          </div>
        ))}
      </Card>
      <button onClick={onAdd} style={{ ...st.primary, width: '100%' }}>Add record</button>
    </>
  );
}

// ── Other / Saved ───────────────────────────────────────────────────────────

function OtherView({ onErase }) {
  const [history, setHistory] = useState(loadNfcHistory());
  return (
    <>
      <button onClick={onErase} style={{ ...st.row, borderColor: `${DANGER}44` }}>
        <span style={{ ...st.rowIcon, color: DANGER }}>🗑</span>
        <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
          <span style={st.rowTitle}>Erase tag</span>
          <span style={st.rowSub}>Remove every record. Cannot be undone.</span>
        </span>
      </button>

      <div style={{ ...st.notice, borderColor: 'rgba(255,255,255,.14)' }}>
        <span style={{ fontWeight: 800, fontSize: 13 }}>Not available on this platform</span>
        <span style={st.noticeText}>
          Locking a tag, setting a password and reading raw memory pages need
          low-level chip access. Neither Chrome's Web NFC nor the app's NFC layer
          exposes it, so those are deliberately not offered here rather than
          shown as buttons that fail.
        </span>
      </div>

      <div style={st.sectionLabel}>Recent activity</div>
      {history.length === 0 ? <Empty text="Nothing yet." /> : (
        <>
          {history.slice(0, 15).map((h) => (
            <div key={h.id} style={st.row}>
              <span style={st.rowIcon}>{h.direction === 'write' ? '✎' : h.direction === 'erase' ? '🗑' : '⌁'}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={st.rowTitle}>{h.direction} · {h.type}</span>
                <span style={st.rowSub}>{h.summary || ''}</span>
              </span>
              <span style={st.rowTime}>{new Date(h.at).toLocaleDateString()}</span>
            </div>
          ))}
          <button onClick={() => { clearNfcHistory(); setHistory([]); }}
            style={{ ...st.ghost, marginTop: 10 }}>Clear history</button>
        </>
      )}
    </>
  );
}

const SavedView = ({ saved, onLoad, onRemove }) => (
  saved.length === 0 ? <Empty text="No saved sets yet. Build records under Write, then tap Save." /> : (
    <>
      {saved.map((s) => (
        <div key={s.id} style={st.row}>
          <span style={st.rowIcon}>★</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={st.rowTitle}>{s.name}</span>
            <span style={st.rowSub}>{s.records.length} record{s.records.length === 1 ? '' : 's'}</span>
          </span>
          <button onClick={() => onLoad(s)} style={st.ghostSm}>Load</button>
          <button onClick={() => onRemove(s.id)} style={st.rowRemove}>✕</button>
        </div>
      ))}
    </>
  )
);

// ── Shared ──────────────────────────────────────────────────────────────────

function ReadySheet({ purpose, onCancel }) {
  const verb = { read: 'read it', write: 'write to it', erase: 'erase it' }[purpose] || 'continue';
  return (
    <div style={st.sheetBackdrop}>
      <div style={st.sheet}>
        <div style={st.sheetTitle}>Ready to scan</div>
        <div style={st.sheetSub}>Hold your phone against the tag to {verb}</div>
        <div style={st.pulseWrap}>
          <span style={st.pulseRing} />
          <span style={st.pulseCore}>⌁</span>
        </div>
        <button onClick={onCancel} style={{ ...st.primary, width: '100%' }}>Cancel</button>
      </div>
      <style>{`@keyframes nfcPulse{0%{transform:scale(.85);opacity:.7}70%{transform:scale(1.5);opacity:0}100%{opacity:0}}
        @media (prefers-reduced-motion: reduce){ .nfc-ring{animation:none !important} }`}</style>
    </div>
  );
}

const Card  = ({ children }) => <div style={st.card}>{children}</div>;
const Empty = ({ text }) => <div style={st.empty}>{text}</div>;

const st = {
  screen: { position:'fixed', inset:0, background:'linear-gradient(170deg,#061A1F,#0A2229 55%,#061820)',
    display:'flex', flexDirection:'column', fontFamily:FONT, color:'#fff', overflow:'hidden' },
  header: { display:'flex', alignItems:'center', gap:12, padding:'48px 18px 14px', flexShrink:0 },
  back:   { background:'transparent', border:'1.5px solid rgba(255,255,255,.2)', borderRadius:'50%',
    width:34, height:34, color:'rgba(255,255,255,.75)', fontSize:16, cursor:'pointer', flexShrink:0 },
  title:  { fontSize:17, fontWeight:800, letterSpacing:'-.02em', flex:1, minWidth:0 },
  headerAction: { background:'transparent', border:`1px solid ${TEAL}66`, borderRadius:10, color:TEAL,
    fontSize:12.5, fontWeight:700, fontFamily:FONT, padding:'7px 14px', cursor:'pointer' },
  body:   { flex:1, overflowY:'auto', padding:'0 18px 40px' },

  hero: { width:'100%', display:'flex', alignItems:'center', gap:12, marginBottom:14, cursor:'pointer',
    borderRadius:18, padding:'16px 16px', textAlign:'left', fontFamily:FONT, color:'#fff',
    border:`1px solid ${VIOLET}66`, background:`linear-gradient(135deg, ${VIOLET}28, ${TEAL}16)` },
  heroTitle: { display:'block', fontSize:15.5, fontWeight:800 },
  heroSub:   { display:'block', fontSize:11.5, color:'rgba(255,255,255,.6)', marginTop:2 },

  notice: { border:'1px solid', borderRadius:14, padding:'12px 14px', marginBottom:14,
    display:'flex', flexDirection:'column', gap:4 },
  noticeText: { fontSize:11.5, color:'rgba(255,255,255,.62)', lineHeight:1.55 },

  actionGrid: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 },
  action: { borderRadius:18, border:'1px solid', background:'rgba(255,255,255,.045)', cursor:'pointer',
    padding:'16px 14px', display:'flex', flexDirection:'column', alignItems:'flex-start', gap:4,
    textAlign:'left', fontFamily:FONT, color:'#fff' },
  actionIcon:  { width:40, height:40, borderRadius:13, display:'flex', alignItems:'center',
    justifyContent:'center', fontSize:19, marginBottom:6 },
  actionLabel: { fontSize:15, fontWeight:800 },
  actionSub:   { fontSize:11, color:'rgba(255,255,255,.5)', lineHeight:1.4 },

  card: { background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.1)',
    borderRadius:16, padding:16, marginBottom:12 },
  kv:    { display:'flex', gap:12, padding:'9px 0', borderBottom:'1px solid rgba(255,255,255,.07)' },
  kvKey: { fontSize:12.5, color:'rgba(255,255,255,.5)', minWidth:112, flexShrink:0 },
  kvVal: { fontSize:13, fontWeight:600, wordBreak:'break-word', fontFamily:'ui-monospace, monospace' },
  raw:   { display:'block', fontFamily:'ui-monospace, monospace', fontSize:11, lineHeight:1.7,
    color:'rgba(255,255,255,.6)', wordBreak:'break-all' },

  sectionLabel: { fontSize:11, fontWeight:700, letterSpacing:'.09em', textTransform:'uppercase',
    color:'rgba(255,255,255,.42)', margin:'18px 0 8px' },
  row: { width:'100%', display:'flex', alignItems:'center', gap:12, marginBottom:8, cursor:'pointer',
    background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.1)', borderRadius:14,
    padding:'12px 14px', fontFamily:FONT, color:'#fff' },
  rowIcon:  { fontSize:17, width:24, textAlign:'center', flexShrink:0 },
  rowTitle: { display:'block', fontSize:13.5, fontWeight:700 },
  rowSub:   { display:'block', fontSize:11, color:'rgba(255,255,255,.5)', marginTop:2,
    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' },
  rowTime:  { fontSize:10.5, color:'rgba(255,255,255,.35)', flexShrink:0 },
  rowRemove:{ background:'transparent', border:'none', color:DANGER, fontSize:14, cursor:'pointer',
    padding:'4px 6px', flexShrink:0 },

  fieldLabel: { fontSize:11, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase',
    color:'rgba(255,255,255,.45)', marginBottom:5 },
  input: { width:'100%', boxSizing:'border-box', background:'rgba(255,255,255,.07)',
    border:'1px solid rgba(255,255,255,.15)', borderRadius:11, padding:'11px 13px',
    fontSize:13.5, color:'#fff', fontFamily:FONT, outline:'none' },

  primary: { background:`linear-gradient(135deg, ${TEAL}, #00E5CC)`, border:'none', borderRadius:13,
    color:'#04211d', fontSize:14.5, fontWeight:800, fontFamily:FONT, padding:'14px 18px', cursor:'pointer' },
  ghost:   { background:'transparent', border:'1px solid rgba(255,255,255,.2)', borderRadius:11,
    color:'rgba(255,255,255,.7)', fontSize:12.5, fontWeight:700, fontFamily:FONT,
    padding:'10px 16px', cursor:'pointer' },
  ghostSm: { background:'transparent', border:`1px solid ${TEAL}66`, borderRadius:9, color:TEAL,
    fontSize:11.5, fontWeight:700, fontFamily:FONT, padding:'6px 12px', cursor:'pointer', flexShrink:0 },
  empty:   { textAlign:'center', color:'rgba(255,255,255,.42)', fontSize:12.5, padding:'26px 10px',
    lineHeight:1.6 },

  sheetBackdrop: { position:'fixed', inset:0, background:'rgba(0,0,0,.72)', backdropFilter:'blur(6px)',
    zIndex:120, display:'flex', alignItems:'flex-end' },
  sheet: { width:'100%', background:'#0E2A2E', borderRadius:'26px 26px 0 0', padding:'24px 22px 34px',
    display:'flex', flexDirection:'column', alignItems:'center', gap:6 },
  sheetTitle: { fontSize:19, fontWeight:800, letterSpacing:'-.02em' },
  sheetSub:   { fontSize:12.5, color:'rgba(255,255,255,.55)', textAlign:'center' },
  pulseWrap:  { position:'relative', width:110, height:110, display:'flex', alignItems:'center',
    justifyContent:'center', margin:'14px 0 20px' },
  pulseRing:  { position:'absolute', inset:0, borderRadius:'50%', border:`2px solid ${TEAL}`,
    animation:'nfcPulse 1.8s ease-out infinite' },
  pulseCore:  { width:72, height:72, borderRadius:'50%', background:`${TEAL}1e`,
    border:`2px solid ${TEAL}`, display:'flex', alignItems:'center', justifyContent:'center',
    fontSize:30, color:TEAL },

  toast: { position:'fixed', left:'50%', bottom:26, transform:'translateX(-50%)', zIndex:130,
    background:'rgba(0,0,0,.9)', border:'1px solid rgba(255,255,255,.16)', borderRadius:22,
    padding:'10px 18px', fontSize:13, maxWidth:'90vw', textAlign:'center' },
};
