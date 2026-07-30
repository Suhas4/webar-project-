import { useTheme } from "../context/ThemeContext.jsx";
import { useLanguage } from "../context/LanguageContext.jsx";

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const TEAL = "#00C9A7";

export default function AccountConfirmScreen({ accountType, onContinue, onBack, onNoSelection }) {
  const { colors } = useTheme();
  const { lang, tr: trFromContext } = useLanguage();
  const tr = trFromContext;
  const isBusiness = accountType === 'business';
  const hasSelection = accountType === 'business' || accountType === 'individual';

  if (!hasSelection) {
    return (
      <div style={{ ...s.screen, background: colors.bg }}>
        {onBack && <button onClick={onBack} style={{ ...s.backBtn, color: colors.textMuted }}>← Back</button>}
        <div style={s.noSelectionWrap}>
          <span style={{ fontSize: 40 }}>🤔</span>
          <h2 style={{ ...s.title, color: colors.text, fontSize: 22, margin: "16px 0 0" }}>
            Please tell us — are you a Business or an Individual?
          </h2>
          <p style={{ ...s.subtitle, color: colors.textMuted, textAlign: "center" }}>
            You haven't selected an account type yet. Go back and choose one to continue setting up your account.
          </p>
          <button onClick={onNoSelection || onBack} className="ac-continue" style={{ ...s.continueBtn, marginTop: 24 }}>
            Choose Account Type
          </button>
        </div>
      </div>
    );
  }

  const title = isBusiness ? tr.greatChoseBusiness : tr.greatChoseIndividual;
  const subtitle = isBusiness ? tr.businessSetupSubtitle : tr.individualSetupSubtitle;
  const bullets = isBusiness
    ? [tr.businessBullet1, tr.businessBullet2, tr.businessBullet3, tr.businessBullet4]
    : [tr.individualBullet1, tr.individualBullet2, tr.individualBullet3, tr.individualBullet4];

  return (
    <div style={{ ...s.screen, background: colors.bg }}>
      <style>{`
        @keyframes ac-fadeUp { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
        .ac-continue { transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .ac-continue:hover  { transform: translateY(-2px); }
        .ac-continue:active { transform: translateY(0) scale(0.98); }
      `}</style>

      {onBack && <button onClick={onBack} style={{ ...s.backBtn, color: colors.textMuted }}>← Back</button>}

      <div style={{ ...s.top, animation: "ac-fadeUp 0.5s ease 0.05s both" }}>
        <h1 style={{ ...s.title, color: colors.text }}>{title}</h1>
        <p style={{ ...s.subtitle, color: colors.textMuted }}>{subtitle}</p>
      </div>

      {isBusiness && (
        <div style={{ ...s.iconArea, animation: "ac-fadeUp 0.5s ease 0.15s both" }}>
          <div style={{ ...s.ring, borderColor: `${TEAL}55` }} />
          <img src="/business-icon.png" alt="" style={s.bigIcon} />
        </div>
      )}

      <div style={{ ...s.bulletArea, marginTop: isBusiness ? 0 : 32, animation: "ac-fadeUp 0.5s ease 0.25s both" }}>
        {bullets.map((b, i) => (
          <div key={i} style={s.bulletRow}>
            <span style={{ ...s.bulletIcon, color: TEAL }}>✦</span>
            <span style={{ ...s.bulletText, color: colors.text }}>{b}</span>
          </div>
        ))}
      </div>

      <div style={s.bottom}>
        <button onClick={onContinue} className="ac-continue" style={s.continueBtn}>
          {tr.continueBtn}
        </button>
      </div>
    </div>
  );
}

const s = {
  screen: {
    position: "fixed", inset: 0, display: "flex", flexDirection: "column",
    fontFamily: FONT, overflow: "hidden", overflowY: "auto",
  },
  backBtn: { position: "absolute", top: 48, left: 16, background: "transparent", border: "none",
    fontSize: 14, fontWeight: 600, fontFamily: FONT, cursor: "pointer", padding: "6px 4px", zIndex: 2 },
  top: { padding: "104px 28px 0", textAlign: "left" },
  noSelectionWrap: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center", padding: "24px 32px", textAlign: "center" },
  title: { fontSize: 32, fontWeight: 700, fontFamily: FONT, margin: 0, lineHeight: 1.15, whiteSpace: "pre-line" },
  subtitle: { fontSize: 16, fontFamily: FONT, margin: "16px 0 0", lineHeight: 1.4 },
  iconArea: {
    position: "relative", flexShrink: 0, alignSelf: "center",
    width: 260, height: 260, display: "flex", alignItems: "center", justifyContent: "center",
    margin: "24px 0",
  },
  ring: {
    position: "absolute", width: 260, height: 260, borderRadius: "50%",
    border: "1.5px solid", boxSizing: "border-box",
  },
  bigIcon: { width: 170, height: 170, objectFit: "contain", position: "relative", zIndex: 1 },
  bulletArea: { display: "flex", flexDirection: "column", gap: 16, padding: "0 32px", flex: 1 },
  bulletRow: { display: "flex", alignItems: "flex-start", gap: 12 },
  bulletIcon: { fontSize: 15, flexShrink: 0, marginTop: 1 },
  bulletText: { fontSize: 15, fontFamily: FONT, lineHeight: 1.4 },
  bottom: { padding: "24px 24px 40px" },
  continueBtn: {
    width: "100%", background: TEAL, border: "none", borderRadius: 50,
    color: "#04211d", fontSize: 16, fontWeight: 700, fontFamily: FONT,
    padding: "16px", cursor: "pointer", letterSpacing: "0.03em",
  },
};
