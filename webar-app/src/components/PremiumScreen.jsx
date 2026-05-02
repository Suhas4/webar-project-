import { useTheme } from '../context/ThemeContext.jsx';

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const GOLD = "#C9A84C";

export default function PremiumScreen({ onBack }) {
  const { colors } = useTheme();
  return (
    <div style={{ ...s.screen, background: colors.bg }}>
      <button onClick={onBack} style={{ ...s.backBtn, color: colors.textMuted }}>Back</button>
      <div style={s.content}>
        <div style={s.diamondWrap}><DiamondIcon /></div>
        <h1 style={{ ...s.title, color: colors.text }}>PREMIUM</h1>
        <p style={{ ...s.sub, color: colors.textMuted }}>Unlock unlimited storage, priority scanning, and exclusive AR features.</p>
        <div style={{ ...s.card, background: colors.surface, border: '1px solid ' + GOLD + '44' }}>
          <p style={{ ...s.featureText, color: colors.text }}>✦  Unlimited private targets</p>
          <p style={{ ...s.featureText, color: colors.text }}>✦  Unlimited public targets</p>
          <p style={{ ...s.featureText, color: colors.text }}>✦  Priority AR compilation</p>
          <p style={{ ...s.featureText, color: colors.text }}>✦  Exclusive AR effects</p>
        </div>
        <button style={s.cta}>Coming Soon</button>
      </div>
    </div>
  );
}

function DiamondIcon() {
  return (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
      <path d="M40 8 L72 32 L40 72 L8 32 Z" fill="url(#dg)" stroke="#C9A84C" strokeWidth="2"/>
      <path d="M8 32 L40 32 L40 72 Z" fill="rgba(201,168,76,0.3)"/>
      <path d="M40 32 L72 32 L40 72 Z" fill="rgba(201,168,76,0.5)"/>
      <path d="M8 32 L20 8 L40 8 L40 32 Z" fill="rgba(255,248,220,0.4)"/>
      <path d="M40 8 L60 8 L72 32 L40 32 Z" fill="rgba(255,248,220,0.2)"/>
      <defs><linearGradient id="dg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#fff8dc"/><stop offset="100%" stopColor="#C9A84C"/></linearGradient></defs>
    </svg>
  );
}

const s = {
  screen: { position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', fontFamily: FONT },
  backBtn: { position: 'absolute', top: 48, left: 20, background: 'transparent', border: 'none', fontSize: 14, fontFamily: FONT, cursor: 'pointer' },
  content: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 32px 40px', gap: 20 },
  diamondWrap: { marginBottom: 8 },
  title: { fontSize: 32, fontWeight: 700, letterSpacing: '0.1em', margin: 0 },
  sub: { fontSize: 14, textAlign: 'center', lineHeight: 1.7, margin: 0 },
  card: { width: '100%', maxWidth: 340, borderRadius: 16, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 },
  featureText: { fontSize: 14, margin: 0, fontFamily: FONT },
  cta: { background: GOLD, border: 'none', borderRadius: 50, color: '#000', fontSize: 16, fontWeight: 700, fontFamily: FONT, padding: '16px 48px', cursor: 'pointer', marginTop: 8 },
};
