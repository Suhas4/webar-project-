import { useState } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { TERMS_SECTIONS } from '../content/termsContent.js';

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const TEAL = "#00C9A7";

// Lightweight consent gate shown once per session before the camera opens
// and right after signup — reuses the same Terms copy as SettingsScreen's
// TermsModal (see src/content/termsContent.js) instead of duplicating it.
export default function TermsGateModal({ onAgree, onCancel }) {
  const { colors } = useTheme();
  const [agreed, setAgreed] = useState(false);

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9998 }} onClick={onCancel} />
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 9999,
        background: colors.surface, borderRadius: '20px 20px 0 0',
        padding: '20px 20px 24px', maxHeight: '75vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 -8px 30px rgba(0,0,0,0.3)',
      }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: colors.border, margin: '0 auto 16px' }} />
        <h3 style={{ fontSize: 17, fontWeight: 700, color: colors.text, fontFamily: FONT, margin: '0 0 4px' }}>
          Terms & Conditions
        </h3>
        <p style={{ fontSize: 12, color: colors.textMuted, fontFamily: FONT, margin: '0 0 14px', lineHeight: 1.5 }}>
          Please review and accept our Terms & Conditions to continue.
        </p>
        <div style={{ overflowY: 'auto', flex: 1, paddingRight: 4 }}>
          {TERMS_SECTIONS.map((sec, i) => (
            <div key={i} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: colors.text, fontFamily: FONT, marginBottom: 4 }}>
                {sec.title}
              </div>
              {sec.body.split('\n\n').map((para, j) => (
                <p key={j} style={{ fontSize: 11.5, color: colors.textMuted, fontFamily: FONT,
                  margin: j === 0 ? 0 : '6px 0 0', lineHeight: 1.6 }}>
                  {para}
                </p>
              ))}
            </div>
          ))}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)}
            style={{ width: 18, height: 18, accentColor: TEAL }} />
          <span style={{ fontSize: 13, color: colors.text, fontFamily: FONT }}>I Agree to the Terms & Conditions</span>
        </label>
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: '13px 0', borderRadius: 12, border: `1px solid ${colors.border}`,
            background: 'transparent', color: colors.textMuted, fontFamily: FONT, fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>
            Cancel
          </button>
          <button onClick={onAgree} disabled={!agreed} style={{
            flex: 1, padding: '13px 0', borderRadius: 12, border: 'none',
            background: agreed ? TEAL : colors.border, color: agreed ? '#06201C' : colors.textMuted,
            fontFamily: FONT, fontSize: 14, fontWeight: 700, cursor: agreed ? 'pointer' : 'not-allowed',
          }}>
            Continue
          </button>
        </div>
      </div>
    </>
  );
}
