import { useRef, useEffect, useState } from 'react';

const FONT = '"Outfit", -apple-system, BlinkMacSystemFont, sans-serif';

const isSecureContext = () =>
  window.isSecureContext || location.protocol === 'https:' || location.hostname === 'localhost';

// getUserMedia-based camera — captures to canvas blob, never saves to device gallery.
// Falls back to <input capture> on HTTP (non-secure context) where getUserMedia is blocked.
export default function CameraCapture({ onCapture, onClose, facingMode = 'environment' }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fallbackInputRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const secure = isSecureContext();

  // On non-secure context, trigger the fallback input immediately
  useEffect(() => {
    if (!secure) {
      setTimeout(() => fallbackInputRef.current?.click(), 100);
    }
  }, [secure]);

  useEffect(() => {
    if (!secure) return;
    let cancelled = false;
    navigator.mediaDevices.getUserMedia({ video: { facingMode }, audio: false })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => { if (!cancelled) setReady(true); };
        }
      })
      .catch((err) => { if (!cancelled) setError('Camera access denied. Please allow camera permission.'); });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [facingMode, secure]);

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
      streamRef.current?.getTracks().forEach(t => t.stop());
      onCapture(file);
    }, 'image/jpeg', 0.92);
  };

  // Non-secure context: use OS camera via file input (may save locally, but works on HTTP)
  if (!secure) {
    return (
      <div style={{ display: 'none' }}>
        <input
          ref={fallbackInputRef}
          type="file" accept="image/*" capture={facingMode === 'user' ? 'user' : 'environment'}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onCapture(f); else onClose(); }}
          onClick={(e) => { e.target.value = ''; }}
        />
      </div>
    );
  }

  return (
    <div style={s.overlay}>
      {error ? (
        <div style={s.errorWrap}>
          <p style={s.errorText}>{error}</p>
          <button style={s.closeBtn} onClick={onClose}>Close</button>
        </div>
      ) : (
        <>
          <video ref={videoRef} autoPlay playsInline muted style={s.video} />
          <div style={s.controls}>
            <button style={s.cancelBtn} onClick={() => { streamRef.current?.getTracks().forEach(t => t.stop()); onClose(); }}>Cancel</button>
            <button style={{ ...s.captureBtn, ...(ready ? {} : s.captureBtnDisabled) }} onClick={handleCapture} disabled={!ready}>
              <div style={s.captureInner} />
            </button>
            <div style={{ width: 64 }} />
          </div>
        </>
      )}
    </div>
  );
}

const s = {
  overlay: {
    position: 'fixed', inset: 0, background: '#000',
    zIndex: 2000, display: 'flex', flexDirection: 'column',
  },
  video: { flex: 1, width: '100%', objectFit: 'cover' },
  controls: {
    padding: '20px 32px 48px', display: 'flex',
    alignItems: 'center', justifyContent: 'space-between',
    background: 'rgba(0,0,0,0.85)',
  },
  cancelBtn: {
    background: 'transparent', border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: 20, color: '#fff', fontSize: 14,
    fontFamily: FONT, padding: '8px 18px', cursor: 'pointer', width: 64,
  },
  captureBtn: {
    width: 68, height: 68, borderRadius: '50%',
    border: '3px solid #fff', background: 'transparent',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer',
  },
  captureBtnDisabled: { opacity: 0.4, cursor: 'not-allowed' },
  captureInner: {
    width: 54, height: 54, borderRadius: '50%', background: '#fff',
  },
  errorWrap: {
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32,
  },
  errorText: { color: '#fff', fontFamily: FONT, fontSize: 15, textAlign: 'center' },
  closeBtn: {
    background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: 20, color: '#fff', fontSize: 14, fontFamily: FONT,
    padding: '10px 24px', cursor: 'pointer',
  },
};
