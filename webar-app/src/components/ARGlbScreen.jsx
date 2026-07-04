import { useEffect, useRef, useState } from 'react';

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";

export default function ARGlbScreen({ glbUrl, onBack }) {
  const iframeRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [shared, setShared] = useState(false);
  const src = `/ar-glb.html?glb=${encodeURIComponent(glbUrl)}`;

  useEffect(() => {
    const handler = (e) => {
      if (e.data?.type === 'ar-glb-close') onBack();
      if (e.data?.type === 'ar-glb-ready') setReady(true);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onBack]);

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Memoera 3D Model', url: glbUrl });
        return;
      }
      await navigator.clipboard.writeText(glbUrl);
      setShared(true);
      setTimeout(() => setShared(false), 1800);
    } catch (_) {}
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 200 }}>
      <iframe
        ref={iframeRef}
        src={src}
        title="3D Model Viewer"
        allow="camera; xr-spatial-tracking; accelerometer; gyroscope"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none', display: 'block' }}
      />
      {ready && (
        <button onClick={handleShare} style={s.shareBtn} title="Share this 3D model">
          {shared ? '✓ Link copied' : '↗ Share'}
        </button>
      )}
      {!ready && (
        <div style={s.overlay}>
          <img src="/logo1.png" alt="" style={s.logo} />
          <Spinner />
          <p style={s.text}>Loading 3D model…</p>
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <>
      <style>{`@keyframes arglb-spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{
        width: 40, height: 40,
        border: '3px solid rgba(0,201,167,0.2)',
        borderTopColor: '#00C9A7', borderRadius: '50%',
        animation: 'arglb-spin 0.75s linear infinite',
      }} />
    </>
  );
}

const s = {
  overlay: {
    position: 'absolute', inset: 0, zIndex: 5,
    background: '#101418',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18,
  },
  logo: { width: 84, height: 84, objectFit: 'contain', borderRadius: 20 },
  text: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontFamily: FONT, margin: 0 },
  shareBtn: {
    position: 'absolute', top: 16, right: 16, zIndex: 30,
    background: 'rgba(0,0,0,0.35)', border: 'none', borderRadius: 8,
    color: '#fff', fontSize: 14, fontWeight: 600, fontFamily: FONT,
    padding: '8px 16px', cursor: 'pointer',
  },
};
