import { useState, useCallback, useRef, useEffect } from 'react';
import { API_BASE, parseApiResponse } from '../config/api.js';
import { useLanguage } from '../context/LanguageContext.jsx';
import { T } from '../config/translations.js';
import { useTheme } from '../context/ThemeContext.jsx';
import OtpKeypad from './OtpKeypad.jsx';

function validateStep1(form) {
  const errors = {};
  if (!form.firstName.trim()) errors.firstName = 'Name is required.';
  if (!form.mobile.trim()) {
    errors.mobile = 'Mobile number is required.';
  } else if (!/^\d{10}$/.test(form.mobile.replace(/\s/g, ''))) {
    errors.mobile = 'Enter a valid 10-digit mobile number.';
  }
  if (!form.password) {
    errors.password = 'Password is required.';
  } else if (form.password.length < 6) {
    errors.password = 'Password must be at least 6 characters.';
  }
  if (!form.confirmPassword) {
    errors.confirmPassword = 'Please confirm your password.';
  } else if (form.confirmPassword !== form.password) {
    errors.confirmPassword = 'Passwords do not match.';
  }
  return errors;
}

export default function SignUpScreen({ onSuccess, onBack, onOtpFail }) {
  const { lang } = useLanguage();
  const tr = { ...T.en, ...(T[lang] || {}) };
  const { colors } = useTheme();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    firstName: '', mobile: '',
    password: '', confirmPassword: '',
  });
  const [otp, setOtp] = useState('');
  const [maskedMobile, setMaskedMobile] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [showValidation, setShowValidation] = useState(false);

  const set = (field) => (e) => setForm((f) => {
    const next = { ...f, [field]: e.target.value };
    setShowValidation((sv) => {
      if (sv) setFieldErrors(validateStep1(next));
      return sv;
    });
    return next;
  });

  const cooldownRef = useRef(null);
  useEffect(() => () => { if (cooldownRef.current) clearInterval(cooldownRef.current); }, []);

  const startCooldown = () => {
    setResendCooldown(30);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => setResendCooldown((c) => {
      if (c <= 1) { clearInterval(cooldownRef.current); cooldownRef.current = null; return 0; }
      return c - 1;
    }), 1000);
  };

  const handleSendOTP = useCallback(async (e) => {
    e && e.preventDefault();
    if (loading) return;
    const errors = validateStep1(form);
    setFieldErrors(errors);
    setShowValidation(true);
    if (Object.keys(errors).length > 0) return;
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API_BASE}/api/auth/send-signup-otp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile: form.mobile.replace(/\s/g, '') }),
      });
      const data = await parseApiResponse(res);
      if (!res.ok) { setError(data.error || 'Failed to send OTP.'); return; }
      setMaskedMobile(data.maskedMobile || '');
      setStep(2); startCooldown();
    } catch { setError('Cannot connect to server. Make sure the backend is running.'); }
    finally { setLoading(false); }
  }, [form, loading]);

  const handleVerifyOTP = useCallback(async (e) => {
    e && e.preventDefault();
    if (loading) return;
    if (otp.trim().length !== 6) { setError('Enter the 6-digit OTP.'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API_BASE}/api/auth/signup`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: form.firstName,
          mobile: form.mobile.replace(/\s/g, ''),
          password: form.password, otp: otp.trim(),
        }),
      });
      const data = await parseApiResponse(res);
      if (!res.ok) {
        setError(data.error || 'Verification failed.');
        if (data.error && data.error.toLowerCase().includes('otp')) {
          onOtpFail && onOtpFail();
        }
        return;
      }
      localStorage.setItem('memoera_token', data.token);
      localStorage.setItem('memoera_user', JSON.stringify(data.user));
      onSuccess(data.user);
    } catch { setError('Cannot connect to server. Make sure the backend is running.'); }
    finally { setLoading(false); }
  }, [form, otp, onSuccess, onOtpFail, loading]);

  return (
    <div style={{ ...S.screen, background: colors.bg }}>
      <div style={S.orb1}/><div style={S.orb2}/>
      <div style={S.container}>
        <img src="/logo.png" alt="Memoera" style={S.logo} />
        <div style={{ ...S.card, background: colors.surface, border: `1px solid ${colors.border}` }}>
          {step === 1 ? (
            <>
              <h2 style={{ ...S.heading, color: colors.text }}>{tr.createAccountTitle}</h2>
              {error && <div style={S.errorBox}>{error}</div>}
              <form onSubmit={handleSendOTP} style={S.form}>
                <Field label="Name" required error={showValidation ? fieldErrors.firstName : null} colors={colors}>
                  <input required style={{ ...S.input, color: colors.text, background: colors.surface, borderBottomColor: showValidation && fieldErrors.firstName ? '#FF6B6B' : undefined }} type="text" placeholder="Name" value={form.firstName} onChange={set('firstName')} />
                </Field>
                <Field label={tr.mobileNumber} required error={showValidation ? fieldErrors.mobile : null} colors={colors}>
                  <input required style={{ ...S.input, color: colors.text, background: colors.surface, borderBottomColor: showValidation && fieldErrors.mobile ? '#FF6B6B' : undefined }} type="tel" placeholder="10-digit mobile number" value={form.mobile} onChange={set('mobile')} maxLength={10} />
                </Field>
                <Field label={tr.createPassword} required error={showValidation ? fieldErrors.password : null} colors={colors}>
                  <div style={{ position:'relative' }}>
                    <input required style={{ ...S.input, paddingRight:44, color: colors.text, background: colors.surface, borderBottomColor: showValidation && fieldErrors.password ? '#FF6B6B' : undefined }}
                      type={showPass ? 'text' : 'password'} placeholder="Min. 6 characters"
                      value={form.password} onChange={set('password')} />
                    <button type="button" style={S.eyeBtn} onClick={() => setShowPass(v => !v)}>
                      {showPass ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </Field>
                <Field label="Confirm Password" required error={showValidation ? fieldErrors.confirmPassword : null} colors={colors}>
                  <input required style={{ ...S.input, color: colors.text, background: colors.surface, borderBottomColor: showValidation && fieldErrors.confirmPassword ? '#FF6B6B' : undefined }}
                    type={showPass ? 'text' : 'password'} placeholder="Re-enter password"
                    value={form.confirmPassword} onChange={set('confirmPassword')} />
                </Field>
                <button type="submit" disabled={loading} style={{ ...S.btn, ...(loading ? S.btnDisabled : {}) }}>
                  {loading ? 'Sending OTP...' : tr.sendOtp}
                </button>
              </form>
            </>
          ) : (
            <>
              <h2 style={{ ...S.heading, color: colors.text }}>{tr.verifyOtp}</h2>
              <p style={{ ...S.hint, color: colors.textMuted }}>OTP sent to {maskedMobile}. Valid for 10 minutes.</p>
              {error && <div style={S.errorBox}>{error}</div>}
              <form onSubmit={handleVerifyOTP} style={S.form}>
                <OtpKeypad value={otp} onChange={setOtp} />
                <button type="submit" disabled={loading} style={{ ...S.btn, ...(loading ? S.btnDisabled : {}) }}>
                  {loading ? 'Verifying...' : tr.verifyOtpBtn}
                </button>
                <button type="button" disabled={resendCooldown > 0} onClick={handleSendOTP} style={{ ...S.resendBtn, color: colors.textMuted }}>
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : tr.resendOtp}
                </button>
              </form>
            </>
          )}
        </div>
        <button onClick={step === 2 ? () => setStep(1) : onBack} style={{ ...S.backBtn, color: colors.textMuted }}>← Back</button>
      </div>
    </div>
  );
}

function Field({ label, required, error, colors, children, style }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6, ...style }}>
      <label style={{ ...S.label, color: colors?.textMuted }}>{label}{required && <span style={S.requiredStar}> *</span>}</label>
      {children}
      {error && <p style={S.fieldError}>⚠ {error}</p>}
    </div>
  );
}

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const TEAL = '#00C9A7';
const S = {
  screen: { position:'fixed', inset:0,
    background:'radial-gradient(ellipse at 20% 20%, rgba(0,201,167,0.15) 0%, transparent 55%), radial-gradient(ellipse at 80% 80%, rgba(0,229,204,0.1) 0%, transparent 55%), #080C18',
    overflowY:'auto', WebkitOverflowScrolling:'touch', display:'flex', justifyContent:'center', padding:'32px 0 40px' },
  orb1: { position:'fixed', top:'-10%', left:'-10%', width:'55vw', height:'55vw', maxWidth:350, maxHeight:350,
    borderRadius:'50%', background:'radial-gradient(circle, rgba(0,201,167,0.2) 0%, transparent 70%)', pointerEvents:'none' },
  orb2: { position:'fixed', bottom:'-10%', right:'-10%', width:'50vw', height:'50vw', maxWidth:320, maxHeight:320,
    borderRadius:'50%', background:'radial-gradient(circle, rgba(0,229,204,0.15) 0%, transparent 70%)', pointerEvents:'none' },
  container: { width:'100%', maxWidth:420, padding:'0 24px', display:'flex', flexDirection:'column', alignItems:'center', zIndex:1 },
  logo: { width:200, maxWidth:'60vw', objectFit:'contain', marginBottom:16 },
  card: { width:'100%', background:'rgba(0,201,167,0.04)', border:'1px solid rgba(0,201,167,0.25)',
    borderRadius:20, padding:'28px 24px 24px', backdropFilter:'blur(12px)', WebkitBackdropFilter:'blur(12px)' },
  heading: { fontSize:22, fontWeight:700, fontFamily:FONT, color:'#ffffff', letterSpacing:'2px', marginBottom:20, textAlign:'center' },
  hint: { fontSize:13, color:'rgba(255,255,255,0.45)', fontFamily:FONT, margin:'0 0 16px', lineHeight:1.6, textAlign:'center' },
  errorBox: { background:'rgba(255,80,80,0.08)', border:'1px solid rgba(255,80,80,0.3)', borderRadius:10,
    padding:'10px 14px', fontSize:13, color:'#FF6B6B', fontFamily:FONT, marginBottom:16, textAlign:'center' },
  form: { display:'flex', flexDirection:'column', gap:14 },
  row: { display:'flex', gap:12 },
  label: { fontSize:11, fontWeight:600, fontFamily:FONT, color:'rgba(255,255,255,0.45)', letterSpacing:'0.08em', textTransform:'uppercase' },
  requiredStar: { color:'#FF6B6B', fontSize:13, fontWeight:700 },
  fieldError: { fontSize:11, fontWeight:600, color:'#FF6B6B', fontFamily:FONT, margin:'2px 0 0' },
  input: { background:'rgba(255,255,255,0.05)', border:'none', borderBottom:'1.5px solid rgba(0,201,167,0.4)',
    borderRadius:'8px 8px 0 0', padding:'11px 14px', fontSize:14, fontFamily:FONT, color:'#ffffff',
    outline:'none', width:'100%', WebkitAppearance:'none' },
  eyeBtn: { position:'absolute', right:10, top:'50%', transform:'translateY(-50%)',
    background:'transparent', border:'none', cursor:'pointer', fontSize:12, color:TEAL, fontFamily:FONT },
  btn: { display:'flex', alignItems:'center', justifyContent:'center',
    background:'linear-gradient(135deg, #00C9A7, #00E5CC)', border:'none', borderRadius:50, color:'#080C18',
    fontSize:16, fontWeight:700, fontFamily:FONT, padding:'15px 24px', cursor:'pointer', letterSpacing:'0.05em',
    boxShadow:'0 4px 24px rgba(0,201,167,0.35)', marginTop:6 },
  btnDisabled: { opacity:0.65, cursor:'not-allowed', boxShadow:'none' },
  resendBtn: { background:'transparent', border:'none', color:'rgba(255,255,255,0.35)',
    fontSize:13, fontFamily:FONT, cursor:'pointer', textAlign:'center', textDecoration:'underline' },
  backBtn: { background:'transparent', border:'none', color:'rgba(255,255,255,0.4)',
    fontSize:14, fontFamily:FONT, cursor:'pointer', marginTop:20, padding:'4px 0' },
};

