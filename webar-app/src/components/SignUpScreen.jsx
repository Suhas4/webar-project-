import { useState, useCallback } from 'react';
import { API_BASE } from '../config/api.js';
import { useLanguage } from '../context/LanguageContext.jsx';
import { T } from '../config/translations.js';
import { useTheme } from '../context/ThemeContext.jsx';

const SECURITY_QUESTIONS = [
  "What was the name of your first pet?",
  "What is your mother's maiden name?",
  "What city were you born in?",
  "What was the name of your primary school?",
  "What is your oldest sibling's middle name?",
];

export default function SignUpScreen({ onSuccess, onBack, onOtpFail }) {
  const { lang } = useLanguage();
  const tr = T[lang] || T.en;
  const { colors } = useTheme();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    firstName: '', lastName: '', mobile: '', dateOfBirth: '',
    password: '', confirmPassword: '',
    securityQuestion: SECURITY_QUESTIONS[0], securityAnswer: '',
    referralCode: '',
  });
  const [otp, setOtp] = useState('');
  const [maskedMobile, setMaskedMobile] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const startCooldown = () => {
    setResendCooldown(30);
    const t = setInterval(() => setResendCooldown((c) => { if (c <= 1) { clearInterval(t); return 0; } return c - 1; }), 1000);
  };

  const handleSendOTP = useCallback(async (e) => {
    e && e.preventDefault();
    const { firstName, lastName, mobile, dateOfBirth, password, confirmPassword, securityAnswer } = form;
    if (!firstName || !lastName || !mobile || !dateOfBirth || !password || !securityAnswer) {
      setError('Please fill in all fields.'); return;
    }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    if (!/^\d{10}$/.test(mobile.replace(/\s/g, ''))) { setError('Enter a valid 10-digit mobile number.'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API_BASE}/api/auth/send-signup-otp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile: mobile.replace(/\s/g, '') }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to send OTP.'); return; }
      setMaskedMobile(data.maskedMobile || '');
      setStep(2); startCooldown();
    } catch { setError('Cannot connect to server. Make sure the backend is running.'); }
    finally { setLoading(false); }
  }, [form]);

  const handleVerifyOTP = useCallback(async (e) => {
    e && e.preventDefault();
    if (otp.trim().length !== 6) { setError('Enter the 6-digit OTP.'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API_BASE}/api/auth/signup`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: form.firstName, lastName: form.lastName,
          mobile: form.mobile.replace(/\s/g, ''), dateOfBirth: form.dateOfBirth,
          password: form.password, otp: otp.trim(),
          securityQuestion: form.securityQuestion, securityAnswer: form.securityAnswer,
          referralCode: form.referralCode || '',
        }),
      });
      const data = await res.json();
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
  }, [form, otp, onSuccess, onOtpFail]);

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
                <div style={S.row}>
                  <Field label={tr.firstName} style={{ flex:1 }}>
                    <input style={{ ...S.input, color: colors.text, background: colors.surface }} type="text" placeholder="First name" value={form.firstName} onChange={set('firstName')} />
                  </Field>
                  <Field label={tr.lastName} style={{ flex:1 }}>
                    <input style={{ ...S.input, color: colors.text, background: colors.surface }} type="text" placeholder="Last name" value={form.lastName} onChange={set('lastName')} />
                  </Field>
                </div>
                <Field label={tr.mobileNumber}>
                  <input style={{ ...S.input, color: colors.text, background: colors.surface }} type="tel" placeholder="10-digit mobile number" value={form.mobile} onChange={set('mobile')} maxLength={10} />
                </Field>
                <Field label={tr.dateOfBirth}>
                  <input style={{ ...S.input, color: colors.text, background: colors.surface }} type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} />
                </Field>
                <Field label={tr.createPassword}>
                  <div style={{ position:'relative' }}>
                    <input style={{ ...S.input, paddingRight:44, color: colors.text, background: colors.surface }}
                      type={showPass ? 'text' : 'password'} placeholder="Min. 6 characters"
                      value={form.password} onChange={set('password')} />
                    <button type="button" style={S.eyeBtn} onClick={() => setShowPass(v => !v)}>
                      {showPass ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </Field>
                <Field label={tr.confirmPassword}>
                  <input style={{ ...S.input, color: colors.text, background: colors.surface }} type={showPass ? 'text' : 'password'}
                    placeholder="Re-enter password" value={form.confirmPassword} onChange={set('confirmPassword')} />
                </Field>
                <Field label={tr.securityQuestion}>
                  <div style={{ position: 'relative' }}>
                    <select style={{ ...S.input, cursor:'pointer', paddingRight: 32, appearance: 'none', WebkitAppearance: 'none', color: colors.text, background: colors.surface }} value={form.securityQuestion} onChange={set('securityQuestion')}>
                      {SECURITY_QUESTIONS.map(q => <option key={q} value={q} style={{ background:'#0d1220', color:'#fff' }}>{q}</option>)}
                    </select>
                    <span style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', pointerEvents:'none', color:'rgba(255,255,255,0.5)', fontSize:12 }}>▼</span>
                  </div>
                </Field>
                <Field label={tr.securityAnswer}>
                  <input style={{ ...S.input, color: colors.text, background: colors.surface }} type="text" placeholder="Your answer" value={form.securityAnswer} onChange={set('securityAnswer')} />
                </Field>
                <Field label={tr.referralCode}>
                  <input style={{ ...S.input, color: colors.text, background: colors.surface }} type="text" placeholder="Code (if any)" value={form.referralCode} onChange={set('referralCode')} />
                </Field>
                <button type="submit" disabled={loading} style={{ ...S.btn, ...(loading ? S.btnDisabled : {}) }}>
                  {loading ? 'Sending OTP...' : tr.sendOtp}
                </button>
              </form>
            </>
          ) : (
            <>
              <h2 style={{ ...S.heading, color: colors.text }}>{tr.verifyOtp}</h2>
              <p style={S.hint}>OTP sent to {maskedMobile}. Valid for 10 minutes.</p>
              {error && <div style={S.errorBox}>{error}</div>}
              <form onSubmit={handleVerifyOTP} style={S.form}>
                <input style={{ ...S.input, letterSpacing:'0.3em', fontSize:22, textAlign:'center', color: colors.text, background: colors.surface }}
                  type="text" inputMode="numeric" maxLength={6} placeholder="000000"
                  value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} />
                <button type="submit" disabled={loading} style={{ ...S.btn, ...(loading ? S.btnDisabled : {}) }}>
                  {loading ? 'Verifying...' : tr.verifyOtpBtn}
                </button>
                <button type="button" disabled={resendCooldown > 0} onClick={handleSendOTP} style={S.resendBtn}>
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : tr.resendOtp}
                </button>
              </form>
            </>
          )}
        </div>
        <button onClick={step === 2 ? () => setStep(1) : onBack} style={S.backBtn}>{tr.back}</button>
      </div>
    </div>
  );
}

function Field({ label, children, style }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6, ...style }}>
      <label style={S.label}>{label}</label>
      {children}
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
    padding:'10px 14px', fontSize:13, color:'#ff8080', fontFamily:FONT, marginBottom:16, textAlign:'center' },
  form: { display:'flex', flexDirection:'column', gap:14 },
  row: { display:'flex', gap:12 },
  label: { fontSize:11, fontWeight:600, fontFamily:FONT, color:'rgba(255,255,255,0.45)', letterSpacing:'0.08em', textTransform:'uppercase' },
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

