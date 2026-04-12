const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const GOLD = "#C9A84C";

export default function GoalSelectScreen({ onPrivate, onPublic, onBack }) {
  return (
    <div style={s.screen}>
      <div style={s.watermark}>
        <img src="/logo.png" alt="" style={s.watermarkImg} />
      </div>

      {onBack && (
        <button onClick={onBack} style={s.backBtn}>&#8592;</button>
      )}

      <div style={s.top}>
        <h1 style={s.title}>Select Your Goal</h1>
      </div>

      <div style={s.btnArea}>
        <button onClick={onPrivate} style={s.goalBtn}>
          <span style={s.iconWrap}><LockIcon /></span>
          <span style={s.btnLabel}>PRIVATE</span>
        </button>
        <button onClick={onPublic} style={s.goalBtn}>
          <span style={s.iconWrap}><PeopleIcon /></span>
          <span style={s.btnLabel}>PUBLIC</span>
        </button>
      </div>

      <div style={s.guideArea}>
        <div style={s.guideDot}>
          <span style={s.guideI}>i</span>
        </div>
        <span style={s.guideLabel}>GUIDE</span>
      </div>
    </div>
  );
}

function LockIcon() {
  return (
    <svg width="52" height="60" viewBox="0 0 52 60" fill="none">
      <path d="M11 27V17C11 7 41 7 41 17V27" stroke="white" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round"/>
      <rect x="3" y="26" width="46" height="34" rx="8" fill={GOLD}/>
      <circle cx="26" cy="42" r="5" fill="rgba(0,0,0,0.45)"/>
      <rect x="23.5" y="44" width="5" height="9" rx="2.5" fill="rgba(0,0,0,0.45)"/>
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg width="64" height="48" viewBox="0 0 64 48" fill="none">
      <circle cx="32" cy="12" r="9" fill={GOLD}/>
      <path d="M16 47C16 34 48 34 48 47" fill={GOLD}/>
      <circle cx="10" cy="17" r="6" fill={GOLD}/>
      <path d="M1 43C1 32 19 32 19 43" fill={GOLD}/>
      <circle cx="54" cy="17" r="6" fill={GOLD}/>
      <path d="M45 43C45 32 63 32 63 43" fill={GOLD}/>
    </svg>
  );
}

const s = {
  screen: {
    position: "fixed", inset: 0,
    background: "linear-gradient(160deg, #061A1F 0%, #0A2229 50%, #061820 100%)",
    display: "flex", flexDirection: "column",
    fontFamily: FONT, overflow: "hidden",
  },
  watermark: {
    position: "absolute", right: -60, top: "5%",
    width: "80vw", maxWidth: 360, opacity: 0.07,
    pointerEvents: "none",
  },
  watermarkImg: { width: "100%", filter: "brightness(0) invert(1)" },
  backBtn: {
    position: "absolute", top: 20, left: 20,
    background: "transparent", border: "none",
    color: "rgba(255,255,255,0.6)", fontSize: 26,
    cursor: "pointer", padding: "6px 10px", zIndex: 2,
  },
  top: { padding: "72px 32px 0" },
  title: {
    fontSize: 28, fontWeight: 300, color: "#ffffff",
    fontFamily: FONT, margin: 0, letterSpacing: "0.01em",
  },
  btnArea: {
    flex: 1, display: "flex", flexDirection: "column",
    justifyContent: "center", gap: 28, padding: "0 28px",
  },
  goalBtn: {
    display: "flex", alignItems: "center", gap: 24,
    background: "rgba(255,255,255,0.04)",
    border: "1.5px solid rgba(255,255,255,0.35)",
    borderRadius: 16, padding: "24px 28px",
    cursor: "pointer", textAlign: "left",
    transition: "background 0.2s, border-color 0.2s",
  },
  iconWrap: { flexShrink: 0, width: 64, display: "flex", justifyContent: "center" },
  btnLabel: {
    fontSize: 22, fontWeight: 400, color: "#ffffff",
    fontFamily: FONT, letterSpacing: "0.12em",
  },
  guideArea: {
    display: "flex", flexDirection: "column", alignItems: "center",
    alignSelf: "flex-end", padding: "0 28px 32px",
  },
  guideDot: {
    width: 44, height: 44, borderRadius: "50%",
    border: "2px solid rgba(255,255,255,0.7)",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  guideI: {
    fontSize: 22, fontWeight: 700, color: "#fff", fontFamily: FONT,
    fontStyle: "italic",
  },
  guideLabel: {
    fontSize: 10, color: "rgba(255,255,255,0.55)", fontFamily: FONT,
    letterSpacing: "0.15em", marginTop: 4,
  },
};
