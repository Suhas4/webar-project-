import { useEffect, useState } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { fetchStreakStatus } from '../utils/streak.js';

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const TEAL = '#00C9A7';
const GOLD = '#E0A94A';

const ACTIONS = [
  { icon: '📷', label: 'Scan a target' },
  { icon: '⬆️', label: 'Upload a memory' },
  { icon: '❤️', label: 'Like or save' },
  { icon: '🔗', label: 'Share with someone' },
  { icon: '📁', label: 'Create an album' },
];

export default function StreakScreen({ onBack }) {
  const { colors } = useTheme();
  const [current, setCurrent] = useState(0);
  const [highest, setHighest] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchStreakStatus().then((data) => {
      if (cancelled || !data) { setLoading(false); return; }
      setCurrent(data.currentStreak || 0);
      setHighest(data.highestStreak || 0);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ ...s.screen, background: colors.bg }}>
      <style>{`
        @keyframes streak-flameFlicker {
          0%,100% { transform: scale(1) rotate(-2deg); }
          50%     { transform: scale(1.06) rotate(2deg); }
        }
        @keyframes streak-fadeUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      {onBack && <button onClick={onBack} style={{ ...s.backBtn, color: colors.textMuted }}>← Back</button>}

      <div style={s.top}>
        <div style={{ ...s.flameWrap, animation: 'streak-flameFlicker 2.4s ease-in-out infinite' }}>🔥</div>
        <div style={{ ...s.count, color: colors.text }}>{loading ? '—' : current}</div>
        <p style={{ ...s.label, color: colors.textMuted }}>
          {current > 0 ? `Day streak — keep it going!` : `Start your streak today`}
        </p>
        {highest > 0 && (
          <p style={{ ...s.best, color: GOLD }}>Best streak: {highest} day{highest === 1 ? '' : 's'}</p>
        )}
      </div>

      <div style={{ ...s.card, background: colors.surface, border: `1px solid ${colors.border}`, animation: 'streak-fadeUp 0.4s ease 0.1s both' }}>
        <p style={{ ...s.cardTitle, color: colors.text }}>What counts toward your streak</p>
        {ACTIONS.map((a) => (
          <div key={a.label} style={s.actionRow}>
            <span style={s.actionIcon}>{a.icon}</span>
            <span style={{ ...s.actionLabel, color: colors.textMuted }}>{a.label}</span>
          </div>
        ))}
        <p style={{ ...s.hint, color: colors.textMuted }}>
          Just opening the app doesn't count — do at least one of these each day to keep your streak alive.
        </p>
      </div>
    </div>
  );
}

const s = {
  screen: { position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', fontFamily: FONT, overflowY: 'auto' },
  backBtn: { position: 'absolute', top: 48, left: 16, background: 'transparent', border: 'none', fontSize: 14, fontWeight: 600, fontFamily: FONT, cursor: 'pointer', padding: '6px 4px', zIndex: 2 },
  top: { display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '90px 24px 8px' },
  flameWrap: { fontSize: 64, lineHeight: 1 },
  count: { fontSize: 56, fontWeight: 800, fontFamily: FONT, marginTop: 8, lineHeight: 1 },
  label: { fontSize: 14, fontFamily: FONT, marginTop: 6 },
  best: { fontSize: 13, fontWeight: 700, fontFamily: FONT, marginTop: 10 },
  card: { margin: '24px 20px', borderRadius: 18, padding: '18px 20px' },
  cardTitle: { fontSize: 14, fontWeight: 700, fontFamily: FONT, margin: '0 0 12px' },
  actionRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' },
  actionIcon: { fontSize: 18, flexShrink: 0, width: 24, textAlign: 'center' },
  actionLabel: { fontSize: 13.5, fontFamily: FONT },
  hint: { fontSize: 11.5, fontFamily: FONT, lineHeight: 1.5, marginTop: 14 },
};
