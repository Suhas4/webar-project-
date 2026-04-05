import { useEffect } from 'react';

export default function SplashScreen({ onDone }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 2500);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div style={styles.screen}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap');
        @keyframes splash-fade-in {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes orb-pulse {
          0%, 100% { transform: scale(1); opacity: 0.5; }
          50%       { transform: scale(1.08); opacity: 0.9; }
        }
        @keyframes dot-bounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.3; }
          40%            { transform: scale(1);   opacity: 1; }
        }
      `}</style>

      <div style={styles.orb1} />
      <div style={styles.orb2} />

      <div style={styles.center}>
        <div style={styles.logoWrap}>
          <span style={styles.logoMemo}>memo</span>
          <span style={styles.logoEra}>era</span>
        </div>
        <p style={styles.tagline}>Restoring Memories</p>
        <div style={styles.dots}>
          {['0s','0.2s','0.4s'].map((d) => (
            <div key={d} style={{
              width: 6, height: 6, borderRadius: '50%',
              background: TEAL,
              animation: `dot-bounce 1.4s ease-in-out ${d} infinite`,
            }} />
          ))}
        </div>
      </div>
    </div>
  );
}

const FONT = '"Outfit", -apple-system, BlinkMacSystemFont, sans-serif';
const TEAL = '#00C9A7';
const CYAN = '#00E5CC';

const styles = {
  screen: {
    position: 'fixed', inset: 0,
    background: `radial-gradient(ellipse at 25% 25%, rgba(0,201,167,0.18) 0%, transparent 55%),
                 radial-gradient(ellipse at 75% 75%, rgba(0,229,204,0.12) 0%, transparent 55%),
                 #080C18`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  orb1: {
    position: 'absolute', top: '-15%', left: '-10%',
    width: '60vw', height: '60vw', maxWidth: 400, maxHeight: 400,
    borderRadius: '50%',
    background: `radial-gradient(circle, rgba(0,201,167,0.25) 0%, transparent 70%)`,
    animation: 'orb-pulse 4s ease-in-out infinite',
    pointerEvents: 'none',
  },
  orb2: {
    position: 'absolute', bottom: '-15%', right: '-10%',
    width: '55vw', height: '55vw', maxWidth: 360, maxHeight: 360,
    borderRadius: '50%',
    background: `radial-gradient(circle, rgba(0,229,204,0.2) 0%, transparent 70%)`,
    animation: 'orb-pulse 4s ease-in-out 2s infinite',
    pointerEvents: 'none',
  },
  center: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
    animation: 'splash-fade-in 0.8s ease-out forwards',
    zIndex: 1,
  },
  logoWrap: { display: 'flex', alignItems: 'baseline' },
  logoMemo: {
    fontSize: 52, fontWeight: 700, fontFamily: FONT,
    color: '#ffffff', letterSpacing: '-1px', lineHeight: 1,
  },
  logoEra: {
    fontSize: 52, fontWeight: 300, fontFamily: FONT,
    color: TEAL, letterSpacing: '-1px', lineHeight: 1, fontStyle: 'italic',
  },
  tagline: {
    fontSize: 12, fontWeight: 400, fontFamily: FONT,
    color: 'rgba(255,255,255,0.4)', letterSpacing: '3px',
    textTransform: 'uppercase', margin: '4px 0 16px',
  },
  dots: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 },
};
