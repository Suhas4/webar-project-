export default function UploadProgressOverlay({ compileState, progress }) {
  const isSaving     = compileState === 'saving';
  const isUploading  = compileState === 'uploading';
  const isFinalizing = compileState === 'finalizing';
  const isChecking   = compileState === 'checking';
  const isDone       = compileState === 'done';
  const displayProgress = isSaving || isFinalizing || isDone ? 100 : progress;
  const label = isChecking   ? 'Checking content safety…'
              : isSaving     ? 'Saving…'
              : isUploading  ? 'Uploading to cloud…'
              : isFinalizing ? 'Preparing AR experience…'
              : 'Compiling targets…';

  return (
    <div style={s.overlay}>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes upo-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes bar-shimmer {
          0%   { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes upo-checkPop {
          0%   { opacity: 0; transform: scale(0.4); }
          60%  { opacity: 1; transform: scale(1.15); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes upo-ringPop {
          0%   { opacity: 0; transform: scale(0.6); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes upo-textFadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      ` }} />

      {isDone ? (
        <div style={s.doneWrap}>
          <div style={s.doneRing}>
            <CheckIcon />
          </div>
          <p style={s.doneTitle}>File Uploaded!</p>
          <p style={s.doneSub}>Getting your AR experience ready…</p>
        </div>
      ) : (
        <>
          <div style={s.adBanner}>
            <p style={s.adSmall}>Advertisement</p>
          </div>
          <div style={s.progressSection}>
            <div style={s.progressHeader}>
              <span style={s.progressLabel}>{label}</span>
              <span style={s.progressPct}>{displayProgress}%</span>
            </div>
            <div style={s.barTrack}>
              <div style={{ ...s.barFill, width: displayProgress + '%' }} />
            </div>
            <p style={s.hint}>Keep this tab open. This may take a minute.</p>
          </div>
        </>
      )}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="#04211d" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'upo-checkPop 0.5s cubic-bezier(.34,1.56,.64,1) 0.15s both' }}>
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const s = {
  overlay: { position:'fixed',inset:0,background:'rgba(8,12,24,0.97)',backdropFilter:'blur(16px)',WebkitBackdropFilter:'blur(16px)',display:'flex',flexDirection:'column',zIndex:50,animation:'upo-fade-in 0.3s ease-out forwards' },
  doneWrap: { flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:14,padding:24 },
  doneRing: { width:88,height:88,borderRadius:'50%',background:'linear-gradient(135deg,#00C9A7,#00E5CC)',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 0 40px rgba(0,201,167,0.45)',animation:'upo-ringPop 0.4s cubic-bezier(.34,1.56,.64,1) both' },
  doneTitle: { fontSize:20,fontWeight:700,color:'#ffffff',fontFamily:FONT,margin:0,animation:'upo-textFadeUp 0.4s ease 0.25s both' },
  doneSub: { fontSize:13,color:'rgba(255,255,255,0.5)',fontFamily:FONT,margin:0,animation:'upo-textFadeUp 0.4s ease 0.35s both' },
  adBanner: { flex:1,margin:'24px 20px 12px',borderRadius:16,background:'rgba(255,255,255,0.03)',border:'1px dashed rgba(255,255,255,0.12)',display:'flex',alignItems:'center',justifyContent:'center' },
  adSmall: { fontSize:13,color:'rgba(255,255,255,0.18)',fontFamily:FONT,margin:0,letterSpacing:'0.08em' },
  progressSection: { padding:'0 24px 48px',display:'flex',flexDirection:'column',gap:8 },
  progressHeader: { display:'flex',justifyContent:'space-between',alignItems:'baseline' },
  progressLabel: { fontSize:13,fontWeight:600,fontFamily:FONT,color:'rgba(255,255,255,0.7)' },
  progressPct: { fontSize:18,fontWeight:700,fontFamily:FONT,color:'#00C9A7' },
  barTrack: { height:8,borderRadius:4,background:'rgba(255,255,255,0.08)',overflow:'hidden' },
  barFill: { height:'100%',borderRadius:4,background:'linear-gradient(90deg,#00C9A7,#00E5CC,#00C9A7)',backgroundSize:'200% 100%',animation:'bar-shimmer 1.8s linear infinite',transition:'width 0.2s ease' },
  hint: { fontSize:11,fontFamily:FONT,color:'rgba(255,255,255,0.25)',margin:0,textAlign:'center' },
};
