export default function UploadProgressOverlay({ compileState, progress }) {
  const isSaving     = compileState === 'saving';
  const isUploading  = compileState === 'uploading';
  const isFinalizing = compileState === 'finalizing';
  const displayProgress = isSaving || isFinalizing ? 100 : progress;
  const label = isSaving     ? 'Saving…'
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
      ` }} />

      {/* Big ad banner — fills most of the screen */}
      <div style={s.adBanner}>
        <p style={s.adSmall}>Advertisement</p>
      </div>

      {/* Progress section pinned at bottom */}
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
    </div>
  );
}

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";

const s = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(8,12,24,0.97)',
    backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
    display: 'flex', flexDirection: 'column',
    zIndex: 50, animation: 'upo-fade-in 0.3s ease-out forwards',
  },
  adBanner: {
    flex: 1,
    margin: '24px 20px 12px',
    borderRadius: 16,
    background: 'rgba(255,255,255,0.03)',
    border: '1px dashed rgba(255,255,255,0.12)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  adSmall: {
    fontSize: 13, color: 'rgba(255,255,255,0.18)', fontFamily: FONT, margin: 0,
    letterSpacing: '0.08em',
  },
  progressSection: {
    padding: '0 24px 48px',
    display: 'flex', flexDirection: 'column', gap: 8,
  },
  progressHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
  },
  progressLabel: {
    fontSize: 13, fontWeight: 600, fontFamily: FONT, color: 'rgba(255,255,255,0.7)',
  },
  progressPct: {
    fontSize: 18, fontWeight: 700, fontFamily: FONT, color: '#00C9A7',
  },
  barTrack: {
    height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.08)', overflow: 'hidden',
  },
  barFill: {
    height: '100%', borderRadius: 4,
    background: 'linear-gradient(90deg, #00C9A7, #00E5CC, #00C9A7)',
    backgroundSize: '200% 100%',
    animation: 'bar-shimmer 1.8s linear infinite',
    transition: 'width 0.2s ease',
  },
  hint: {
    fontSize: 11, fontFamily: FONT, color: 'rgba(255,255,255,0.25)', margin: 0, textAlign: 'center',
  },
};
