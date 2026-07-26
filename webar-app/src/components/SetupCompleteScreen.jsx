import { useEffect } from "react";
import { useTheme } from "../context/ThemeContext.jsx";
import { playVerifiedFeedback } from "../utils/feedback.js";

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const TEAL = "#00C9A7";
const GOLD = "#E0A94A";
const NAVY = "#1B1B3A";

export default function SetupCompleteScreen({ accountType, onCreateMemory, onGoToDashboard, onBack }) {
  const { colors } = useTheme();
  const label = accountType === 'business' ? 'business' : 'individual';

  useEffect(() => { playVerifiedFeedback(); }, []);

  return (
    <div style={{ ...s.screen, background: colors.bg }}>
      {onBack && <button onClick={onBack} style={{ ...s.backBtn, color: colors.textMuted }}>← Back</button>}
      <style>{`
        @keyframes bsc-popIn {
          0%   { opacity: 0; transform: scale(0.5); }
          70%  { opacity: 1; transform: scale(1.06); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes bsc-glow {
          0%   { opacity: 0; transform: scale(0.6); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes bsc-glowFade {
          0%, 60% { opacity: 0.55; }
          100%    { opacity: 0.22; }
        }
        @keyframes bsc-checkDraw {
          from { stroke-dashoffset: 56; }
          to   { stroke-dashoffset: 0; }
        }
        @keyframes bsc-confettiPop {
          0%   { opacity: 0; transform: translate(-50%, -50%) scale(0); }
          60%  { opacity: 1; }
          100% { opacity: 0; transform: var(--bsc-end); }
        }
        @keyframes bsc-fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        .bsc-glowRing { animation: bsc-glow 0.5s ease both, bsc-glowFade 1.4s ease 0.5s both; }
        .bsc-badge { animation: bsc-popIn 0.6s cubic-bezier(.34,1.56,.64,1) both; }
        .bsc-check { stroke-dasharray: 56; stroke-dashoffset: 56; animation: bsc-checkDraw 0.45s ease 0.45s forwards; }
        .bsc-confetti { animation: bsc-confettiPop 0.9s ease 0.35s both; }
        .bsc-next  { transition: transform 0.2s ease; }
        .bsc-next:active { transform: scale(0.98); }
        .bsc-dash  { transition: transform 0.2s ease; }
        .bsc-dash:hover  { transform: translateY(-2px); }
        .bsc-dash:active { transform: translateY(0) scale(0.98); }
      `}</style>

      <div style={s.top}>
        <div style={s.badgeStack}>
          <div className="bsc-glowRing" style={s.glowRing} />
          {CONFETTI.map((c, i) => (
            <span key={i} className="bsc-confetti" style={{ ...s.confetti, background: c.color, borderRadius: c.round ? '50%' : 3, top: '50%', left: '50%', '--bsc-end': `translate(calc(-50% + ${c.x}px), calc(-50% + ${c.y}px)) rotate(${c.rot}deg)` }} />
          ))}
          <div className="bsc-badge" style={s.badgeWrap}>
            <BadgeIcon />
          </div>
        </div>
        <h1 style={{ ...s.title, color: colors.text, animation: "bsc-fadeUp 0.5s ease 0.5s both" }}>You're all set!</h1>
        <p style={{ ...s.subtitle, color: colors.textMuted, animation: "bsc-fadeUp 0.5s ease 0.6s both" }}>
          Your {label} account is ready.<br />Let's create your first experience
        </p>
      </div>

      <div style={s.bottomArea}>
        <button onClick={onCreateMemory} className="bsc-next" style={s.nextCard}>
          <span style={s.nextTextCol}>
            <span style={s.nextTitle}>Next Step</span>
            <span style={s.nextLine}>Create your first memory</span>
            <span style={s.nextLine}>Add images, videos and more</span>
          </span>
          <span style={s.nextArrowWrap}>
            <ArrowIcon />
          </span>
        </button>

        <button onClick={onGoToDashboard} className="bsc-dash" style={s.dashboardBtn}>Go to Dashboard</button>
      </div>
    </div>
  );
}

const CONFETTI = [
  { x: -70, y: -55, rot: -20, color: TEAL,  round: true  },
  { x: 65,  y: -60, rot: 15,  color: GOLD,  round: false },
  { x: -85, y: 15,  rot: 40,  color: GOLD,  round: true  },
  { x: 80,  y: 20,  rot: -35, color: TEAL,  round: false },
  { x: -50, y: 75,  rot: 10,  color: '#fff', round: true  },
  { x: 55,  y: 78,  rot: -15, color: TEAL,  round: false },
  { x: 0,   y: -90, rot: 5,   color: GOLD,  round: true  },
];

function BadgeIcon() {
  return (
    <svg width="180" height="180" viewBox="0 0 100 100">
      <defs>
        <linearGradient id="bsc-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={TEAL} />
          <stop offset="100%" stopColor={GOLD} />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="46" fill="url(#bsc-grad)" />
      <path className="bsc-check" d="M31 51 L43 63 L70 36" fill="none" stroke="#ffffff" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
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
    background: `radial-gradient(circle, ${GOLD}55 0%, transparent 70%)` },
  badgeWrap: { position: "relative", width: 180, height: 180, zIndex: 1 },
  confetti: { position: "absolute", width: 8, height: 8, zIndex: 2, pointerEvents: "none" },
  title: { fontSize: 26, fontWeight: 700, fontFamily: FONT, margin: 0 },
  subtitle: { fontSize: 15, fontFamily: FONT, margin: "12px 0 0", lineHeight: 1.5 },
  bottomArea: { padding: "0 24px 40px", display: "flex", flexDirection: "column", gap: 16 },
  nextCard: {
    display: "flex", alignItems: "center", gap: 12, textAlign: "left",
    background: "#FBF8F2", border: `1.5px solid ${GOLD}`, borderRadius: 18,
    padding: "20px 18px", cursor: "pointer",
  },
  nextTextCol: { display: "flex", flexDirection: "column", gap: 4, flex: 1 },
  nextTitle: { fontSize: 19, fontWeight: 700, fontFamily: FONT, color: NAVY },
  nextLine: { fontSize: 13.5, fontFamily: FONT, color: NAVY, opacity: 0.85 },
  nextArrowWrap: {
    flexShrink: 0, width: 42, height: 42, borderRadius: "50%", background: "#F1EAFB",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  dashboardBtn: {
    width: "100%", background: TEAL, border: "none", borderRadius: 50,
    color: "#04211d", fontSize: 16, fontWeight: 700, fontFamily: FONT,
    padding: "16px", cursor: "pointer", letterSpacing: "0.03em",
  },
};
