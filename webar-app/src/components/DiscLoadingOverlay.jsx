import { useEffect, useRef, useState } from 'react';

export default function DiscLoadingOverlay({ onDone }) {
  const [phase, setPhase] = useState('disc');
  const ref = useRef(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.play().catch(() => {});
    const onEnd = () => {
      if (phase === 'disc') {
        setPhase('wings');
      } else {
        onDone && onDone();
      }
    };
    v.addEventListener('ended', onEnd);
    return () => v.removeEventListener('ended', onEnd);
  }, [phase, onDone]);

  return (
    <div style={styles.overlay}>
      <video key={phase} ref={ref}
        src={phase === 'disc' ? '/disc-loading.mp4' : '/wings-to-memories.mp4'}
        muted playsInline autoPlay style={styles.video} />
    </div>
  );
}

const styles = {
  overlay: { position:'fixed',inset:0,zIndex:9998,background:'#000',
    display:'flex',alignItems:'center',justifyContent:'center' },
  video: { width:'100%',height:'100%',objectFit:'contain' },
};
