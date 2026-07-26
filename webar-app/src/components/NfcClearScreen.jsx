import { useState, useCallback, useRef } from 'react';
import { startNfcScan, stopNfcScan, addNfcListener, eraseNfcTag } from '../hooks/useNfc.js';

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const TEAL = "#00C9A7";

export default function NfcClearScreen({ onBack }) {
  const [phase, setPhase] = useState('idle'); // idle | waiting | success | error
  const [error, setError] = useState('');
  const listenerRef = useRef(null);

  const cancelScan = useCallback(async () => {
    if (listenerRef.current) { await listenerRef.current.remove(); listenerRef.current = null; }
    await stopNfcScan();
    setPhase('idle');
  }, []);

  const startClear = useCallback(async () => {
    setPhase('waiting'); setError('');
    try {
      await startNfcScan({ alertMessage: 'Hold the tag near the back of your phone to erase it.' });
      listenerRef.current = addNfcListener(async () => {
        try {
          await eraseNfcTag();
          setPhase('success');
        } catch (e) {
          setError(e.message || 'Failed to erase tag. It may be read-only or out of range.');
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
  }, []);

  return (
    <div style={{ position:'fixed', inset:0, background:'linear-gradient(160deg,#061A1F 0%,#0A2229 50%,#061820 100%)',
      display:'flex', flexDirection:'column', fontFamily:FONT, overflow:'hidden' }}>

      <button onClick={onBack} style={{ position:'fixed', top:48, left:16, zIndex:2,
        background:'transparent', border:'1.5px solid rgba(255,255,255,0.2)', borderRadius:20,
        color:'rgba(255,255,255,0.7)', fontSize:13, fontWeight:600, fontFamily:FONT, padding:'7px 16px', cursor:'pointer' }}>
        ← Back
      </button>

      <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'0 24px', gap:18 }}>
        {phase === 'idle' && (
          <>
            <div style={{ fontSize:48 }}>🗑️</div>
            <div style={{ fontSize:16, fontWeight:700, color:'#fff', textAlign:'center' }}>Clear Tag Data</div>
            <div style={{ fontSize:13, color:'rgba(255,255,255,0.5)', textAlign:'center', maxWidth:280 }}>
              This erases everything written on the tag. This can't be undone.
            </div>
            <button onClick={startClear} style={{ marginTop:8, background:`linear-gradient(135deg, #FF7A62, #FF9B85)`,
              border:'none', borderRadius:50, color:'#2a0f0a', fontSize:14, fontWeight:700, fontFamily:FONT, padding:'13px 32px', cursor:'pointer' }}>
              Start
            </button>
          </>
        )}

        {phase === 'waiting' && (
          <>
            <div style={{ fontSize:56 }}>📡</div>
            <div style={{ fontSize:15, fontWeight:700, color:'#fff', textAlign:'center' }}>Hold the tag near your phone…</div>
            <button onClick={cancelScan} style={{ background:'transparent', border:'1.5px solid rgba(255,255,255,0.25)',
              borderRadius:50, color:'rgba(255,255,255,0.7)', fontSize:13, fontFamily:FONT, padding:'10px 24px', cursor:'pointer' }}>
              Cancel
            </button>
          </>
        )}

        {phase === 'success' && (
          <>
            <div style={{ fontSize:48 }}>✅</div>
            <div style={{ fontSize:15, fontWeight:700, color:'#fff' }}>Tag cleared successfully!</div>
            <button onClick={onBack} style={{ background:`linear-gradient(135deg, ${TEAL}, #00E5CC)`, border:'none',
              borderRadius:50, color:'#040D0B', fontSize:14, fontWeight:700, fontFamily:FONT, padding:'12px 28px', cursor:'pointer' }}>
              Done
            </button>
          </>
        )}

        {phase === 'error' && (
          <>
            <div style={{ fontSize:48 }}>⚠️</div>
            <div style={{ fontSize:14, color:'#FF9B9B', textAlign:'center' }}>{error}</div>
            <button onClick={() => setPhase('idle')} style={{ background:'transparent', border:'1.5px solid rgba(255,255,255,0.25)',
              borderRadius:50, color:'rgba(255,255,255,0.7)', fontSize:13, fontFamily:FONT, padding:'10px 24px', cursor:'pointer' }}>
              Try Again
            </button>
          </>
        )}
      </div>
    </div>
  );
}
