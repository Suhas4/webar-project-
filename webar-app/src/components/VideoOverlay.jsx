import { useEffect, useRef, useState } from 'react';

export default function VideoOverlay({ src, onDone }) {
  const ref = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const safety    = setTimeout(() => onDone && onDone(), 120000);
    const onEnd     = () => { clearTimeout(safety); onDone && onDone(); };
    const onError   = () => { clearTimeout(safety); onDone && onDone(); };
    const onCanPlay = () => setReady(true);
    v.addEventListener('ended',    onEnd);
    v.addEventListener('error',    onError);
    v.addEventListener('canplay',  onCanPlay);
    v.play().catch(() => {});
    return () => {
      clearTimeout(safety);
      v.removeEventListener('ended',   onEnd);
      v.removeEventListener('error',   onError);
      v.removeEventListener('canplay', onCanPlay);
    };
  }, [onDone]);

  const block = (e) => { e.preventDefault(); e.stopPropagation(); };

  return (
    <div
      style={styles.overlay}
      onClick={block} onTouchStart={block} onTouchEnd={block}
      onMouseDown={block} onContextMenu={block}
    >
      <video
        ref={ref}
        src={src}
        muted
        playsInline
        autoPlay
        preload="auto"
        style={{
          ...styles.video,
          pointerEvents: 'none',
          opacity: ready ? 1 : 0,
          transition: 'opacity 0.2s ease',
        }}
      />
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 9999,
    background: '#040D0B',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    userSelect: 'none', WebkitUserSelect: 'none',
  },
  video: {
    position: 'absolute', inset: 0,
    width: '100%', height: '100%', objectFit: 'contain',
  },
};
