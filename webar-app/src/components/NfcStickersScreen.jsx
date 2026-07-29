import { useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE } from '../config/api.js';
import { isNfcSupported, startNfcScan, stopNfcScan, addNfcListener, decodeNdefRecord, writeNfcTag } from '../hooks/useNfc.js';

// What actually goes on the chip. Nothing else is ever written — the whole
// point of the platform is that this URL never has to change.
const tapUrl = (code) => `${window.location.origin}/nfc/${code}`;

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const TEAL = "#00C9A7";
const GOLD = "#C9A84C";
const VIOLET = "#8B5CF6";
const DANGER = "#FF6B6B";

const auth = () => ({
  'Content-Type': 'application/json',
  Authorization: 'Bearer ' + (localStorage.getItem('memoera_token') || ''),
});

// Block types the builder can add. Kept deliberately small and concrete —
// a vendor should recognise every one of these without reading documentation.
const BLOCK_KINDS = [
  { type: 'profile',  label: 'Profile',   icon: '👤', hint: 'Photo, name, bio' },
  { type: 'links',    label: 'Links',     icon: '🔗', hint: 'Instagram, website, anything' },
  { type: 'contact',  label: 'Contact',   icon: '📞', hint: 'Call, WhatsApp, email buttons' },
  { type: 'text',     label: 'Text',      icon: '📝', hint: 'About, notes, offers' },
  { type: 'map',      label: 'Location',  icon: '📍', hint: 'Opens Google Maps' },
  { type: 'hours',    label: 'Hours',     icon: '🕐', hint: 'Opening times' },
];

const newBlock = (type) => ({
  profile: { type, name: '', tagline: '', bio: '', photoUrl: '' },
  links:   { type, items: [{ label: '', url: '', icon: '🔗' }] },
  contact: { type, phone: '', whatsapp: '', email: '' },
  text:    { type, title: '', body: '' },
  map:     { type, label: '', query: '' },
  hours:   { type, title: 'Opening hours', rows: [{ day: 'Mon – Sat', time: '10:00 – 19:00' }] },
}[type]);

export default function NfcStickersScreen({ onBack, user }) {
  const [tab, setTab] = useState('stickers'); // stickers | experiences | admin
  const [stickers, setStickers] = useState([]);
  const [experiences, setExperiences] = useState([]);
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(true);

  const say = useCallback((m) => { setToast(m); setTimeout(() => setToast(''), 3200); }, []);

  const loadStickers = useCallback(async () => {
    try {
      const r = await fetch(API_BASE + '/api/nfc/mine', { headers: auth() });
      if (r.ok) setStickers((await r.json()).stickers || []);
    } catch { /* offline — keep whatever we already showed */ }
  }, []);

  const loadExperiences = useCallback(async () => {
    try {
      const r = await fetch(API_BASE + '/api/nfc/experiences', { headers: auth() });
      if (r.ok) setExperiences((await r.json()).experiences || []);
    } catch { /* as above */ }
  }, []);

  useEffect(() => {
    Promise.all([loadStickers(), loadExperiences()]).finally(() => setLoading(false));
  }, [loadStickers, loadExperiences]);

  return (
    <div style={st.screen}>
      <div style={st.header}>
        <button onClick={onBack} style={st.back}>← Back</button>
        <div>
          <div style={st.title}>My NFC</div>
          <div style={st.sub}>One sticker, anything you want it to open</div>
        </div>
      </div>

      <div style={st.tabs}>
        <Tab on={tab === 'stickers'} onClick={() => setTab('stickers')}>Stickers</Tab>
        <Tab on={tab === 'experiences'} onClick={() => setTab('experiences')}>Experiences</Tab>
        {user?.isAdmin && <Tab on={tab === 'admin'} onClick={() => setTab('admin')}>Admin</Tab>}
      </div>

      <div style={st.body}>
        {loading && <div style={st.muted}>Loading…</div>}

        {!loading && tab === 'stickers' && (
          <StickersTab stickers={stickers} experiences={experiences}
            reload={loadStickers} say={say} />
        )}
        {!loading && tab === 'experiences' && (
          <ExperiencesTab experiences={experiences} reload={loadExperiences} say={say} />
        )}
        {!loading && tab === 'admin' && user?.isAdmin && <AdminTab say={say} />}
      </div>

      {toast && <div style={st.toast}>{toast}</div>}
    </div>
  );
}

// ── Stickers ────────────────────────────────────────────────────────────────

function StickersTab({ stickers, experiences, reload, say }) {
  const [code, setCode] = useState('');
  const [secret, setSecret] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [analytics, setAnalytics] = useState(null); // { id, data }

  // Reading the chip just fills the ID in — the printed activation code is
  // still required, because the ID alone is guessable.
  const readFromTag = useCallback(async () => {
    if (!(await isNfcSupported())) { say('This device can’t read NFC tags.'); return; }
    setScanning(true);
    const remove = addNfcListener((event) => {
      const recs = event?.nfcTag?.message?.records || event?.message?.records || [];
      for (const r of recs) {
        const text = decodeNdefRecord(r)?.data || '';
        const m = String(text).toUpperCase().match(/MEM-NFC-\d+/);
        if (m) { setCode(m[0]); say('Sticker ID read from the tag.'); break; }
      }
      setScanning(false);
      stopNfcScan().catch(() => {});
      remove?.();
    });
    try {
      await startNfcScan({ alertMessage: 'Hold your phone near the MemoEra sticker' });
    } catch {
      say('Could not start NFC scanning.');
      setScanning(false);
      remove?.();
    }
  }, [say]);

  const activate = async () => {
    if (!code.trim() || !secret.trim()) { say('Enter the sticker ID and its activation code.'); return; }
    setBusy(true);
    try {
      const r = await fetch(API_BASE + '/api/nfc/activate', {
        method: 'POST', headers: auth(),
        body: JSON.stringify({ code: code.trim(), secret: secret.trim(), name: name.trim() }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { say(d.error || 'Activation failed.'); return; }
      say('Sticker activated.');
      setCode(''); setSecret(''); setName('');
      reload();
    } catch { say('Network error — please try again.'); } finally { setBusy(false); }
  };

  const assign = async (stickerId, experienceId) => {
    try {
      const r = await fetch(API_BASE + '/api/nfc/sticker', {
        method: 'PUT', headers: auth(),
        body: JSON.stringify({ id: stickerId, experienceId: Number(experienceId) }),
      });
      if (!r.ok) { say('Could not update the sticker.'); return; }
      say('Updated — a tap now opens this experience.');
      reload();
    } catch { say('Network error.'); }
  };

  const release = async (s) => {
    if (!window.confirm(`Release "${s.name}"? It leaves your account and can be activated by whoever holds it next.`)) return;
    try {
      const r = await fetch(API_BASE + '/api/nfc/sticker', {
        method: 'PUT', headers: auth(), body: JSON.stringify({ id: s.id, release: true }),
      });
      if (!r.ok) { say('Could not release the sticker.'); return; }
      say('Sticker released.');
      reload();
    } catch { say('Network error.'); }
  };

  // Puts the sticker's URL onto a physical chip. Stickers that arrive
  // pre-encoded from the manufacturer never need this — it's for blank tags
  // and for re-encoding one that was wiped.
  const [writing, setWriting] = useState(null); // sticker id being written
  const writeListener = useRef(null);

  const stopWriting = useCallback(async () => {
    if (writeListener.current) { await writeListener.current.remove(); writeListener.current = null; }
    await stopNfcScan();
    setWriting(null);
  }, []);

  useEffect(() => () => { stopWriting(); }, [stopWriting]);

  const writeToChip = async (s) => {
    if (writing) { stopWriting(); return; }
    if (!(await isNfcSupported())) { say('This device can’t write NFC tags.'); return; }
    setWriting(s.id);
    try {
      await startNfcScan({ alertMessage: 'Hold the blank sticker against the back of your phone' });
      writeListener.current = addNfcListener(async () => {
        try {
          await writeNfcTag('url', { url: tapUrl(s.code) });
          say('Written. Tapping this sticker now opens your experience.');
        } catch (e) {
          say(e.message || 'Could not write to that tag — it may be read-only.');
        } finally { stopWriting(); }
      });
    } catch (e) {
      say(e.message || 'NFC is not available on this device.');
      setWriting(null);
    }
  };

  const openAnalytics = async (s) => {
    if (analytics?.id === s.id) { setAnalytics(null); return; }
    try {
      const r = await fetch(`${API_BASE}/api/nfc/analytics?id=${s.id}`, { headers: auth() });
      if (!r.ok) { say('Could not load analytics.'); return; }
      setAnalytics({ id: s.id, data: await r.json() });
    } catch { say('Network error.'); }
  };

  return (
    <>
      <Card>
        <div style={st.h2}>Activate a sticker</div>
        <div style={st.hint}>
          Both are on the card your sticker came on. Tapping the sticker fills the ID in for you.
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <input value={code} onChange={(e) => setCode(e.target.value)}
            placeholder="MEM-NFC-00000001" style={{ ...st.input, flex: 1 }} />
          <button onClick={readFromTag} disabled={scanning} style={st.ghost}>
            {scanning ? 'Hold near…' : 'Tap to read'}
          </button>
        </div>
        <input value={secret} onChange={(e) => setSecret(e.target.value.toUpperCase())}
          placeholder="Activation code (8 characters)" maxLength={8}
          style={{ ...st.input, marginTop: 8, letterSpacing: '0.2em', fontFamily: 'ui-monospace, monospace' }} />
        <input value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Name it — e.g. My phone sticker" style={{ ...st.input, marginTop: 8 }} />
        <button onClick={activate} disabled={busy} style={{ ...st.primary, marginTop: 12, width: '100%' }}>
          {busy ? 'Activating…' : 'Activate'}
        </button>
      </Card>

      {stickers.length === 0 ? (
        <div style={{ ...st.muted, textAlign: 'center', padding: '30px 0' }}>
          No stickers on your account yet.
        </div>
      ) : stickers.map((s) => (
        <Card key={s.id}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 800 }}>{s.name || 'Untitled sticker'}</div>
              <button onClick={() => {
                navigator.clipboard?.writeText(tapUrl(s.code))
                  .then(() => say('Tap link copied.'))
                  .catch(() => say('Could not copy.'));
              }} style={{ ...st.code, background: 'transparent', border: 'none', padding: 0,
                cursor: 'pointer', textAlign: 'left', display: 'block', maxWidth: '100%',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.code} · copy link
              </button>
            </div>
            <span style={s.status === 'active' ? st.pillOk : st.pillWarn}>
              {s.status === 'active' ? 'Active' : s.status}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
            <Stat label="Taps" value={s.tapCount} />
            <Stat label="Last tap" value={s.lastTapAt ? timeAgo(s.lastTapAt) : 'Never'} />
          </div>

          <div style={{ ...st.hint, marginTop: 12 }}>A tap opens</div>
          <select value={s.experienceId || 0} onChange={(e) => assign(s.id, e.target.value)}
            style={{ ...st.input, marginTop: 5 }}>
            <option value={0}>Nothing yet — choose an experience</option>
            {experiences.map((e) => <option key={e.id} value={e.id}>{e.title || 'Untitled'}</option>)}
          </select>

          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button onClick={() => writeToChip(s)}
              style={writing === s.id ? { ...st.ghost, borderColor: GOLD, color: GOLD } : st.ghost}>
              {writing === s.id ? 'Hold sticker near… (cancel)' : 'Write to chip'}
            </button>
            <button onClick={() => openAnalytics(s)} style={st.ghost}>
              {analytics?.id === s.id ? 'Hide analytics' : 'Analytics'}
            </button>
            <a href={`/nfc/${s.code}`} target="_blank" rel="noopener noreferrer" style={st.ghostLink}>
              Preview
            </a>
            <button onClick={() => release(s)} style={{ ...st.ghost, color: DANGER, borderColor: DANGER + '66' }}>
              Release
            </button>
          </div>

          {analytics?.id === s.id && <Analytics data={analytics.data} />}
        </Card>
      ))}
    </>
  );
}

function Analytics({ data }) {
  return (
    <div style={{ marginTop: 12, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 12 }}>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Stat label="Total taps" value={data.total} />
        <Stat label="Unique" value={data.unique} />
        <Stat label="Repeat" value={data.repeat} />
        <Stat label="Last 7 days" value={data.last7Days} />
      </div>
      {[['Devices', data.platforms], ['Browsers', data.browsers], ['Countries', data.countries]]
        .filter(([, rows]) => rows?.length).map(([title, rows]) => (
        <div key={title} style={{ marginTop: 12 }}>
          <div style={st.hint}>{title}</div>
          {rows.map((r, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between',
              fontSize: 12.5, padding: '3px 0', color: 'rgba(255,255,255,0.75)' }}>
              <span>{r.label}</span><span style={{ fontWeight: 700 }}>{r.count}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Experiences ─────────────────────────────────────────────────────────────

function ExperiencesTab({ experiences, reload, say }) {
  const [editing, setEditing] = useState(null); // { id, title, theme, blocks }

  const save = async (exp) => {
    try {
      const r = await fetch(API_BASE + '/api/nfc/experiences', {
        method: 'PUT', headers: auth(),
        body: JSON.stringify({ id: exp.id || 0, title: exp.title, theme: exp.theme, blocks: exp.blocks }),
      });
      if (!r.ok) { say('Could not save.'); return; }
      say('Saved.');
      setEditing(null);
      reload();
    } catch { say('Network error.'); }
  };

  const remove = async (exp) => {
    if (!window.confirm(`Delete "${exp.title || 'Untitled'}"? Any sticker using it will show nothing.`)) return;
    try {
      await fetch(`${API_BASE}/api/nfc/experiences?id=${exp.id}`, { method: 'DELETE', headers: auth() });
      say('Deleted.');
      reload();
    } catch { say('Network error.'); }
  };

  if (editing) {
    return <ExperienceEditor value={editing} onChange={setEditing}
      onSave={() => save(editing)} onCancel={() => setEditing(null)} />;
  }

  return (
    <>
      <button onClick={() => setEditing({ id: 0, title: '', theme: 'midnight', blocks: [newBlock('profile')] })}
        style={{ ...st.primary, width: '100%' }}>+ New experience</button>

      {experiences.length === 0 ? (
        <div style={{ ...st.muted, textAlign: 'center', padding: '30px 0' }}>
          Nothing built yet. An experience is what a tap opens.
        </div>
      ) : experiences.map((e) => (
        <Card key={e.id}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 800 }}>{e.title || 'Untitled'}</div>
              <div style={st.hint}>
                {(e.blocks || []).length} block{(e.blocks || []).length === 1 ? '' : 's'} · {e.theme}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={() => setEditing({ ...e, blocks: e.blocks || [] })} style={st.ghost}>Edit</button>
            <button onClick={() => remove(e)} style={{ ...st.ghost, color: DANGER, borderColor: DANGER + '66' }}>
              Delete
            </button>
          </div>
        </Card>
      ))}
    </>
  );
}

function ExperienceEditor({ value, onChange, onSave, onCancel }) {
  const set = (patch) => onChange({ ...value, ...patch });
  const setBlock = (i, b) => set({ blocks: value.blocks.map((x, j) => (j === i ? b : x)) });
  const removeBlock = (i) => set({ blocks: value.blocks.filter((_, j) => j !== i) });
  const move = (i, d) => {
    const next = [...value.blocks];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    set({ blocks: next });
  };

  return (
    <>
      <Card>
        <input value={value.title} onChange={(e) => set({ title: e.target.value })}
          placeholder="Experience name — e.g. My card" style={st.input} />
        <div style={{ ...st.hint, marginTop: 12 }}>Theme</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
          {['midnight', 'teal', 'gold', 'light'].map((th) => (
            <button key={th} onClick={() => set({ theme: th })}
              style={{ ...st.chip, ...(value.theme === th ? st.chipOn : {}) }}>{th}</button>
          ))}
        </div>
      </Card>

      {value.blocks.map((b, i) => (
        <Card key={i}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 16 }}>{BLOCK_KINDS.find((k) => k.type === b.type)?.icon || '▦'}</span>
            <span style={{ fontWeight: 800, fontSize: 13.5, flex: 1, textTransform: 'capitalize' }}>{b.type}</span>
            <button onClick={() => move(i, -1)} disabled={i === 0} style={st.mini}>↑</button>
            <button onClick={() => move(i, 1)} disabled={i === value.blocks.length - 1} style={st.mini}>↓</button>
            <button onClick={() => removeBlock(i)} style={{ ...st.mini, color: DANGER }}>✕</button>
          </div>
          <BlockFields block={b} onChange={(nb) => setBlock(i, nb)} />
        </Card>
      ))}

      <Card>
        <div style={st.hint}>Add a block</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginTop: 8 }}>
          {BLOCK_KINDS.map((k) => (
            <button key={k.type} onClick={() => set({ blocks: [...value.blocks, newBlock(k.type)] })}
              style={st.addBlock}>
              <span style={{ fontSize: 18 }}>{k.icon}</span>
              <span style={{ fontSize: 11.5, fontWeight: 700 }}>{k.label}</span>
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', lineHeight: 1.3 }}>{k.hint}</span>
            </button>
          ))}
        </div>
      </Card>

      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        <button onClick={onCancel} style={{ ...st.ghost, flex: 1 }}>Cancel</button>
        <button onClick={onSave} style={{ ...st.primary, flex: 2 }}>Save experience</button>
      </div>
    </>
  );
}

function BlockFields({ block, onChange }) {
  const f = (k, v) => onChange({ ...block, [k]: v });

  switch (block.type) {
    case 'profile':
      return (<>
        <input style={st.input} placeholder="Name" value={block.name} onChange={(e) => f('name', e.target.value)} />
        <input style={{ ...st.input, marginTop: 8 }} placeholder="Tagline — e.g. Jewellery since 1994"
          value={block.tagline} onChange={(e) => f('tagline', e.target.value)} />
        <textarea style={{ ...st.input, marginTop: 8, minHeight: 68, resize: 'vertical' }}
          placeholder="Short bio" value={block.bio} onChange={(e) => f('bio', e.target.value)} />
        <input style={{ ...st.input, marginTop: 8 }} placeholder="Photo URL (optional)"
          value={block.photoUrl} onChange={(e) => f('photoUrl', e.target.value)} />
      </>);

    case 'links':
      return (<>
        {(block.items || []).map((it, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <input style={{ ...st.input, width: 52, textAlign: 'center' }} value={it.icon}
              onChange={(e) => f('items', block.items.map((x, j) => j === i ? { ...x, icon: e.target.value } : x))} />
            <input style={{ ...st.input, flex: 1 }} placeholder="Label" value={it.label}
              onChange={(e) => f('items', block.items.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
            <button style={{ ...st.mini, color: DANGER }}
              onClick={() => f('items', block.items.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        {(block.items || []).map((it, i) => (
          <input key={'u' + i} style={{ ...st.input, marginBottom: 8 }} placeholder="https://…" value={it.url}
            onChange={(e) => f('items', block.items.map((x, j) => j === i ? { ...x, url: e.target.value } : x))} />
        ))}
        <button style={st.ghost} onClick={() => f('items', [...(block.items || []), { label: '', url: '', icon: '🔗' }])}>
          + Add link
        </button>
      </>);

    case 'contact':
      return (<>
        <input style={st.input} placeholder="Phone" value={block.phone} onChange={(e) => f('phone', e.target.value)} />
        <input style={{ ...st.input, marginTop: 8 }} placeholder="WhatsApp number (with country code)"
          value={block.whatsapp} onChange={(e) => f('whatsapp', e.target.value)} />
        <input style={{ ...st.input, marginTop: 8 }} placeholder="Email"
          value={block.email} onChange={(e) => f('email', e.target.value)} />
      </>);

    case 'text':
      return (<>
        <input style={st.input} placeholder="Heading" value={block.title} onChange={(e) => f('title', e.target.value)} />
        <textarea style={{ ...st.input, marginTop: 8, minHeight: 88, resize: 'vertical' }}
          placeholder="Write anything" value={block.body} onChange={(e) => f('body', e.target.value)} />
      </>);

    case 'map':
      return (<>
        <input style={st.input} placeholder="Label — e.g. Visit our showroom"
          value={block.label} onChange={(e) => f('label', e.target.value)} />
        <input style={{ ...st.input, marginTop: 8 }} placeholder="Address or place name"
          value={block.query} onChange={(e) => f('query', e.target.value)} />
      </>);

    case 'hours':
      return (<>
        <input style={st.input} placeholder="Heading" value={block.title} onChange={(e) => f('title', e.target.value)} />
        {(block.rows || []).map((rw, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <input style={{ ...st.input, flex: 1 }} placeholder="Mon – Sat" value={rw.day}
              onChange={(e) => f('rows', block.rows.map((x, j) => j === i ? { ...x, day: e.target.value } : x))} />
            <input style={{ ...st.input, flex: 1 }} placeholder="10:00 – 19:00" value={rw.time}
              onChange={(e) => f('rows', block.rows.map((x, j) => j === i ? { ...x, time: e.target.value } : x))} />
            <button style={{ ...st.mini, color: DANGER }}
              onClick={() => f('rows', block.rows.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        <button style={{ ...st.ghost, marginTop: 8 }}
          onClick={() => f('rows', [...(block.rows || []), { day: '', time: '' }])}>+ Add row</button>
      </>);

    default:
      return null;
  }
}

// ── Admin ───────────────────────────────────────────────────────────────────

function AdminTab({ say }) {
  const [batches, setBatches] = useState([]);
  const [qty, setQty] = useState(50);
  const [batchCode, setBatchCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [minted, setMinted] = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(API_BASE + '/api/admin/nfc/batches', { headers: auth() });
      if (r.ok) setBatches((await r.json()).batches || []);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  const mint = async () => {
    setBusy(true);
    try {
      const r = await fetch(API_BASE + '/api/admin/nfc/batches', {
        method: 'POST', headers: auth(),
        body: JSON.stringify({ quantity: Number(qty), batchCode: batchCode.trim() }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { say(d.error || 'Could not create batch.'); return; }
      setMinted(d);
      say(`Minted ${d.stickers.length} sticker IDs.`);
      load();
    } catch { say('Network error.'); } finally { setBusy(false); }
  };

  // The activation secrets are only returned once, at mint time — this is the
  // moment to get them to the printer.
  const downloadCsv = () => {
    const rows = [['code', 'activation_secret', 'url'],
      ...minted.stickers.map((s) => [s.code, s.secret, s.url])];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = `${minted.batchCode}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <Card>
        <div style={st.h2}>Mint a manufacturing batch</div>
        <div style={st.hint}>
          MemoEra alone creates NFC identities. Each sticker gets a permanent
          MEM-NFC id plus a one-time activation code for its printed card.
        </div>
        <input style={{ ...st.input, marginTop: 12 }} placeholder="Batch code (optional)"
          value={batchCode} onChange={(e) => setBatchCode(e.target.value)} />
        <input style={{ ...st.input, marginTop: 8 }} type="number" min={1} max={10000}
          value={qty} onChange={(e) => setQty(e.target.value)} />
        <button onClick={mint} disabled={busy} style={{ ...st.primary, marginTop: 12, width: '100%' }}>
          {busy ? 'Minting…' : `Mint ${qty} stickers`}
        </button>
      </Card>

      {minted && (
        <Card>
          <div style={{ ...st.h2, color: GOLD }}>Download before leaving this screen</div>
          <div style={st.hint}>
            Activation codes are shown once. Without this file the batch can’t be printed.
          </div>
          <button onClick={downloadCsv} style={{ ...st.primary, marginTop: 12, width: '100%' }}>
            Download {minted.batchCode}.csv
          </button>
        </Card>
      )}

      {batches.map((b) => (
        <Card key={b.id}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>{b.batchCode}</div>
              <div style={st.hint}>{b.manufacturer}</div>
            </div>
            <span style={st.pillOk}>{b.activated}/{b.quantity} active</span>
          </div>
        </Card>
      ))}
    </>
  );
}

// ── Bits ────────────────────────────────────────────────────────────────────

const Card = ({ children }) => <div style={st.card}>{children}</div>;
const Tab = ({ on, onClick, children }) => (
  <button onClick={onClick} style={{ ...st.tab, ...(on ? st.tabOn : {}) }}>{children}</button>
);
const Stat = ({ label, value }) => (
  <div>
    <div style={{ fontSize: 18, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    <div style={st.hint}>{label}</div>
  </div>
);

function timeAgo(iso) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const st = {
  screen: { position: 'fixed', inset: 0, background: 'linear-gradient(170deg,#061A1F,#0A2229 55%,#061820)',
    display: 'flex', flexDirection: 'column', fontFamily: FONT, color: '#fff', overflow: 'hidden' },
  header: { padding: '48px 20px 12px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 },
  back: { background: 'transparent', border: '1.5px solid rgba(255,255,255,0.2)', borderRadius: 20,
    color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 600, fontFamily: FONT,
    padding: '7px 16px', cursor: 'pointer' },
  title: { fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' },
  sub: { fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 },
  tabs: { display: 'flex', gap: 8, padding: '4px 20px 12px', flexShrink: 0 },
  tab: { flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 12, color: 'rgba(255,255,255,0.6)', fontSize: 12.5, fontWeight: 700,
    fontFamily: FONT, padding: '9px 0', cursor: 'pointer' },
  tabOn: { background: 'rgba(0,201,167,0.14)', borderColor: TEAL, color: TEAL },
  body: { flex: 1, overflowY: 'auto', padding: '0 20px 40px' },
  card: { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 16, padding: 16, marginBottom: 12 },
  h2: { fontSize: 15, fontWeight: 800, marginBottom: 4 },
  hint: { fontSize: 11, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 },
  muted: { color: 'rgba(255,255,255,0.5)', fontSize: 13 },
  code: { fontFamily: 'ui-monospace, monospace', fontSize: 11.5, color: VIOLET, marginTop: 3 },
  input: { width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '11px 13px',
    fontSize: 13.5, color: '#fff', fontFamily: FONT, outline: 'none' },
  primary: { background: `linear-gradient(135deg, ${TEAL}, #00E5CC)`, border: 'none', borderRadius: 12,
    color: '#04211d', fontSize: 14, fontWeight: 800, fontFamily: FONT, padding: '13px 18px', cursor: 'pointer' },
  ghost: { background: 'transparent', border: `1px solid ${TEAL}66`, borderRadius: 10, color: TEAL,
    fontSize: 12, fontWeight: 700, fontFamily: FONT, padding: '9px 14px', cursor: 'pointer' },
  ghostLink: { background: 'transparent', border: `1px solid ${TEAL}66`, borderRadius: 10, color: TEAL,
    fontSize: 12, fontWeight: 700, fontFamily: FONT, padding: '9px 14px', textDecoration: 'none' },
  mini: { background: 'transparent', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 8,
    color: 'rgba(255,255,255,0.7)', fontSize: 12, width: 28, height: 28, cursor: 'pointer', padding: 0 },
  chip: { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)',
    borderRadius: 20, color: 'rgba(255,255,255,0.6)', fontSize: 11.5, fontWeight: 700,
    fontFamily: FONT, padding: '6px 13px', cursor: 'pointer', textTransform: 'capitalize' },
  chipOn: { background: 'rgba(139,92,246,0.18)', borderColor: VIOLET, color: '#C4B5FD' },
  addBlock: { background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(255,255,255,0.2)',
    borderRadius: 12, padding: '11px 6px', cursor: 'pointer', fontFamily: FONT, color: '#fff',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, textAlign: 'center' },
  pillOk: { fontSize: 10.5, fontWeight: 800, color: TEAL, background: 'rgba(0,201,167,0.14)',
    border: `1px solid ${TEAL}55`, borderRadius: 20, padding: '4px 10px', flexShrink: 0 },
  pillWarn: { fontSize: 10.5, fontWeight: 800, color: GOLD, background: 'rgba(201,168,76,0.14)',
    border: `1px solid ${GOLD}55`, borderRadius: 20, padding: '4px 10px', flexShrink: 0,
    textTransform: 'capitalize' },
  toast: { position: 'fixed', left: '50%', bottom: 28, transform: 'translateX(-50%)', zIndex: 60,
    background: 'rgba(0,0,0,0.88)', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 22,
    padding: '10px 18px', fontSize: 13, maxWidth: '90vw', textAlign: 'center' },
};
