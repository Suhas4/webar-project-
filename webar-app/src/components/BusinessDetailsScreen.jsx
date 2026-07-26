import { useState, useCallback } from "react";
import { useTheme } from "../context/ThemeContext.jsx";

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const TEAL = "#00C9A7";

const FIELDS = [
  { key: 'businessName',    label: 'Business',           required: true,  icon: 'storefront', placeholder: 'Business name' },
  { key: 'businessAddress', label: 'Business Address',   required: true,  icon: 'pin',         placeholder: 'Business address' },
  { key: 'phone',           label: 'Phone number',       required: true,  icon: 'phone',       placeholder: '10-digit mobile number' },
  { key: 'email',           label: 'Email Address',      required: true,  icon: 'mail',        placeholder: 'name@yourdomain.com' },
  { key: 'website',         label: 'Website (Optional)', required: false, icon: 'globe',       placeholder: 'Website (Optional)' },
  { key: 'instagram',       label: 'Instagram (Optional)', required: false, icon: 'instagram', placeholder: 'Instagram (Optional)' },
  { key: 'gstin',           label: 'GSTIN (Optional)',   required: false, icon: 'id',          placeholder: 'GSTIN (Optional)' },
];

// Requires a real domain with a dot-separated TLD (e.g. gmail.com, yahoo.co.in,
// or any company's own domain) — not just "must contain @".
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
// Indian PIN codes are 6 digits — used to catch addresses missing one entirely.
const PINCODE_RE = /\b\d{6}\b/;

const FILL_PROPER = 'Fill Proper content';

function validateAll(form) {
  const errors = {};
  if (!form.businessName.trim()) errors.businessName = FILL_PROPER;
  if (!form.businessAddress.trim()) {
    errors.businessAddress = FILL_PROPER;
  } else if (!PINCODE_RE.test(form.businessAddress)) {
    errors.businessAddress = FILL_PROPER;
  }
  if (!form.phone.trim()) {
    errors.phone = FILL_PROPER;
  } else if (!/^\d{10}$/.test(form.phone.replace(/\s/g, ''))) {
    errors.phone = FILL_PROPER;
  }
  if (!form.email.trim()) {
    errors.email = FILL_PROPER;
  } else if (!EMAIL_RE.test(form.email.trim())) {
    errors.email = FILL_PROPER;
  }
  return errors;
}

export default function BusinessDetailsScreen({ onContinue, onBack }) {
  const { colors } = useTheme();
  const [form, setForm] = useState({ businessName: '', businessAddress: '', phone: '', email: '', website: '', instagram: '', gstin: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [showValidation, setShowValidation] = useState(false);

  const update = useCallback((key, value) => {
    setForm((f) => {
      const next = { ...f, [key]: value };
      setShowValidation((sv) => {
        if (sv) setFieldErrors(validateAll(next));
        return sv;
      });
      return next;
    });
  }, []);

  const handleContinue = useCallback(() => {
    const errors = validateAll(form);
    setFieldErrors(errors);
    setShowValidation(true);
    if (Object.keys(errors).length > 0) return;
    onContinue(form);
  }, [form, onContinue]);

  return (
    <form style={{ ...s.screen, background: colors.bg }} onSubmit={(e) => { e.preventDefault(); handleContinue(); }}>
      {onBack && <button type="button" onClick={onBack} style={{ ...s.backBtn, color: colors.textMuted }}>← Back</button>}
      <div style={s.scroll}>
        <div style={s.top}>
          <h1 style={{ ...s.title, color: colors.text }}>Tell us about your business</h1>
          <p style={{ ...s.subtitle, color: colors.textMuted }}>This helps us personalize your experience</p>
        </div>

        {showValidation && Object.keys(fieldErrors).length > 0 && (
          <div style={s.errorBox}>Fill Proper content</div>
        )}

        <div style={s.form}>
          {FIELDS.map((f) => {
            const fieldError = showValidation ? fieldErrors[f.key] : null;
            return (
              <div key={f.key}>
                <div style={{ ...s.row, borderColor: fieldError ? '#FF6B6B' : colors.border, background: colors.surface }}>
                  <span style={s.iconWrap}><FieldIcon icon={f.icon} /></span>
                  <input
                    required={f.required}
                    style={{ ...s.input, color: colors.text }}
                    type={f.key === 'email' ? 'email' : f.key === 'phone' ? 'tel' : f.key === 'website' ? 'url' : 'text'}
                    inputMode={f.key === 'phone' ? 'numeric' : undefined}
                    maxLength={f.key === 'phone' ? 10 : undefined}
                    placeholder={f.placeholder + (f.required ? ' *' : '')}
                    value={form[f.key]}
                    onChange={(e) => update(f.key, f.key === 'phone' ? e.target.value.replace(/\D/g, '').slice(0, 10) : e.target.value)}
                  />
                </div>
                {fieldError && <p style={s.fieldError}>⚠ {fieldError}</p>}
              </div>
            );
          })}
        </div>

        <div style={{ height: 100 }} />
      </div>

      <div style={s.bottom}>
        <button type="submit" style={s.continueBtn}>CONTINUE</button>
      </div>
    </form>
  );
}

function FieldIcon({ icon }) {
  const common = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: TEAL, strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (icon) {
    case 'storefront':
      return <svg {...common}><path d="M3 9l1.5-5h15L21 9" /><path d="M4 9v10h16V9" /><path d="M9.5 19v-5.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V19" /></svg>;
    case 'pin':
      return <svg {...common}><path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z" /><circle cx="12" cy="10" r="2.4" /></svg>;
    case 'phone':
      return <svg {...common}><path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 5 5L14 13l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" /></svg>;
    case 'mail':
      return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 6.5l9 6 9-6" /></svg>;
    case 'globe':
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18Z" /></svg>;
    case 'instagram':
      return <svg {...common}><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="3.6" /><circle cx="17.2" cy="6.8" r="0.6" fill={TEAL} /></svg>;
    case 'id':
      return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="11" r="1.8" /><path d="M6 16c0-1.4 1.3-2.4 3-2.4s3 1 3 2.4M14 9.5h5M14 13h5" /></svg>;
    default:
      return null;
  }
}

const s = {
  screen: { position: "fixed", inset: 0, display: "flex", flexDirection: "column", fontFamily: FONT, overflow: "hidden" },
  backBtn: { position: "absolute", top: 48, left: 16, background: "transparent", border: "none",
    fontSize: 14, fontWeight: 600, fontFamily: FONT, cursor: "pointer", padding: "6px 4px", zIndex: 2 },
  scroll: { flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" },
  top: { padding: "96px 24px 4px" },
  title: { fontSize: 24, fontWeight: 700, fontFamily: FONT, margin: 0, lineHeight: 1.25 },
  subtitle: { fontSize: 14, fontFamily: FONT, margin: "8px 0 0", lineHeight: 1.4 },
  errorBox: { margin: "16px 24px 0", background: "rgba(255,80,80,0.08)", border: "1px solid rgba(255,80,80,0.3)", borderRadius: 10, color: "#ff8080", fontSize: 13, fontFamily: FONT, padding: "10px 14px", textAlign: "center" },
  form: { display: "flex", flexDirection: "column", gap: 14, padding: "20px 24px 0" },
  row: { display: "flex", alignItems: "center", gap: 12, border: "1.5px solid", borderRadius: 14, padding: "14px 16px" },
  fieldError: { fontSize: 12, fontWeight: 600, color: "#FF6B6B", fontFamily: FONT, margin: "6px 4px 0" },
  iconWrap: { flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" },
  input: { flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 15, fontFamily: FONT },
  bottom: {
    position: "absolute", left: 0, right: 0, bottom: 0, padding: "16px 24px 32px",
    background: "linear-gradient(180deg, transparent, rgba(0,0,0,0.35) 40%)",
  },
  continueBtn: {
    width: "100%", background: TEAL, border: "none", borderRadius: 50,
    color: "#04211d", fontSize: 16, fontWeight: 700, fontFamily: FONT,
    padding: "16px", cursor: "pointer", letterSpacing: "0.03em",
  },
};
