import { useEffect, useRef } from 'react';

export default function VideoOverlay({ src, onDone }) {
  const ref = useRef(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.play().catch(() => {});
    const onEnd = () => onDone && onDone();
    v.addEventListener('ended', onEnd);
    return () => v.removeEventListener('ended', onEnd);
  }, [onDone]);

  return (
    <div style={styles.overlay}>
      <video ref={ref} src={src} muted playsInline
        style={styles.video} />
    </div>
  );
}

const styles = {
  overlay: { position:'fixed',inset:0,zIndex:9999,background:'#000',
    display:'flex',alignItems:'center',justifyContent:'center' },
  video: { width:'100%',height:'100%',objectFit:'contain' },
};
