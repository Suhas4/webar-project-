import { useEffect } from 'react';

export default function SplashScreen({ onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div style={styles.screen}>
      <img src="/splash.jpg" alt="Memoera" style={styles.img} />
    </div>
  );
}

const styles = {
  screen: {
    position: 'fixed', inset: 0,
    background: '#061A1F',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  img: { width: '100%', height: '100%', objectFit: 'cover' },
};
