const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const TEAL = "#00C9A7";

// Shown right before the browser's native camera permission prompt, so the user
// understands *why* Memoera wants their camera before that OS-level dialog appears.
// Priming the request like this measurably improves grant rates versus a surprise
// prompt with no context — and gives us a natural place to explain what happens if
// they say no. onAllow is expected to trigger the actual getUserMedia() call.
export default function CameraPermissionPrimer({ onAllow, onDismiss }) {
  return (
    <div style={s.overlay} onClick={onDismiss}>
      <div onClick={(e) => e.stopPropagation()} style={s.sheet}>
        <div style={s.iconWrap}>📷</div>
        <h3 style={s.title}>Camera Access Needed</h3>
        <p style={s.body}>
          Memoera uses your camera to scan AR targets and bring your memories to life.
          We never record, store, or share your camera feed — it's only used live, on your device.
        </p>
        <button onClick={onAllow} style={s.allowBtn}>Allow Camera Access</button>
        {onDismiss && (
          <button onClick={onDismiss} style={s.notNowBtn}>Not Now</button>
        )}
      </div>
    </div>
  );
}

const s = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 200,
    background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  sheet: {
    width: '100%', maxWidth: 340, borderRadius: 24, padding: '32px 24px 24px',
    background: 'linear-gradient(160deg, #0A2229 0%, #061A1F 100%)',
    border: `1px solid ${TEAL}33`, textAlign: 'center',
    boxShadow: `0 20px 60px rgba(0,0,0,0.5)`,
  },
  iconWrap: {
    width: 64, height: 64, margin: '0 auto 16px', borderRadius: 20,
    background: `linear-gradient(135deg, ${TEAL}, #00819c)`,
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30,
    boxShadow: `0 6px 20px ${TEAL}4d`,
  },
  title: { fontSize: 17, fontWeight: 700, color: '#fff', fontFamily: FONT, margin: '0 0 10px' },
  body: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontFamily: FONT, lineHeight: 1.6, margin: '0 0 22px' },
  allowBtn: {
    width: '100%', background: `linear-gradient(135deg, ${TEAL}, #00E5CC)`, border: 'none',
    borderRadius: 50, color: '#040D0B', fontSize: 14, fontWeight: 700, fontFamily: FONT,
    padding: '13px 20px', cursor: 'pointer', boxShadow: `0 4px 20px ${TEAL}55`,
  },
  notNowBtn: {
    width: '100%', marginTop: 10, background: 'transparent', border: 'none',
    color: 'rgba(255,255,255,0.5)', fontSize: 13, fontFamily: FONT, padding: '8px', cursor: 'pointer',
  },
};
