import { useEffect, useRef, useState, useCallback } from 'react';
import { startNfcScan, stopNfcScan, addNfcListener, decodeNdefRecord, recordReadHistory } from '../hooks/useNfc.js';

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const TEAL = "#00C9A7";

export default function NfcReadScreen({ onBack }) {
  const [phase, setPhase] = useState('waiting'); // waiting | found | error
  const [records, setRecords] = useState([]);
  const [error, setError] = useState('');
  const listenerRef = useRef(null);

  const startScan = useCallback(async () => {
    setPhase('waiting'); setError(''); setRecords([]);
    try {
      await startNfcScan({ alertMessage: 'Hold the tag near the back of your phone to read.' });
      listenerRef.current = addNfcListener((event) => {
        const decoded = (event?.tag?.ndefMessage || []).map(decodeNdefRecord);
        setRecords(decoded);
        setPhase('found');
        recordReadHistory(decoded[0]?.value || (decoded.length ? decoded[0].label : 'Empty tag'));
        stopNfcScan();
        if (listenerRef.current) { listenerRef.current.remove(); listenerRef.current = null; }
      });
    } catch (e) {
      setError(e.message || 'NFC is not available on this device.');
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    startScan();
    return () => {
      if (listenerRef.current) listenerRef.current.remove();
      stopNfcScan();
    };
  }, [startScan]);

  return (
    <div style={{ position:'fixed', inset:0, background:'linear-gradient(160deg,#061A1F 0%,#0A2229 50%,#061820 100%)',
      display:'flex', flexDirection:'column', fontFamily:FONT, overflow:'hidden' }}>

      <button onClick={onBack} style={{ position:'fixed', top:48, left:16, zIndex:2,
        background:'transparent', border:'1.5px solid rgba(255,255,255,0.2)', borderRadius:20,
        color:'rgba(255,255,255,0.7)', fontSize:13, fontWeight:600, fontFamily:FONT, padding:'7px 16px', cursor:'pointer' }}>
        ← Back
      </button>

      <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'0 24px', gap:18 }}>
        {phase === 'waiting' && (
          <>
            <div style={{ fontSize:56 }}>📡</div>
            <div style={{ fontSize:16, fontWeight:700, color:'#fff', textAlign:'center' }}>Hold a tag near your phone…</div>
          </>
        )}

        {phase === 'found' && (
          <div style={{ width:'100%', maxWidth:360, display:'flex', flexDirection:'column', gap:12 }}>
            <div style={{ fontSize:40, textAlign:'center' }}>✅</div>
            {records.length === 0 && (
              <div style={{ textAlign:'center', color:'rgba(255,255,255,0.55)', fontSize:13 }}>Tag detected, but it has no readable data.</div>
            )}
            {records.map((r, i) => (
              <div key={i} style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)',
                borderRadius:14, padding:'14px 16px' }}>
                <div style={{ fontSize:11, fontWeight:700, color:TEAL, letterSpacing:'0.08em', marginBottom:6 }}>{r.label.toUpperCase()}</div>
                <div style={{ fontSize:14, color:'#fff', wordBreak:'break-word', whiteSpace:'pre-wrap' }}>{r.value || '—'}</div>
              </div>
            ))}
            <button onClick={startScan} style={{ marginTop:8, width:'100%', background:`linear-gradient(135deg, ${TEAL}, #00E5CC)`,
              border:'none', borderRadius:50, color:'#040D0B', fontSize:14, fontWeight:700, fontFamily:FONT, padding:'13px', cursor:'pointer' }}>
              Scan Another Tag
            </button>
          </div>
        )}

        {phase === 'error' && (
          <>
            <div style={{ fontSize:48 }}>⚠️</div>
            <div style={{ fontSize:14, color:'#FF9B9B', textAlign:'center' }}>{error}</div>
            <button onClick={startScan} style={{ background:'transparent', border:'1.5px solid rgba(255,255,255,0.25)',
              borderRadius:50, color:'rgba(255,255,255,0.7)', fontSize:13, fontFamily:FONT, padding:'10px 24px', cursor:'pointer' }}>
              Try Again
            </button>
          </>
        )}
      </div>
    </div>
  );
}
