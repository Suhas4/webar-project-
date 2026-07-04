import { useEffect } from 'react';

export default function AdsPlaceholder({ onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div style={s.screen}>
      <div style={s.adSlot}>
        <p style={s.placeholder}>Advertisement</p>
      </div>
      <button onClick={onDone} style={s.skipBtn}>Skip →</button>
    </div>
  );
}

const s = {
  screen: { position: 'fixed', inset: 0, background: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 9000 },
  adSlot: { width: '100%', maxWidth: 400, aspectRatio: '4/3', background: 'rgba(255,255,255,0.05)', border: '1px dashed rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  placeholder: { color: 'rgba(255,255,255,0.3)', fontSize: 14, fontFamily: 'Outfit,sans-serif', margin: 0 },
  skipBtn: { marginTop: 24, background: 'transparent', border: '1px solid rgba(255,255,255,0.25)', color: 'rgba(255,255,255,0.6)', borderRadius: 50, padding: '10px 28px', fontSize: 14, cursor: 'pointer', fontFamily: 'Outfit,sans-serif' },
};
