import { useEffect, useRef } from 'react';

export default function VideoOverlay({ src, onDone }) {
  const ref = useRef(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    // Fallback: if video can't play or errors, call onDone after 3s
    const fallback = setTimeout(() => onDone && onDone(), 3000);
    const onEnd = () => { clearTimeout(fallback); onDone && onDone(); };
    const onError = () => { clearTimeout(fallback); onDone && onDone(); };
    v.addEventListener('ended', onEnd);
    v.addEventListener('error', onError);
    v.play().catch(() => {});
    return () => {
      clearTimeout(fallback);
      v.removeEventListener('ended', onEnd);
      v.removeEventListener('error', onError);
    };
  }, [onDone]);

  return (
    <div style={styles.overlay}>
      <video ref={ref} src={src} muted playsInline style={styles.video} />
    </div>
  );
}

const styles = {
  overlay: { position:'fixed',inset:0,zIndex:9999,background:'#000',
    display:'flex',alignItems:'center',justifyContent:'center' },
  video: { width:'100%',height:'100%',objectFit:'contain' },
};
