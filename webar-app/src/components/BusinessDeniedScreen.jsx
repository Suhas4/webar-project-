import { useTheme } from "../context/ThemeContext.jsx";

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const RED = "#E05252";
const NAVY = "#1B1B3A";

export default function BusinessDeniedScreen({ onRetry, onGoToDashboard, onBack }) {
  const { colors } = useTheme();

  return (
    <div style={{ ...s.screen, background: colors.bg }}>
      {onBack && <button onClick={onBack} style={{ ...s.backBtn, color: colors.textMuted }}>← Back</button>}
      <style>{`
        @keyframes bds-popIn {
          0%   { opacity: 0; transform: scale(0.5); }
          70%  { opacity: 1; transform: scale(1.06); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes bds-glow {
          0%   { opacity: 0; transform: scale(0.6); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes bds-glowFade { 0%, 60% { opacity: 0.5; } 100% { opacity: 0.2; } }
        @keyframes bds-crossDraw { from { stroke-dashoffset: 40; } to { stroke-dashoffset: 0; } }
        @keyframes bds-fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        .bds-glowRing { animation: bds-glow 0.5s ease both, bds-glowFade 1.4s ease 0.5s both; }
        .bds-badge { animation: bds-popIn 0.6s cubic-bezier(.34,1.56,.64,1) both; }
        .bds-cross { stroke-dasharray: 40; stroke-dashoffset: 40; animation: bds-crossDraw 0.45s ease 0.45s forwards; }
        .bds-btn  { transition: transform 0.2s ease; }
        .bds-btn:active { transform: scale(0.98); }
      `}</style>

      <div style={s.top}>
        <div style={s.badgeStack}>
          <div className="bds-glowRing" style={s.glowRing} />
          <div className="bds-badge" style={s.badgeWrap}>
            <BadgeIcon />
          </div>
        </div>
        <h1 style={{ ...s.title, color: colors.text, animation: "bds-fadeUp 0.5s ease 0.5s both" }}>Application not approved</h1>
        <p style={{ ...s.subtitle, color: colors.textMuted, animation: "bds-fadeUp 0.5s ease 0.6s both" }}>
          We couldn't verify your business details this time.<br />You can review and resubmit, or reach out to support.
        </p>
      </div>

      <div style={s.bottomArea}>
        <button onClick={onRetry} className="bds-btn" style={s.retryBtn}>Review &amp; Resubmit</button>
        <button onClick={onGoToDashboard} className="bds-btn" style={{ ...s.dashboardBtn, color: colors.textMuted, border: `1.5px solid ${colors.border}` }}>Go to Dashboard</button>
      </div>
    </div>
  );
}

function BadgeIcon() {
  return (
    <svg width="180" height="180" viewBox="0 0 100 100">
      <defs>
        <linearGradient id="bds-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={RED} />
          <stop offset="100%" stopColor="#B93A3A" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="46" fill="url(#bds-grad)" />
      <path className="bds-cross" d="M36 36 L64 64 M64 36 L36 64" fill="none" stroke="#ffffff" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const s = {
  screen: { position: "fixed", inset: 0, display: "flex", flexDirection: "column", fontFamily: FONT, overflow: "hidden" },
  backBtn: { position: "absolute", top: 48, left: 16, background: "transparent", border: "none",
    fontSize: 14, fontWeight: 600, fontFamily: FONT, cursor: "pointer", padding: "6px 4px", zIndex: 2 },
  top: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px", textAlign: "center" },
  badgeStack: { position: "relative", width: 180, height: 180, marginBottom: 32, display: "flex", alignItems: "center", justifyContent: "center" },
  glowRing: { position: "absolute", width: 190, height: 190, borderRadius: "50%",
    background: `radial-gradient(circle, ${RED}55 0%, transparent 70%)` },
  badgeWrap: { position: "relative", width: 180, height: 180, zIndex: 1 },
  title: { fontSize: 24, fontWeight: 700, fontFamily: FONT, margin: 0 },
  subtitle: { fontSize: 15, fontFamily: FONT, margin: "12px 0 0", lineHeight: 1.5 },
  bottomArea: { padding: "0 24px 40px", display: "flex", flexDirection: "column", gap: 12 },
  retryBtn: {
    width: "100%", background: `linear-gradient(135deg, ${RED}, #B93A3A)`, border: "none", borderRadius: 50,
    color: "#fff", fontSize: 16, fontWeight: 700, fontFamily: FONT,
    padding: "16px", cursor: "pointer", letterSpacing: "0.03em",
  },
  dashboardBtn: {
    width: "100%", background: "transparent", borderRadius: 50,
    fontSize: 15, fontWeight: 600, fontFamily: FONT,
    padding: "15px", cursor: "pointer",
  },
};
