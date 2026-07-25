import { useEffect, useState } from 'react';

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";

// Mounted once at the app root — shows a small banner whenever the device
// loses its network connection, regardless of which screen is active.
export default function OfflineBanner() {
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline  = () => setOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div style={s.banner}>
      <span style={s.dot} />
      <span style={s.text}>No internet connection</span>
    </div>
  );
}

const s = {
  banner: {
    position: 'fixed', top: 0, left: 0, right: 0, zIndex: 99999,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    background: 'rgba(180,40,40,0.92)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
    padding: '10px 16px', paddingTop: 'calc(10px + env(safe-area-inset-top, 0px))',
    pointerEvents: 'none',
  },
  dot:  { width: 8, height: 8, borderRadius: '50%', background: '#fff', flexShrink: 0 },
  text: { color: '#fff', fontSize: 13, fontWeight: 600, fontFamily: FONT, letterSpacing: '0.02em' },
};
