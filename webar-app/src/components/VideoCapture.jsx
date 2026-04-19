import { useRef, useEffect, useState } from 'react';

const FONT = '"Outfit", -apple-system, BlinkMacSystemFont, sans-serif';

const isSecureContext = () =>
  window.isSecureContext || location.protocol === 'https:' || location.hostname === 'localhost';

// MediaRecorder-based video capture — never saves to device gallery.
// Falls back to <input capture> on HTTP.
export default function VideoCapture({ onCapture, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const fallbackInputRef = useRef(null);
  const [recording, setRecording] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef(null);
  const secure = isSecureContext();

  useEffect(() => {
    if (!secure) {
      setTimeout(() => fallbackInputRef.current?.click(), 100);
      return;
    }
    let cancelled = false;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: true })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => { if (!cancelled) setReady(true); };
        }
      })
      .catch(() => { if (!cancelled) setError('Camera access denied.'); });
    return () => {
      cancelled = true;
      clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [secure]);

  const startRecording = () => {
    if (!streamRef.current) return;
    chunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : 'video/mp4';
    const recorder = new MediaRecorder(streamRef.current, { mimeType });
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
      const file = new File([blob], `video-${Date.now()}.${ext}`, { type: mimeType });
      streamRef.current?.getTracks().forEach(t => t.stop());
      onCapture(file);
    };
    recorder.start(100);
    recorderRef.current = recorder;
    setRecording(true);
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
  };

  const stopRecording = () => {
    clearInterval(timerRef.current);
    recorderRef.current?.stop();
    setRecording(false);
  };

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;

  if (!secure) {
    return (
      <div style={{ display: 'none' }}>
        <input ref={fallbackInputRef} type="file" accept="video/mp4,video/webm" capture="environment"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onCapture(f); else onClose(); }}
          onClick={(e) => { e.target.value = ''; }} />
      </div>
    );
  }

  return (
    <div style={s.overlay}>
      {error ? (
        <div style={s.center}>
          <p style={s.errorText}>{error}</p>
          <button style={s.btn} onClick={onClose}>Close</button>
        </div>
      ) : (
        <>
          <video ref={videoRef} autoPlay playsInline muted style={s.video} />
          {recording && <div style={s.timer}>{fmt(elapsed)}</div>}
          <div style={s.controls}>
            <button style={s.cancelBtn} onClick={() => { streamRef.current?.getTracks().forEach(t => t.stop()); onClose(); }}>
              Cancel
            </button>
            {recording ? (
              <button style={s.stopBtn} onClick={stopRecording} disabled={!ready}>
                <div style={s.stopIcon} />
              </button>
            ) : (
              <button style={{ ...s.recBtn, ...(ready ? {} : s.disabled) }} onClick={startRecording} disabled={!ready}>
                <div style={s.recIcon} />
              </button>
            )}
            <div style={{ width: 64 }} />
          </div>
        </>
      )}
    </div>
  );
}

const s = {
  overlay: { position:'fixed',inset:0,background:'#000',zIndex:2000,display:'flex',flexDirection:'column' },
  video: { flex:1,width:'100%',objectFit:'cover' },
  timer: { position:'absolute',top:20,left:'50%',transform:'translateX(-50%)',background:'rgba(255,0,0,0.7)',color:'#fff',fontSize:16,fontWeight:700,fontFamily:FONT,padding:'4px 14px',borderRadius:20 },
  controls: { padding:'20px 32px 48px',display:'flex',alignItems:'center',justifyContent:'space-between',background:'rgba(0,0,0,0.85)' },
  cancelBtn: { background:'transparent',border:'1px solid rgba(255,255,255,0.3)',borderRadius:20,color:'#fff',fontSize:14,fontFamily:FONT,padding:'8px 18px',cursor:'pointer',width:64 },
  recBtn: { width:68,height:68,borderRadius:'50%',border:'3px solid #fff',background:'transparent',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer' },
  recIcon: { width:40,height:40,borderRadius:'50%',background:'#ff3b30' },
  stopBtn: { width:68,height:68,borderRadius:'50%',border:'3px solid #fff',background:'transparent',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer' },
  stopIcon: { width:28,height:28,borderRadius:4,background:'#fff' },
  disabled: { opacity:0.4,cursor:'not-allowed' },
  center: { flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:16,padding:32 },
  errorText: { color:'#fff',fontFamily:FONT,fontSize:15,textAlign:'center' },
  btn: { background:'rgba(255,255,255,0.15)',border:'1px solid rgba(255,255,255,0.3)',borderRadius:20,color:'#fff',fontSize:14,fontFamily:FONT,padding:'10px 24px',cursor:'pointer' },
};
