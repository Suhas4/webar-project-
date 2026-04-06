import { useState, useCallback } from 'react';

const API_BASE = 'https://webar-project-8jbi.onrender.com';

const SECURITY_QUESTIONS = [
  "What was the name of your first pet?",
  "What is your mother's maiden name?",
  "What city were you born in?",
  "What was the name of your primary school?",
  "What is your oldest sibling's middle name?",
];

export default function SignUpScreen({ onSuccess, onGoSignIn }) {
  const [form, setForm] = useState({
    firstName: '', lastName: '', mobile: '', email: '',
    password: '', securityQuestion: SECURITY_QUESTIONS[0], securityAnswer: '',
  });
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    const { firstName, lastName, mobile, email, password, securityQuestion, securityAnswer } = form;
    if (!firstName || !lastName || !mobile || !email || !password || !securityAnswer) {
      setError('Please fill in all fields.'); return;
    }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (!/^\d{10}$/.test(mobile.replace(/\s/g, ''))) {
      setError('Please enter a valid 10-digit mobile number.'); return;
    }
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API_BASE}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName, lastName, mobile: mobile.replace(/\s/g, ''),
          email: email.trim().toLowerCase(),
          password, securityQuestion, securityAnswer,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Sign up failed. Please try again.'); return; }
      onSuccess('Account created! Please sign in.');
    } catch {
      setError('Cannot connect to server. Make sure the backend is running.');
    } finally {
      setLoading(false);
    }
  }, [form, onSuccess]);

  return (
    <div style={styles.screen}>
      <style>{`
        @keyframes signup-fade-in {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        input::placeholder { color: rgba(255,255,255,0.25); }
        input:focus, select:focus { border-bottom-color: #00C9A7 !important; outline: none; }
      `}</style>

      <div style={styles.orb1} />
      <div style={styles.orb2} />

      <div style={styles.container}>
        <img src="/logo.png" alt="Memoera" style={styles.logo} />

        <div style={styles.card}>
          <h2 style={styles.heading}>SIGN UP</h2>
          {error && <div style={styles.errorBox}>{error}</div>}

          <form onSubmit={handleSubmit} style={styles.form}>
            <div style={styles.row}>
              <Field label="First Name" style={{ flex: 1 }}>
                <input style={styles.input} type="text" placeholder="First name"
                  value={form.firstName} onChange={set('firstName')} autoComplete="given-name" />
              </Field>
              <Field label="Last Name" style={{ flex: 1 }}>
                <input style={styles.input} type="text" placeholder="Last name"
                  value={form.lastName} onChange={set('lastName')} autoComplete="family-name" />
              </Field>
            </div>

            <Field label="Mobile Number">
              <input style={styles.input} type="tel" placeholder="10-digit mobile number"
                value={form.mobile} onChange={set('mobile')} autoComplete="tel" maxLength={10} />
            </Field>

            <Field label="Email ID">
              <input style={styles.input} type="email" placeholder="your@email.com"
                value={form.email} onChange={set('email')} autoComplete="email" />
            </Field>

            <Field label="Create Password">
              <div style={styles.passwordWrap}>
                <input style={{ ...styles.input, paddingRight: 44 }}
                  type={showPass ? 'text' : 'password'} placeholder="Min. 6 characters"
                  value={form.password} onChange={set('password')} autoComplete="new-password" />
                <button type="button" style={styles.eyeBtn}
                  onClick={() => setShowPass((v) => !v)} tabIndex={-1}>
                  {showPass ? '🙈' : '👁️'}
                </button>
              </div>
            </Field>

            <Field label="Security Question">
              <select style={{ ...styles.input, cursor: 'pointer' }}
                value={form.securityQuestion} onChange={set('securityQuestion')}>
                {SECURITY_QUESTIONS.map((q) => (
                  <option key={q} value={q} style={{ background: '#0d1220', color: '#fff' }}>{q}</option>
                ))}
              </select>
            </Field>

            <Field label="Security Answer">
              <input style={styles.input} type="text" placeholder="Your answer"
                value={form.securityAnswer} onChange={set('securityAnswer')} />
            </Field>

            <button type="submit" disabled={loading}
              style={{ ...styles.submitBtn, ...(loading ? styles.submitBtnDisabled : {}) }}>
              {loading ? <Spinner /> : 'Sign Up'}
            </button>
          </form>
        </div>

        <p style={styles.switchText}>
          Already have an account?{' '}
          <button onClick={onGoSignIn} style={styles.switchLink}>Sign In</button>
        </p>
      </div>
    </div>
  );
}

function Field({ label, children, style }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, ...style }}>
      <label style={styles.label}>{label}</label>
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <>
      <style>{`@keyframes su-spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{
        width: 18, height: 18, border: '2.5px solid rgba(255,255,255,0.3)',
        borderTopColor: '#fff', borderRadius: '50%',
        animation: 'su-spin 0.7s linear infinite', display: 'inline-block',
      }} />
    </>
  );
}

const FONT = '"Outfit", -apple-system, BlinkMacSystemFont, sans-serif';
const TEAL = '#00C9A7';

const styles = {
  screen: {
    position: 'fixed', inset: 0,
    background: `radial-gradient(ellipse at 20% 20%, rgba(0,201,167,0.15) 0%, transparent 55%),
                 radial-gradient(ellipse at 80% 80%, rgba(0,229,204,0.1) 0%, transparent 55%),
                 #080C18`,
    overflowY: 'auto', WebkitOverflowScrolling: 'touch',
    display: 'flex', justifyContent: 'center', padding: '32px 0 40px',
  },
  orb1: {
    position: 'fixed', top: '-10%', left: '-10%',
    width: '55vw', height: '55vw', maxWidth: 350, maxHeight: 350,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(0,201,167,0.2) 0%, transparent 70%)',
    pointerEvents: 'none',
  },
  orb2: {
    position: 'fixed', bottom: '-10%', right: '-10%',
    width: '50vw', height: '50vw', maxWidth: 320, maxHeight: 320,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(0,229,204,0.15) 0%, transparent 70%)',
    pointerEvents: 'none',
  },
  container: {
    width: '100%', maxWidth: 420, padding: '0 24px',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    animation: 'signup-fade-in 0.5s ease-out forwards', zIndex: 1,
  },
  logo: {
    width: 200, maxWidth: '60vw',
    objectFit: 'contain',
    marginBottom: 16,
  },
  card: {
    width: '100%', background: 'rgba(0,201,167,0.04)',
    border: '1px solid rgba(0,201,167,0.25)', borderRadius: 20,
    padding: '28px 24px 24px',
    backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
  },
  heading: {
    fontSize: 22, fontWeight: 700, fontFamily: FONT,
    color: '#ffffff', letterSpacing: '2px', marginBottom: 20, textAlign: 'center',
  },
  errorBox: {
    background: 'rgba(255,80,80,0.08)', border: '1px solid rgba(255,80,80,0.3)',
    borderRadius: 10, padding: '10px 14px', fontSize: 13,
    color: '#ff8080', fontFamily: FONT, marginBottom: 16, textAlign: 'center',
  },
  form: { display: 'flex', flexDirection: 'column', gap: 14 },
  row: { display: 'flex', gap: 12 },
  label: {
    fontSize: 11, fontWeight: 600, fontFamily: FONT,
    color: 'rgba(255,255,255,0.45)', letterSpacing: '0.08em', textTransform: 'uppercase',
  },
  input: {
    background: 'rgba(255,255,255,0.05)', border: 'none',
    borderBottom: '1.5px solid rgba(0,201,167,0.4)',
    borderRadius: '8px 8px 0 0', padding: '11px 14px',
    fontSize: 14, fontFamily: FONT, color: '#ffffff',
    outline: 'none', width: '100%', transition: 'border-color 0.2s',
    WebkitAppearance: 'none',
  },
  passwordWrap: { position: 'relative' },
  eyeBtn: {
    position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
    background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16, padding: 4,
  },
  submitBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    background: `linear-gradient(135deg, #00C9A7, #00E5CC)`,
    border: 'none', borderRadius: 50, color: '#080C18',
    fontSize: 16, fontWeight: 700, fontFamily: FONT,
    padding: '15px 24px', cursor: 'pointer', letterSpacing: '0.05em',
    boxShadow: `0 4px 24px rgba(0,201,167,0.35)`,
    marginTop: 6, transition: 'opacity 0.15s',
  },
  submitBtnDisabled: { opacity: 0.65, cursor: 'not-allowed', boxShadow: 'none' },
  switchText: {
    fontSize: 14, fontFamily: FONT,
    color: 'rgba(255,255,255,0.4)', marginTop: 20, textAlign: 'center',
  },
  switchLink: {
    background: 'transparent', border: 'none',
    color: TEAL, fontSize: 14, fontFamily: FONT, cursor: 'pointer', fontWeight: 600, padding: 0,
  },
};
