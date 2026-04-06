import { useEffect } from 'react';

export default function WelcomeScreen({ onDone, user }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 2200);
    return () => clearTimeout(timer);
  }, [onDone]);

  const firstName = user?.firstName || '';

  return (
    <div style={styles.screen}>
      <style>{`
        @keyframes welcome-fade-in {
          from { opacity: 0; transform: scale(0.96); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes welcome-orb-pulse {
          0%, 100% { transform: scale(1);    opacity: 0.5; }
          50%       { transform: scale(1.1); opacity: 0.9; }
        }
      `}</style>

      <div style={styles.orb1} />
      <div style={styles.orb2} />
      <div style={styles.orb3} />

      <div style={styles.center}>
        <p style={styles.welcomeTo}>W E L C O M E &nbsp; T O</p>
        <img src="/logo.png" alt="Memoera" style={styles.logo} />
        {firstName ? <p style={styles.greeting}>Hello, {firstName} 👋</p> : null}
      </div>
    </div>
  );
}

const FONT = '"Outfit", -apple-system, BlinkMacSystemFont, sans-serif';
const TEAL = '#00C9A7';

const styles = {
  screen: {
    position: 'fixed', inset: 0,
    background: `radial-gradient(ellipse at 50% 40%, rgba(0,201,167,0.22) 0%, transparent 60%),
                 radial-gradient(ellipse at 20% 80%, rgba(0,229,204,0.14) 0%, transparent 50%),
                 radial-gradient(ellipse at 80% 10%, rgba(0,201,167,0.12) 0%, transparent 50%),
                 #080C18`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  orb1: {
    position: 'absolute', top: '10%', left: '50%', transform: 'translateX(-50%)',
    width: '80vw', height: '80vw', maxWidth: 500, maxHeight: 500,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(0,201,167,0.18) 0%, transparent 70%)',
    animation: 'welcome-orb-pulse 3s ease-in-out infinite',
    pointerEvents: 'none',
  },
  orb2: {
    position: 'absolute', bottom: '-20%', left: '-15%',
    width: '60vw', height: '60vw', maxWidth: 380, maxHeight: 380,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(0,229,204,0.16) 0%, transparent 70%)',
    animation: 'welcome-orb-pulse 3.5s ease-in-out 1s infinite',
    pointerEvents: 'none',
  },
  orb3: {
    position: 'absolute', top: '-10%', right: '-10%',
    width: '50vw', height: '50vw', maxWidth: 300, maxHeight: 300,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(0,201,167,0.12) 0%, transparent 70%)',
    animation: 'welcome-orb-pulse 4s ease-in-out 0.5s infinite',
    pointerEvents: 'none',
  },
  center: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
    animation: 'welcome-fade-in 1s ease-out forwards',
    zIndex: 1, textAlign: 'center', padding: '0 24px',
  },
  welcomeTo: {
    fontSize: 13, fontWeight: 300, fontFamily: FONT,
    color: 'rgba(255,255,255,0.4)', letterSpacing: '4px', margin: '0 0 8px',
  },
  logo: {
    width: 240, maxWidth: '70vw',
    objectFit: 'contain',
  },
  greeting: {
    fontSize: 16, fontWeight: 400, fontFamily: FONT,
    color: 'rgba(255,255,255,0.6)', marginTop: 20,
  },
};
