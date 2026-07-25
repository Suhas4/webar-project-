import { useTheme } from "../context/ThemeContext.jsx";
import { useLanguage } from "../context/LanguageContext.jsx";
import { T } from "../config/translations.js";

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const GOLD = "#E0A94A";
const CARD_BG = "#0E3833";
const CARD_BORDER = "#1FBFA6";

export default function AccountTypeScreen({ onSelect, onLogin, onBack }) {
  const { colors } = useTheme();
  const { lang } = useLanguage();
  const tr = { ...T.en, ...(T[lang] || {}) };

  return (
    <div style={{ ...s.screen, background: colors.bg }}>
      <style>{`
        @keyframes at-fadeUp { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
        .at-card { transition: transform 0.22s ease, box-shadow 0.22s ease; }
        .at-card:hover  { transform: translateY(-3px) scale(1.015); }
        .at-card:active { transform: translateY(0) scale(0.98); }
        .at-card:hover .at-arrow { transform: translateX(4px); }
      `}</style>

      {onBack && <button onClick={onBack} style={{ ...s.backBtn, color: colors.textMuted }}>← Back</button>}

      <div style={s.top}>
        <img src="/logo1.png" alt="Memoera" style={s.logo} />
      </div>

      <div style={s.headings}>
        <p style={{ ...s.welcome, color: colors.textMuted }}>{tr.accountTypeWelcome}</p>
        <h1 style={{ ...s.question, color: colors.text }}>{tr.accountTypeQuestion}</h1>
      </div>

      <div style={s.btnArea}>
        <button
          onClick={() => onSelect('business')}
          className="at-card"
          style={{ ...s.card, animation: "at-fadeUp 0.5s ease 0.05s both" }}
        >
          <span style={s.iconWrap}>
            <img src="/business-icon.png" alt="" style={s.iconImg} />
          </span>
          <span style={s.textCol}>
            <span style={s.cardLabel}>{tr.accountTypeBusinessLabel}</span>
            <span style={s.cardDesc}>{tr.accountTypeBusinessDesc}</span>
          </span>
          <span className="at-arrow" style={s.arrowBtn}>
            <ArrowIcon />
          </span>
        </button>

        <button
          onClick={() => onSelect('individual')}
          className="at-card"
          style={{ ...s.card, animation: "at-fadeUp 0.5s ease 0.15s both" }}
        >
          <span style={s.iconWrap}>
            <PersonIcon />
          </span>
          <span style={s.textCol}>
            <span style={s.cardLabel}>{tr.accountTypeIndividualLabel}</span>
            <span style={s.cardDesc}>{tr.accountTypeIndividualDesc}</span>
          </span>
          <span className="at-arrow" style={s.arrowBtn}>
            <ArrowIcon />
          </span>
        </button>
      </div>

      <div style={s.bottom}>
        <button onClick={onLogin} style={s.loginBtn}>{tr.loginLink}</button>
      </div>
    </div>
  );
}

function PersonIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="7.5" r="3.2" />
      <path d="M5 20.5c0-3.6 3.1-6 7-6s7 2.4 7 6" />
      <circle cx="18.5" cy="16" r="2.6" />
      <path d="M17 16h3M18.5 14.5v3" />
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
  screen: {
    position: "fixed", inset: 0, display: "flex", flexDirection: "column",
    fontFamily: FONT, overflow: "hidden", overflowY: "auto",
  },
  backBtn: { position: "absolute", top: 48, left: 16, background: "transparent", border: "none",
    fontSize: 14, fontWeight: 600, fontFamily: FONT, cursor: "pointer", padding: "6px 4px", zIndex: 2 },
  top: { padding: "96px 0 0", display: "flex", justifyContent: "center" },
  logo: { width: 220, maxWidth: "60vw", objectFit: "contain" },
  headings: { textAlign: "center", padding: "8px 24px 0" },
  welcome: { fontSize: 16, fontFamily: FONT, margin: 0 },
  question: { fontSize: 22, fontWeight: 600, fontFamily: FONT, margin: "4px 0 0" },
  btnArea: { flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 20, padding: "32px 24px" },
  card: {
    position: "relative", display: "flex", alignItems: "center", gap: 18,
    background: CARD_BG, border: `1.5px solid ${CARD_BORDER}`, borderRadius: 18,
    padding: "22px 20px", cursor: "pointer", textAlign: "left",
  },
  iconWrap: { flexShrink: 0, width: 56, height: 56, display: "flex", alignItems: "center", justifyContent: "center" },
  iconImg: { width: 44, height: 44, objectFit: "contain" },
  textCol: { display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 0 },
  cardLabel: { fontSize: 19, fontWeight: 700, fontFamily: FONT, color: "#ffffff" },
  cardDesc: { fontSize: 13, fontFamily: FONT, lineHeight: 1.4, color: "rgba(255,255,255,0.75)" },
  arrowBtn: {
    flexShrink: 0, width: 40, height: 40, borderRadius: "50%", background: "#ffffff",
    display: "flex", alignItems: "center", justifyContent: "center",
    transition: "transform 0.22s ease",
  },
  bottom: { display: "flex", justifyContent: "center", padding: "0 24px 40px" },
  loginBtn: {
    background: "transparent", border: "none", cursor: "pointer",
    fontSize: 15, fontWeight: 700, fontFamily: FONT, color: GOLD, padding: "8px 12px",
  },
};
