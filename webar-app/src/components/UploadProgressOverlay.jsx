export default function UploadProgressOverlay({ compileState, progress }) {
  const isSaving = compileState === 'saving';
  const displayProgress = isSaving ? 100 : progress;
  const label = isSaving ? 'Saving to device…' : 'Compiling targets…';

  const size = 180;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (displayProgress / 100) * circumference;

  return (
    <div style={styles.overlay}>
      <style>{`
        @keyframes upo-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes upo-pulse-glow {
          0%, 100% { filter: drop-shadow(0 0 8px rgba(0,201,167,0.5)); }
          50%       { filter: drop-shadow(0 0 22px rgba(0,229,204,0.9)); }
        }
      `}</style>

      <div style={styles.content}>
        <p style={styles.heading}>FILES UPLOADING</p>

        <div style={styles.ringWrap}>
          <svg width={size} height={size}
            style={{ transform: 'rotate(-90deg)', animation: 'upo-pulse-glow 2s ease-in-out infinite' }}>
            <defs>
              <linearGradient id="ring-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#00C9A7" />
                <stop offset="100%" stopColor="#00E5CC" />
              </linearGradient>
            </defs>
            <circle cx={size/2} cy={size/2} r={radius} fill="none"
              stroke="rgba(255,255,255,0.07)" strokeWidth={strokeWidth} />
            <circle cx={size/2} cy={size/2} r={radius} fill="none"
              stroke="url(#ring-gradient)" strokeWidth={strokeWidth}
              strokeLinecap="round" strokeDasharray={circumference}
              strokeDashoffset={offset}
              style={{ transition: 'stroke-dashoffset 0.4s ease' }} />
          </svg>
          <div style={styles.percentWrap}>
            <span style={styles.percent}>{displayProgress}</span>
            <span style={styles.percentSign}>%</span>
          </div>
        </div>

        <p style={styles.label}>{label}</p>
        <p style={styles.hint}>Keep this tab open. This may take a minute.</p>
      </div>
    </div>
  );
}

const FONT = '"Outfit", -apple-system, BlinkMacSystemFont, sans-serif';

const styles = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(8,12,24,0.97)',
    backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 50, animation: 'upo-fade-in 0.3s ease-out forwards',
  },
  content: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: 16, padding: '0 32px', textAlign: 'center',
  },
  heading: {
    fontSize: 14, fontWeight: 700, fontFamily: FONT,
    color: 'rgba(255,255,255,0.55)', letterSpacing: '4px',
    textTransform: 'uppercase', margin: 0,
  },
  ringWrap: {
    position: 'relative', width: 180, height: 180,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  percentWrap: { position: 'absolute', display: 'flex', alignItems: 'baseline', gap: 2 },
  percent: { fontSize: 48, fontWeight: 700, fontFamily: FONT, color: '#ffffff', lineHeight: 1 },
  percentSign: { fontSize: 20, fontWeight: 400, fontFamily: FONT, color: 'rgba(255,255,255,0.45)' },
  label: { fontSize: 15, fontWeight: 500, fontFamily: FONT, color: 'rgba(255,255,255,0.65)', margin: 0 },
  hint: { fontSize: 12, fontFamily: FONT, color: 'rgba(255,255,255,0.28)', margin: 0 },
};
