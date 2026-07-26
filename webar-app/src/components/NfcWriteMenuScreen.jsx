import { useState, useCallback, useRef } from 'react';
import { startNfcScan, stopNfcScan, addNfcListener, writeNfcTag } from '../hooks/useNfc.js';

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const TEAL = "#00C9A7";

const TYPES = [
  { key: 'text',     label: 'Text',         icon: '📝' },
  { key: 'contact',  label: 'Contact',      icon: '👤' },
  { key: 'url',      label: 'URL',          icon: '🔗' },
  { key: 'social',   label: 'Social Media', icon: '📱' },
  { key: 'wifi',     label: 'Wi-Fi',        icon: '📶' },
  { key: 'email',    label: 'E-mail',       icon: '✉️' },
  { key: 'location', label: 'Location',     icon: '📍' },
];

const FIELD_SETS = {
  text:     [{ key: 'text', label: 'Text', placeholder: 'Whatever you want the tag to say' }],
  url:      [{ key: 'url', label: 'URL', placeholder: 'https://example.com' }],
  social:   [{ key: 'url', label: 'Profile link', placeholder: 'https://instagram.com/yourname' }],
  contact:  [
    { key: 'name',  label: 'Name', placeholder: 'Jane Doe' },
    { key: 'phone', label: 'Phone', placeholder: '+1 555 123 4567' },
    { key: 'email', label: 'Email', placeholder: 'jane@example.com' },
    { key: 'org',   label: 'Company (optional)', placeholder: '', optional: true },
  ],
  wifi: [
    { key: 'ssid',     label: 'Network name (SSID)', placeholder: 'MyWiFi' },
    { key: 'password', label: 'Password', placeholder: '', optional: true },
  ],
  email: [
    { key: 'address', label: 'To', placeholder: 'someone@example.com' },
    { key: 'subject', label: 'Subject (optional)', placeholder: '', optional: true },
    { key: 'body',    label: 'Message (optional)', placeholder: '', optional: true },
  ],
  location: [
    { key: 'lat', label: 'Latitude', placeholder: '12.9716' },
    { key: 'lng', label: 'Longitude', placeholder: '77.5946' },
  ],
};

export default function NfcWriteMenuScreen({ onBack, onHistory }) {
  const [selected, setSelected] = useState(null); // type key
  const [values, setValues]     = useState({});
  const [phase, setPhase]       = useState('idle'); // idle | waiting | success | error
  const [error, setError]       = useState('');
  const listenerRef = useRef(null);

  const fields = selected ? FIELD_SETS[selected] : null;
  const canWrite = selected && fields.every((f) => f.optional || !!(values[f.key] || '').trim());

  const reset = useCallback(() => {
    setSelected(null); setValues({}); setPhase('idle'); setError('');
  }, []);

  const cancelScan = useCallback(async () => {
    if (listenerRef.current) { await listenerRef.current.remove(); listenerRef.current = null; }
    await stopNfcScan();
    setPhase('idle');
  }, []);

  const handleWrite = useCallback(async () => {
    setPhase('waiting'); setError('');
    try {
      await startNfcScan({ alertMessage: 'Hold the tag near the back of your phone to write.' });
      listenerRef.current = addNfcListener(async () => {
        try {
          await writeNfcTag(selected, values);
          setPhase('success');
        } catch (e) {
          setError(e.message || 'Failed to write to tag. It may be read-only or out of range.');
          setPhase('error');
        } finally {
          if (listenerRef.current) { listenerRef.current.remove(); listenerRef.current = null; }
          stopNfcScan();
        }
      });
    } catch (e) {
      setError(e.message || 'NFC is not available on this device.');
      setPhase('error');
    }
  }, [selected, values]);

  return (
    <div style={{ position:'fixed', inset:0, background:'linear-gradient(160deg,#061A1F 0%,#0A2229 50%,#061820 100%)',
      display:'flex', flexDirection:'column', fontFamily:FONT, overflow:'hidden' }}>

      <button onClick={selected ? reset : onBack} style={{ position:'fixed', top:48, left:16, zIndex:2,
        background:'transparent', border:'1.5px solid rgba(255,255,255,0.2)', borderRadius:20,
        color:'rgba(255,255,255,0.7)', fontSize:13, fontWeight:600, fontFamily:FONT, padding:'7px 16px', cursor:'pointer' }}>
        ← Back
      </button>

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'96px 20px 8px' }}>
        <div style={{ fontSize:20, fontWeight:800, color:'#fff', fontFamily:FONT }}>Write NFC Tag</div>
        {!selected && (
          <button onClick={onHistory} style={{ background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.18)',
            borderRadius:20, color:'rgba(255,255,255,0.75)', fontSize:12, fontWeight:600, fontFamily:FONT, padding:'7px 14px', cursor:'pointer' }}>
            History
          </button>
        )}
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:'12px 20px 40px' }}>
        {!selected && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            {TYPES.map((t) => (
              <button key={t.key} onClick={() => setSelected(t.key)}
                style={{ aspectRatio:'1', borderRadius:16, border:'1px solid rgba(255,255,255,0.1)', cursor:'pointer',
                  background:'rgba(255,255,255,0.05)', display:'flex', flexDirection:'column', alignItems:'center',
                  justifyContent:'center', gap:8, fontFamily:FONT }}>
                <span style={{ fontSize:30 }}>{t.icon}</span>
                <span style={{ fontSize:13, fontWeight:700, color:'#fff' }}>{t.label}</span>
              </button>
            ))}
          </div>
        )}

        {selected && phase === 'idle' && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ fontSize:13, fontWeight:700, color:TEAL, fontFamily:FONT, letterSpacing:'0.06em' }}>
              {TYPES.find((t) => t.key === selected)?.icon} {TYPES.find((t) => t.key === selected)?.label.toUpperCase()}
            </div>
            {fields.map((f) => (
              <div key={f.key}>
                <div style={{ fontSize:12, fontWeight:700, color:'rgba(255,255,255,0.6)', marginBottom:6 }}>{f.label}</div>
                <input value={values[f.key] || ''} placeholder={f.placeholder}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  style={{ width:'100%', background:'rgba(255,255,255,0.07)', border:'1.5px solid rgba(255,255,255,0.15)',
                    borderRadius:12, padding:'12px 14px', fontSize:14, color:'#fff', fontFamily:FONT, outline:'none', boxSizing:'border-box' }} />
              </div>
            ))}
            <button onClick={handleWrite} disabled={!canWrite}
              style={{ marginTop:8, width:'100%', background: canWrite ? `linear-gradient(135deg, ${TEAL}, #00E5CC)` : 'rgba(255,255,255,0.08)',
                border:'none', borderRadius:50, color: canWrite ? '#040D0B' : 'rgba(255,255,255,0.3)',
                fontSize:15, fontWeight:700, fontFamily:FONT, padding:'14px', cursor: canWrite ? 'pointer' : 'not-allowed' }}>
              Write to Tag
            </button>
          </div>
        )}

        {phase === 'waiting' && (
          <div style={{ textAlign:'center', padding:'40px 20px', display:'flex', flexDirection:'column', alignItems:'center', gap:16 }}>
            <div style={{ fontSize:48 }}>📡</div>
            <div style={{ fontSize:15, fontWeight:700, color:'#fff', fontFamily:FONT }}>Hold the tag near your phone…</div>
            <button onClick={cancelScan} style={{ background:'transparent', border:'1.5px solid rgba(255,255,255,0.25)',
              borderRadius:50, color:'rgba(255,255,255,0.7)', fontSize:13, fontFamily:FONT, padding:'10px 24px', cursor:'pointer' }}>
              Cancel
            </button>
          </div>
        )}

        {phase === 'success' && (
          <div style={{ textAlign:'center', padding:'40px 20px', display:'flex', flexDirection:'column', alignItems:'center', gap:16 }}>
            <div style={{ fontSize:48 }}>✅</div>
            <div style={{ fontSize:15, fontWeight:700, color:'#fff', fontFamily:FONT }}>Tag written successfully!</div>
            <button onClick={reset} style={{ background:`linear-gradient(135deg, ${TEAL}, #00E5CC)`, border:'none',
              borderRadius:50, color:'#040D0B', fontSize:14, fontWeight:700, fontFamily:FONT, padding:'12px 28px', cursor:'pointer' }}>
              Write Another
            </button>
          </div>
        )}

        {phase === 'error' && (
          <div style={{ textAlign:'center', padding:'40px 20px', display:'flex', flexDirection:'column', alignItems:'center', gap:16 }}>
            <div style={{ fontSize:48 }}>⚠️</div>
            <div style={{ fontSize:14, color:'#FF9B9B', fontFamily:FONT, textAlign:'center' }}>{error}</div>
            <button onClick={() => setPhase('idle')} style={{ background:'transparent', border:'1.5px solid rgba(255,255,255,0.25)',
              borderRadius:50, color:'rgba(255,255,255,0.7)', fontSize:13, fontFamily:FONT, padding:'10px 24px', cursor:'pointer' }}>
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
