import { useEffect, useState } from 'react';
import { isNfcSupported, getNfcStatus, openNfcSettings } from '../hooks/useNfc.js';

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const TEAL = "#00C9A7";

const CARDS = [
  { key: 'read',    title: 'Read NFC Tag',   subtitle: 'Scan & view data',    color: '#6B8AFF' },
  { key: 'write',   title: 'Write NFC Tag',  subtitle: 'Write text, links & more', color: '#A855F7' },
  { key: 'clear',   title: 'Clear Tag Data', subtitle: 'Erase data from tag', color: '#FF7A62' },
  { key: 'history', title: 'Scan History',   subtitle: 'Recent reads & writes', color: '#60A5FA' },
];

export default function NfcDashboardScreen({ onBack, onRead, onWrite, onClear, onHistory }) {
  const [support, setSupport] = useState('checking'); // checking | ok | unsupported | disabled

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supported = await isNfcSupported();
      if (cancelled) return;
      if (!supported) { setSupport('unsupported'); return; }
      const status = await getNfcStatus();
      if (cancelled) return;
      setSupport(status === 'NFC_DISABLED' ? 'disabled' : 'ok');
    })();
    return () => { cancelled = true; };
  }, []);

  const handlers = { read: onRead, write: onWrite, clear: onClear, history: onHistory };

  return (
    <div style={{ position:'fixed', inset:0, background:'linear-gradient(160deg,#061A1F 0%,#0A2229 50%,#061820 100%)',
      display:'flex', flexDirection:'column', fontFamily:FONT, overflow:'hidden' }}>

      <button onClick={onBack} style={{ position:'fixed', top:48, left:16, zIndex:2,
        background:'transparent', border:'1.5px solid rgba(255,255,255,0.2)', borderRadius:20,
        color:'rgba(255,255,255,0.7)', fontSize:13, fontWeight:600, fontFamily:FONT, padding:'7px 16px', cursor:'pointer' }}>
        ← Back
      </button>

      <div style={{ padding:'96px 20px 8px' }}>
        <div style={{ fontSize:22, fontWeight:800, color:'#fff', fontFamily:FONT }}>NFC Tag</div>
        <div style={{ fontSize:12, color:'rgba(255,255,255,0.45)', fontFamily:FONT, marginTop:4 }}>
          Tap a tag with your phone to read or write data
        </div>
      </div>

      {support === 'unsupported' && (
        <div style={{ margin:'8px 20px', background:'rgba(255,107,107,0.12)', border:'1px solid rgba(255,107,107,0.35)',
          borderRadius:12, padding:'12px 16px', fontSize:12.5, color:'#FF9B9B', fontFamily:FONT }}>
          This device doesn't have NFC hardware, so this feature isn't available here.
        </div>
      )}
      {support === 'disabled' && (
        <div onClick={openNfcSettings} style={{ margin:'8px 20px', cursor:'pointer', background:'rgba(255,193,7,0.12)', border:'1px solid rgba(255,193,7,0.35)',
          borderRadius:12, padding:'12px 16px', fontSize:12.5, color:'#FFD166', fontFamily:FONT }}>
          NFC is turned off on this device. Tap here to open settings and enable it.
        </div>
      )}

      <div style={{ flex:1, overflowY:'auto', padding:'12px 20px 40px', display:'flex', flexDirection:'column', gap:16 }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          {CARDS.map((c) => (
            <button key={c.key} onClick={handlers[c.key]}
              style={{ aspectRatio:'0.8', borderRadius:16, border:'none', cursor:'pointer',
                background:`linear-gradient(160deg, ${c.color}, ${c.color}cc)`,
                display:'flex', flexDirection:'column', justifyContent:'flex-end',
                padding:16, textAlign:'left', fontFamily:FONT }}>
              <div style={{ fontSize:16, fontWeight:800, color:'#fff', marginBottom:2 }}>{c.title}</div>
              <div style={{ fontSize:11.5, color:'rgba(255,255,255,0.85)', marginBottom:14 }}>{c.subtitle}</div>
              <div style={{ background:'#fff', color:c.color, borderRadius:8, padding:'8px 0', textAlign:'center', fontSize:12.5, fontWeight:800 }}>
                {c.title.split(' ')[0]} →
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
