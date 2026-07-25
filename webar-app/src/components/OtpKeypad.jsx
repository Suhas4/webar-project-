import { useTheme } from '../context/ThemeContext.jsx';

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const TEAL = '#00C9A7';
const LENGTH = 6;
const KEYS = ['1','2','3','4','5','6','7','8','9','','0','back'];

export default function OtpKeypad({ value, onChange }) {
  const { colors } = useTheme();
  const digits = value.padEnd(LENGTH, ' ').split('');

  const press = (key) => {
    if (key === '') return;
    if (key === 'back') { onChange(value.slice(0, -1)); return; }
    if (value.length >= LENGTH) return;
    onChange((value + key).slice(0, LENGTH));
  };

  return (
    <div style={S.wrap}>
      <div style={S.boxes}>
        {digits.map((d, i) => (
          <div key={i} style={{
            ...S.box,
            background: colors.inputBg || colors.surface,
            borderColor: i === value.length ? TEAL : colors.border,
            color: colors.text,
          }}>
            {d.trim()}
          </div>
        ))}
      </div>
      <div style={S.keypad}>
        {KEYS.map((k, i) => (
          k === '' ? <div key={i} /> : (
            <button
              key={i}
              type="button"
              onClick={() => press(k)}
              style={{ ...S.key, background: colors.surfaceHigh || colors.surface, color: colors.text, border: `1px solid ${colors.border}` }}
            >
              {k === 'back' ? '⌫' : k}
            </button>
          )
        ))}
      </div>
    </div>
  );
}

const S = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'center' },
  boxes: { display: 'flex', gap: 8, justifyContent: 'center' },
  box: {
    width: 42, height: 50, borderRadius: 10, border: '1.5px solid',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 20, fontWeight: 700, fontFamily: FONT,
  },
  keypad: {
    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12,
    width: '100%', maxWidth: 280,
  },
  key: {
    padding: '14px 0', borderRadius: 12, fontSize: 18, fontWeight: 600,
    fontFamily: FONT, cursor: 'pointer',
  },
};
