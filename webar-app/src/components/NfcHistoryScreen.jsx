import { useState } from 'react';
import { loadNfcHistory, clearNfcHistory } from '../hooks/useNfc.js';

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const TEAL = "#00C9A7";

const DIRECTION_ICON = { read: '📥', write: '📤', erase: '🗑️' };

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function NfcHistoryScreen({ onBack }) {
  const [history, setHistory] = useState(() => loadNfcHistory());

  const handleClear = () => {
    if (!window.confirm('Clear all NFC scan history? This only removes the list on this device.')) return;
    clearNfcHistory();
    setHistory([]);
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'linear-gradient(160deg,#061A1F 0%,#0A2229 50%,#061820 100%)',
      display:'flex', flexDirection:'column', fontFamily:FONT, overflow:'hidden' }}>

      <button onClick={onBack} style={{ position:'fixed', top:48, left:16, zIndex:2,
        background:'transparent', border:'1.5px solid rgba(255,255,255,0.2)', borderRadius:20,
        color:'rgba(255,255,255,0.7)', fontSize:13, fontWeight:600, fontFamily:FONT, padding:'7px 16px', cursor:'pointer' }}>
        ← Back
      </button>

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'96px 20px 8px' }}>
        <div style={{ fontSize:20, fontWeight:800, color:'#fff', fontFamily:FONT }}>Scan History</div>
        {history.length > 0 && (
          <button onClick={handleClear} style={{ background:'transparent', border:'none',
            color:'rgba(255,120,120,0.85)', fontSize:12, fontWeight:600, fontFamily:FONT, cursor:'pointer' }}>
            Clear all
          </button>
        )}
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:'12px 20px 40px', display:'flex', flexDirection:'column', gap:10 }}>
        {history.length === 0 ? (
          <div style={{ textAlign:'center', marginTop:60, color:'rgba(255,255,255,0.4)', fontSize:13 }}>
            No scans yet. Read or write a tag and it'll show up here.
          </div>
        ) : (
          history.map((h) => (
            <div key={h.id} style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)',
              borderRadius:14, padding:'12px 14px', display:'flex', alignItems:'center', gap:12 }}>
              <span style={{ fontSize:22 }}>{DIRECTION_ICON[h.direction] || '📄'}</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:11, fontWeight:700, color:TEAL, letterSpacing:'0.06em', marginBottom:2 }}>
                  {h.direction === 'read' ? 'READ' : h.direction === 'write' ? ('WROTE · ' + h.type.toUpperCase()) : 'ERASED'}
                </div>
                <div style={{ fontSize:13.5, color:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {h.summary || '—'}
                </div>
              </div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', flexShrink:0 }}>{timeAgo(h.at)}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
