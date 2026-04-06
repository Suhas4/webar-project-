import { useState, useCallback } from 'react';

const API_BASE = 'https://webar-project-8jbi.onrender.com';

export default function SignInScreen({ onSuccess, onGoSignUp, successMessage }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword]     = useState('');
  const [showPass, setShowPass]     = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      setError('Please enter your email/mobile and password.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/auth/signin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Sign in failed. Please try again.');
        return;
      }
      localStorage.setItem('memoera_token', data.token);
      localStorage.setItem('memoera_user', JSON.stringify(data.user));
      onSuccess(data.user);
    } catch {
      setError('Cannot connect to server. Make sure the backend is running.');
    } finally {
      setLoading(false);
    }
  }, [identifier, password, onSuccess]);

  return (
    <div style={styles.screen}>
      <style>{`
        @keyframes signin-fade-in {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        input::placeholder { color: rgba(255,255,255,0.25); }
        input:focus { border-bottom-color: #00C9A7 !important; outline: none; }
        select:focus { outline: none; }
      `}</style>

      <div style={styles.orb1} />
      <div style={styles.orb2} />

      <div style={styles.container}>
        <img src="/logo.png" alt="Memoera" style={styles.logo} />

        <div style={styles.card}>
          <h2 style={styles.heading}>SIGN IN</h2>

          {successMessage && <div style={styles.successBox}>{successMessage}</div>}
          {error && <div style={styles.errorBox}>{error}</div>}

          <form onSubmit={handleSubmit} style={styles.form}>
            <div style={styles.fieldWrap}>
              <label style={styles.label}>Email or Mobile Number</label>
              <input
                style={styles.input}
                type="text"
                placeholder="Enter email or mobile"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoComplete="username"
              />
            </div>

            <div style={styles.fieldWrap}>
              <label style={styles.label}>Password</label>
              <div style={styles.passwordWrap}>
                <input
                  style={{ ...styles.input, paddingRight: 44 }}
                  type={showPass ? 'text' : 'password'}
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <button type="button" style={styles.eyeBtn}
                  onClick={() => setShowPass((v) => !v)} tabIndex={-1}>
                  {showPass ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <button type="button" style={styles.forgotLink}>Forgot Password?</button>

            <button type="submit" disabled={loading}
              style={{ ...styles.submitBtn, ...(loading ? styles.submitBtnDisabled : {}) }}>
              {loading ? <Spinner /> : 'Sign In'}
            </button>
          </form>
        </div>

        <p style={styles.switchText}>
          Don't have an account?{' '}
          <button onClick={onGoSignUp} style={styles.switchLink}>Sign Up</button>
        </p>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <>
      <style>{`@keyframes si-spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{
        width: 18, height: 18,
        border: '2.5px solid rgba(255,255,255,0.3)',
        borderTopColor: '#fff', borderRadius: '50%',
        animation: 'si-spin 0.7s linear infinite', display: 'inline-block',
      }} />
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
                 radial-gradient(ellipse at 80% 80%, rgba(0,229,204,0.1) 0%, transparent 55%),
                 #080C18`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '24px 0',
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
    width: '100%', maxWidth: 400, padding: '0 24px',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    animation: 'signin-fade-in 0.5s ease-out forwards', zIndex: 1,
  },
  logo: {
    width: 200, maxWidth: '60vw',
    objectFit: 'contain',
    marginBottom: 20,
  },
  card: {
    width: '100%',
    background: 'rgba(0,201,167,0.04)',
    border: '1px solid rgba(0,201,167,0.25)',
    borderRadius: 20, padding: '28px 24px 24px',
    backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
  },
  heading: {
    fontSize: 22, fontWeight: 700, fontFamily: FONT,
    color: '#ffffff', letterSpacing: '2px', marginBottom: 20, textAlign: 'center',
  },
  successBox: {
    background: 'rgba(0,201,167,0.1)', border: '1px solid rgba(0,201,167,0.35)',
    borderRadius: 10, padding: '10px 14px', fontSize: 13,
    color: TEAL, fontFamily: FONT, marginBottom: 16, textAlign: 'center',
  },
  errorBox: {
    background: 'rgba(255,80,80,0.08)', border: '1px solid rgba(255,80,80,0.3)',
    borderRadius: 10, padding: '10px 14px', fontSize: 13,
    color: '#ff8080', fontFamily: FONT, marginBottom: 16, textAlign: 'center',
  },
  form: { display: 'flex', flexDirection: 'column', gap: 16 },
  fieldWrap: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: {
    fontSize: 11, fontWeight: 600, fontFamily: FONT,
    color: 'rgba(255,255,255,0.45)', letterSpacing: '0.08em', textTransform: 'uppercase',
  },
  input: {
    background: 'rgba(255,255,255,0.05)',
    border: 'none', borderBottom: '1.5px solid rgba(0,201,167,0.4)',
    borderRadius: '8px 8px 0 0', padding: '12px 14px',
    fontSize: 15, fontFamily: FONT, color: '#ffffff',
    outline: 'none', width: '100%', transition: 'border-color 0.2s',
  },
  passwordWrap: { position: 'relative' },
  eyeBtn: {
    position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
    background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16, padding: 4,
  },
  forgotLink: {
    background: 'transparent', border: 'none',
    color: 'rgba(255,255,255,0.35)', fontSize: 13, fontFamily: FONT,
    cursor: 'pointer', textAlign: 'right', padding: 0,
    marginTop: -8, textDecoration: 'underline', alignSelf: 'flex-end',
  },
  submitBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    background: `linear-gradient(135deg, #00C9A7, #00E5CC)`,
    border: 'none', borderRadius: 50, color: '#080C18',
    fontSize: 16, fontWeight: 700, fontFamily: FONT,
    padding: '15px 24px', cursor: 'pointer', letterSpacing: '0.05em',
    boxShadow: `0 4px 24px rgba(0,201,167,0.35)`,
    marginTop: 4, transition: 'opacity 0.15s',
  },
  submitBtnDisabled: { opacity: 0.65, cursor: 'not-allowed', boxShadow: 'none' },
  switchText: {
    fontSize: 14, fontFamily: FONT,
    color: 'rgba(255,255,255,0.4)', marginTop: 20, textAlign: 'center',
  },
  switchLink: {
    background: 'transparent', border: 'none',
    color: TEAL, fontSize: 14, fontFamily: FONT,
    cursor: 'pointer', fontWeight: 600, padding: 0,
  },
};
