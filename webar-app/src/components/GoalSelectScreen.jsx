import { useTheme } from '../context/ThemeContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const TEAL = '#00C9A7';
const GOLD = '#C9A84C';

export default function GoalSelectScreen({ onContinue, onBack }) {
  const { colors } = useTheme();
  const { tr } = useLanguage();

  return (
    <div style={{ ...s.screen, background: colors.bg }}>
      <div style={s.container}>
        <p style={{ ...s.eyebrow, color: colors.textMuted }}>NEW MEMORY</p>
        <h1 style={{ ...s.title, color: colors.text }}>Select your goal</h1>
        <p style={{ ...s.subtitle, color: colors.textMuted }}>Choose who this memory is for before you continue.</p>

        <div style={s.cardStack}>
          <button onClick={() => onContinue('private')} style={{ ...s.goalCard, background: colors.surface, border: `1.5px solid ${colors.border}` }}>
            <span style={{ ...s.goalIcon, background: `${GOLD}22`, color: GOLD }}>🔒</span>
            <p style={{ ...s.goalTitle, color: colors.text }}>{tr.privateLabel || 'Private'}</p>
            <p style={{ ...s.goalHint, color: colors.textMuted }}>{tr.wizPrivateHint || 'Only you (or people you choose) can scan and view this.'}</p>
          </button>
          <button onClick={() => onContinue('public')} style={{ ...s.goalCard, background: colors.surface, border: `1.5px solid ${colors.border}` }}>
            <span style={{ ...s.goalIcon, background: `${TEAL}22`, color: TEAL }}>🌐</span>
            <p style={{ ...s.goalTitle, color: colors.text }}>{tr.publicLabel || 'Public'}</p>
            <p style={{ ...s.goalHint, color: colors.textMuted }}>{tr.wizPublicHint || 'Anyone can scan and view this — it appears in public discovery.'}</p>
          </button>
        </div>

        <button onClick={onBack} style={{ ...s.backBtn, color: colors.textMuted }}>← Back</button>
      </div>
    </div>
  );
}

const s = {
  screen: { position: 'fixed', inset: 0, overflowY: 'auto', display: 'flex', justifyContent: 'center', padding: '48px 0' },
  container: { width: '100%', maxWidth: 420, padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 8 },
  eyebrow: { fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', fontFamily: FONT, margin: 0, textTransform: 'uppercase' },
  title: { fontSize: 26, fontWeight: 800, fontFamily: FONT, margin: '4px 0 4px' },
  subtitle: { fontSize: 13.5, fontFamily: FONT, margin: '0 0 20px', lineHeight: 1.6 },
  cardStack: { display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 24 },
  goalCard: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8, borderRadius: 18, padding: '22px 20px', cursor: 'pointer', textAlign: 'left' },
  goalIcon: { width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 },
  goalTitle: { fontSize: 17, fontWeight: 700, fontFamily: FONT, margin: 0 },
  goalHint: { fontSize: 12.5, fontFamily: FONT, margin: 0, lineHeight: 1.5 },
  backBtn: { background: 'transparent', border: 'none', fontSize: 14, fontFamily: FONT, cursor: 'pointer', marginTop: 12, padding: '4px 0', textAlign: 'left' },
};
