const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";

export default function UploadTypeScreen({ onPhotoVideo, onPhotoUrl, onBack }) {
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
        <button onClick={onPhotoVideo} style={s.goalBtn}>
          <span style={s.btnLabel}>UPLOAD PHOTO<br />WITH VIDEO</span>
        </button>
        <button onClick={onPhotoUrl} style={s.goalBtn}>
          <span style={s.btnLabel}>UPLOAD PHOTO<br />WITH URL / LINK</span>
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
    display: "flex", alignItems: "center", justifyContent: "center",
    background: "rgba(255,255,255,0.04)",
    border: "1.5px solid rgba(255,255,255,0.35)",
    borderRadius: 16, padding: "30px 24px",
    cursor: "pointer", textAlign: "center",
    transition: "background 0.2s",
  },
  btnLabel: {
    fontSize: 20, fontWeight: 700, color: "#ffffff",
    fontFamily: FONT, letterSpacing: "0.06em", lineHeight: 1.5,
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
