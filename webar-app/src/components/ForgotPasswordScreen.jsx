import { useState, useCallback } from 'react';

const API_BASE = 'https://webar-project-8jbi.onrender.com';

// Step 1: Enter email/mobile → get OTP sent
// Step 2: Enter OTP
// Step 3: Set new password

export default function ForgotPasswordScreen({ onBack, onSuccess }) {
  const [step, setStep] = useState(1);
  const [identifier, setIdentifier] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [maskedMobile, setMaskedMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  // ── Step 1: Send OTP ────────────────────────────────────────────────────────
  const handleSendOTP = useCallback(async (e) => {
    e?.preventDefault();
    if (!identifier.trim()) { setError('Please enter your email or mobile number.'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API_BASE}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to send OTP.'); return; }
      setMaskedEmail(data.maskedEmail || '');
      setMaskedMobile(data.maskedMobile || '');
      setStep(2);
      startResendCooldown();
    } catch {
      setError('Cannot connect to server. Make sure the backend is running.');
    } finally {
      setLoading(false);
    }
  }, [identifier]);

  // ── Step 2: Verify OTP ──────────────────────────────────────────────────────
  const handleVerifyOTP = useCallback(async (e) => {
    e?.preventDefault();
    if (otp.trim().length !== 6) { setError('Please enter the 6-digit OTP.'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API_BASE}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim(), otp: otp.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Invalid OTP.'); return; }
      setResetToken(data.resetToken);
      setStep(3);
    } catch {
      setError('Cannot connect to server.');
    } finally {
      setLoading(false);
    }
  }, [identifier, otp]);

  // ── Step 3: Reset Password ──────────────────────────────────────────────────
  const handleResetPassword = useCallback(async (e) => {
    e?.preventDefault();
    if (newPassword.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API_BASE}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetToken, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to reset password.'); return; }
      localStorage.setItem('memoera_token', data.token);
      localStorage.setItem('memoera_user', JSON.stringify(data.user));
      onSuccess(data.user);
    } catch {
      setError('Cannot connect to server.');
    } finally {
      setLoading(false);
    }
  }, [resetToken, newPassword, confirmPassword, onSuccess]);

  const startResendCooldown = () => {
    setResendCooldown(30);
    const interval = setInterval(() => {
      setResendCooldown((c) => {
        if (c <= 1) { clearInterval(interval); return 0; }
        return c - 1;
      });
    }, 1000);
  };

  return (
    <div style={styles.screen}>
      <style>{`
        @keyframes fp-fade-in { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        input::placeholder { color: rgba(255,255,255,0.25); }
        input:focus { border-bottom-color: #00C9A7 !important; outline: none; }
      `}</style>

      <div style={styles.orb1} />
      <div style={styles.orb2} />

      <div style={styles.container}>
        <img src="/logo.png" alt="Memoera" style={styles.logo} />

        <div style={styles.card}>
          {/* Step indicator */}
          <div style={styles.stepRow}>
            {[1,2,3].map((s) => (
              <div key={s} style={{ display:'flex', alignItems:'center', gap:4 }}>
                <div style={{ ...styles.stepDot, ...(step >= s ? styles.stepDotActive : {}) }}>{s}</div>
                {s < 3 && <div style={{ ...styles.stepLine, ...(step > s ? styles.stepLineActive : {}) }} />}
              </div>
            ))}
          </div>

          <h2 style={styles.heading}>
            {step === 1 ? 'FORGOT PASSWORD' : step === 2 ? 'ENTER OTP' : 'NEW PASSWORD'}
          </h2>

          {error && <div style={styles.errorBox}>{error}</div>}

          {/* ── Step 1 ── */}
          {step === 1 && (
            <form onSubmit={handleSendOTP} style={styles.form}>
              <p style={styles.hint}>Enter your registered email or mobile number. We'll send an OTP to both.</p>
              <div style={styles.fieldWrap}>
                <label style={styles.label}>Email or Mobile Number</label>
                <input style={styles.input} type="text" placeholder="Enter email or mobile"
                  value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" />
              </div>
              <button type="submit" disabled={loading}
                style={{ ...styles.submitBtn, ...(loading ? styles.submitBtnDisabled : {}) }}>
                {loading ? <Spinner /> : 'Send OTP'}
              </button>
            </form>
          )}

          {/* ── Step 2 ── */}
          {step === 2 && (
            <form onSubmit={handleVerifyOTP} style={styles.form}>
              <p style={styles.hint}>
                OTP sent to{maskedEmail ? ` ${maskedEmail}` : ''}{maskedMobile ? ` and ${maskedMobile}` : ''}.
                {' '}Valid for 10 minutes.
              </p>
              <div style={styles.fieldWrap}>
                <label style={styles.label}>6-Digit OTP</label>
                <input style={{ ...styles.input, letterSpacing: '0.3em', fontSize: 22, textAlign: 'center' }}
                  type="text" inputMode="numeric" maxLength={6} placeholder="000000"
                  value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0,6))} />
              </div>
              <button type="submit" disabled={loading}
                style={{ ...styles.submitBtn, ...(loading ? styles.submitBtnDisabled : {}) }}>
                {loading ? <Spinner /> : 'Verify OTP'}
              </button>
              <button type="button" disabled={resendCooldown > 0} onClick={handleSendOTP}
                style={styles.resendBtn}>
                {resendCooldown > 0 ? `Resend OTP in ${resendCooldown}s` : 'Resend OTP'}
              </button>
            </form>
          )}

          {/* ── Step 3 ── */}
          {step === 3 && (
            <form onSubmit={handleResetPassword} style={styles.form}>
              <p style={styles.hint}>Choose a new password for your account.</p>
              <div style={styles.fieldWrap}>
                <label style={styles.label}>New Password</label>
                <div style={styles.passwordWrap}>
                  <input style={{ ...styles.input, paddingRight: 44 }}
                    type={showPass ? 'text' : 'password'} placeholder="Min 6 characters"
                    value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
                  <button type="button" style={styles.eyeBtn} onClick={() => setShowPass(v => !v)} tabIndex={-1}>
                    {showPass ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>
              <div style={styles.fieldWrap}>
                <label style={styles.label}>Confirm Password</label>
                <input style={styles.input} type={showPass ? 'text' : 'password'}
                  placeholder="Re-enter password"
                  value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
              </div>
              <button type="submit" disabled={loading}
                style={{ ...styles.submitBtn, ...(loading ? styles.submitBtnDisabled : {}) }}>
                {loading ? <Spinner /> : 'Reset Password'}
              </button>
            </form>
          )}
        </div>

        <button onClick={onBack} style={styles.backBtn}>← Back to Sign In</button>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <>
      <style>{`@keyframes fp-spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ width:18, height:18, border:'2.5px solid rgba(255,255,255,0.3)',
        borderTopColor:'#fff', borderRadius:'50%', animation:'fp-spin 0.7s linear infinite', display:'inline-block' }} />
    </>
  );
}

const FONT = '"Outfit", -apple-system, BlinkMacSystemFont, sans-serif';
const TEAL = '#00C9A7';
const CYAN = '#00E5CC';

const styles = {
  screen: {
    position: 'fixed', inset: 0,
    background: `radial-gradient(ellipse at 20% 20%, rgba(0,201,167,0.15) 0%, transparent 55%),
                 radial-gradient(ellipse at 80% 80%, rgba(0,229,204,0.1) 0%, transparent 55%), #080C18`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '24px 0',
  },
  orb1: { position:'fixed', top:'-10%', left:'-10%', width:'55vw', height:'55vw', maxWidth:350, maxHeight:350,
    borderRadius:'50%', background:'radial-gradient(circle, rgba(0,201,167,0.2) 0%, transparent 70%)', pointerEvents:'none' },
  orb2: { position:'fixed', bottom:'-10%', right:'-10%', width:'50vw', height:'50vw', maxWidth:320, maxHeight:320,
    borderRadius:'50%', background:'radial-gradient(circle, rgba(0,229,204,0.15) 0%, transparent 70%)', pointerEvents:'none' },
  container: { width:'100%', maxWidth:400, padding:'0 24px', display:'flex', flexDirection:'column',
    alignItems:'center', animation:'fp-fade-in 0.5s ease-out forwards', zIndex:1 },
  logo: { width:200, maxWidth:'60vw', objectFit:'contain', marginBottom:20 },
  card: { width:'100%', background:'rgba(0,201,167,0.04)', border:'1px solid rgba(0,201,167,0.25)',
    borderRadius:20, padding:'28px 24px 24px', backdropFilter:'blur(12px)', WebkitBackdropFilter:'blur(12px)' },
  stepRow: { display:'flex', alignItems:'center', justifyContent:'center', marginBottom:20, gap:0 },
  stepDot: { width:28, height:28, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center',
    fontSize:12, fontWeight:700, fontFamily:FONT, background:'rgba(255,255,255,0.08)',
    color:'rgba(255,255,255,0.3)', border:'1.5px solid rgba(255,255,255,0.15)', flexShrink:0 },
  stepDotActive: { background:`linear-gradient(135deg, ${TEAL}, ${CYAN})`, color:'#080C18', border:'none' },
  stepLine: { width:32, height:2, background:'rgba(255,255,255,0.1)' },
  stepLineActive: { background:`linear-gradient(90deg, ${TEAL}, ${CYAN})` },
  heading: { fontSize:20, fontWeight:700, fontFamily:FONT, color:'#ffffff', letterSpacing:'2px',
    marginBottom:16, textAlign:'center' },
  hint: { fontSize:13, color:'rgba(255,255,255,0.45)', fontFamily:FONT, margin:'0 0 16px', lineHeight:1.6, textAlign:'center' },
  errorBox: { background:'rgba(255,80,80,0.08)', border:'1px solid rgba(255,80,80,0.3)', borderRadius:10,
    padding:'10px 14px', fontSize:13, color:'#ff8080', fontFamily:FONT, marginBottom:16, textAlign:'center' },
  form: { display:'flex', flexDirection:'column', gap:16 },
  fieldWrap: { display:'flex', flexDirection:'column', gap:6 },
  label: { fontSize:11, fontWeight:600, fontFamily:FONT, color:'rgba(255,255,255,0.45)',
    letterSpacing:'0.08em', textTransform:'uppercase' },
  input: { background:'rgba(255,255,255,0.05)', border:'none', borderBottom:'1.5px solid rgba(0,201,167,0.4)',
    borderRadius:'8px 8px 0 0', padding:'12px 14px', fontSize:15, fontFamily:FONT, color:'#ffffff',
    outline:'none', width:'100%', transition:'border-color 0.2s' },
  passwordWrap: { position:'relative' },
  eyeBtn: { position:'absolute', right:10, top:'50%', transform:'translateY(-50%)',
    background:'transparent', border:'none', cursor:'pointer', fontSize:16, padding:4 },
  submitBtn: { display:'flex', alignItems:'center', justifyContent:'center', gap:8,
    background:`linear-gradient(135deg, ${TEAL}, ${CYAN})`, border:'none', borderRadius:50,
    color:'#080C18', fontSize:16, fontWeight:700, fontFamily:FONT, padding:'15px 24px',
    cursor:'pointer', letterSpacing:'0.05em', boxShadow:`0 4px 24px rgba(0,201,167,0.35)`,
    marginTop:4, transition:'opacity 0.15s' },
  submitBtnDisabled: { opacity:0.65, cursor:'not-allowed', boxShadow:'none' },
  resendBtn: { background:'transparent', border:'none', color:`rgba(255,255,255,0.35)`,
    fontSize:13, fontFamily:FONT, cursor:'pointer', textAlign:'center', padding:'4px 0',
    textDecoration:'underline' },
  backBtn: { background:'transparent', border:'none', color:`rgba(255,255,255,0.4)`,
    fontSize:14, fontFamily:FONT, cursor:'pointer', marginTop:20, padding:'4px 0' },
};
