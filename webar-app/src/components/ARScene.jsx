import { useRef, useState, useCallback } from 'react';
import { useMindAR } from '../hooks/useMindAR.js';

export default function ARScene({ onStatusChange, targets, mindFileUrl }) {
  const containerRef = useRef(null);
  const [isTracking, setIsTracking] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  const handleStatusChange = useCallback((status, msg) => {
    setIsTracking(status === 'tracking');
    onStatusChange(status, msg);
  }, [onStatusChange]);

  const { lockedRef, pauseAllVideos } = useMindAR(containerRef, handleStatusChange, targets, mindFileUrl);

  const handleToggleLock = () => {
    if (isLocked) {
      lockedRef.current = false;
      setIsLocked(false);
      pauseAllVideos();
      onStatusChange('ready');
    } else {
      lockedRef.current = true;
      setIsLocked(true);
    }
  };

  return (
    <>
      <div
        ref={containerRef}
        style={{
          position: 'fixed', top: 0, left: 0,
          width: '100%', height: '100%',
          overflow: 'hidden', zIndex: 0, background: '#000',
        }}
      />
      {(isTracking || isLocked) && (
        <div style={{
          position: 'fixed', bottom: 48, left: '50%',
          transform: 'translateX(-50%)', zIndex: 10, pointerEvents: 'auto',
        }}>
          <button onClick={handleToggleLock} style={{
            background: isLocked ? 'rgba(201,168,76,0.92)' : 'rgba(0,201,167,0.92)',
            border: 'none', borderRadius: 50,
            color: '#000', fontSize: 15, fontWeight: 700,
            fontFamily: 'Outfit, sans-serif', padding: '13px 30px',
            cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
            letterSpacing: '0.03em', whiteSpace: 'nowrap',
          }}>
            {isLocked ? '📷 Back to Scan' : '▶ Keep Playing'}
          </button>
        </div>
      )}
    </>
  );
}
