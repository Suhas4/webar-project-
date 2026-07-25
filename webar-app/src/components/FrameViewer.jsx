import { useEffect, useRef, useState, useCallback } from 'react';

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const TEAL = "#00C9A7";

export default function FrameViewer({ title, framesPath, total, onBack, canvasWidth = 540, canvasHeight = 304 }) {
  const canvasRef   = useRef(null);
  const framesRef   = useRef([]);
  const rafRef      = useRef(null);
  const frameIdxRef = useRef(0);
  const lastTsRef   = useRef(0);
  // Invisible joystick refs
  const joyXRef      = useRef(0);
  const joyDragRef   = useRef(false);
  const joyCenterRef = useRef({ x: 0, y: 0 });
  const outerRef     = useRef(null);

  // Canvas drag refs
  const canvasDragRef  = useRef(false);
  const dragStartXRef  = useRef(0);
  const frameAtDragRef = useRef(0);

  const [loaded,    setLoaded]    = useState(0);
  const [joyKnob,   setJoyKnob]   = useState({ x: 0, y: 0 });
  const [joyActive, setJoyActive] = useState(false);

  // ── Preload frames ────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    setLoaded(0);
    frameIdxRef.current = 0;
    const imgs = new Array(total);
    let done = 0;
    for (let i = 0; i < total; i++) {
      const img = new Image();
      img.src = `${framesPath}/frame_${String(i).padStart(4, '0')}.jpg`;
      img.onload = img.onerror = () => { done++; if (mounted) setLoaded(done); };
      imgs[i] = img;
    }
    framesRef.current = imgs;
    return () => { mounted = false; };
  }, [framesPath, total]);

  const drawFrame = useCallback((idx) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const img = framesRef.current[idx];
    if (img?.complete && img.naturalWidth > 0)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  }, []);

  // ── RAF — joystick overrides, else auto ping-pong at 10 fps ──────────
  useEffect(() => {
    if (loaded < total) return;
    drawFrame(0);

    function tick(ts) {
      const speed = joyXRef.current;

      if (Math.abs(speed) > 0.06) {
        // Joystick active — speed-proportional playback (max ~25fps)
        const interval = 40 / Math.abs(speed);
        if (ts - lastTsRef.current >= interval) {
          lastTsRef.current = ts;
          const dir  = speed > 0 ? 1 : -1;
          const next = ((frameIdxRef.current + dir) + total) % total;
          frameIdxRef.current = next;
          drawFrame(next);
        }
      }
      // No joystick input → do nothing (canvas drag handles scrubbing directly)
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [loaded, total, drawFrame]);

  // ── Invisible joystick handlers ───────────────────────────────────────
  const OUTER_R = 56, MAX_D = 34;

  const onJoyDown = useCallback((e) => {
    joyDragRef.current = true;
    setJoyActive(true);
    const rect = outerRef.current.getBoundingClientRect();
    joyCenterRef.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  }, []);

  const onJoyMove = useCallback((e) => {
    if (!joyDragRef.current) return;
    const dx = e.clientX - joyCenterRef.current.x;
    const dy = e.clientY - joyCenterRef.current.y;
    const dist  = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    const c = Math.min(dist, MAX_D);
    joyXRef.current = (c * Math.cos(angle)) / MAX_D;
    setJoyKnob({ x: c * Math.cos(angle), y: c * Math.sin(angle) });
    e.preventDefault();
  }, []);

  const onJoyUp = useCallback(() => {
    joyDragRef.current = false;
    joyXRef.current = 0;
    setJoyActive(false);
    setJoyKnob({ x: 0, y: 0 });
  }, []);

  // ── Canvas drag scrub ─────────────────────────────────────────────────
  const onCanvasDown = useCallback((e) => {
    canvasDragRef.current = true;
    dragStartXRef.current = e.clientX;
    frameAtDragRef.current = frameIdxRef.current;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  }, []);

  const onCanvasMove = useCallback((e) => {
    if (!canvasDragRef.current) return;
    const delta = e.clientX - dragStartXRef.current;
    const next  = ((frameAtDragRef.current + Math.round(delta / 7)) % total + total) % total;
    frameIdxRef.current = next;
    drawFrame(next);
    e.preventDefault();
  }, [drawFrame, total]);

  const onCanvasUp = useCallback(() => { canvasDragRef.current = false; }, []);

  const pct       = Math.round((loaded / total) * 100);
  const isLoading = loaded < total;

  return (
    <div style={{ position:'fixed', inset:0, background:'#FFFFFF',
      fontFamily:FONT, overflow:'hidden', userSelect:'none' }}>

      <style>{`@keyframes colSpin { to { transform:rotate(360deg); } }`}</style>

      {/* ── Canvas — fills the entire screen in any orientation ── */}
      <canvas
        ref={canvasRef}
        width={canvasWidth} height={canvasHeight}
        onPointerDown={onCanvasDown}
        onPointerMove={onCanvasMove}
        onPointerUp={onCanvasUp}
        onPointerCancel={onCanvasUp}
        style={{ position:'absolute', inset:0, width:'100%', height:'100%', display:'block',
          background:'#FFFFFF', objectFit:'contain',
          touchAction:'none', cursor:'grab' }}
      />

      {/* ── Header — floating overlay ── */}
      <div style={{ display:'flex', alignItems:'center',
        padding:'max(12px, env(safe-area-inset-top)) 16px 0',
        position:'absolute', top:0, left:0, right:0, zIndex:10 }}>
        <button onClick={onBack}
          style={{ background:'rgba(255,255,255,0.85)', border:'1.5px solid rgba(0,0,0,0.18)',
            borderRadius:20, color:'#1A1A2E', fontSize:13, fontWeight:600, fontFamily:FONT,
            padding:'8px 16px', cursor:'pointer', backdropFilter:'blur(6px)' }}>
          ← Back
        </button>
        <div style={{ marginLeft:14, background:'rgba(255,255,255,0.85)', borderRadius:14,
          padding:'6px 12px', backdropFilter:'blur(6px)' }}>
          <div style={{ fontSize:15, fontWeight:700, color:'#1A1A2E', letterSpacing:'0.02em' }}>
            {title}
          </div>
        </div>
      </div>

      {/* ── Invisible joystick touch area — bottom centre ── */}
      {!isLoading && (
        <div style={{ display:'flex', justifyContent:'center',
          padding:'14px 0 max(20px, env(safe-area-inset-bottom))', background:'transparent',
          position:'absolute', bottom:0, left:0, right:0, zIndex:10 }}>
          <div
            ref={outerRef}
            onPointerDown={onJoyDown}
            onPointerMove={onJoyMove}
            onPointerUp={onJoyUp}
            onPointerCancel={onJoyUp}
            style={{ width: OUTER_R * 2, height: OUTER_R * 2,
              borderRadius:'50%', opacity:0,
              cursor:'grab', touchAction:'none', pointerEvents:'auto' }}>
            <div style={{ width:44, height:44, borderRadius:'50%',
              transform:`translate(${joyKnob.x}px, ${joyKnob.y}px)`,
              transition: joyActive ? 'none' : 'transform 0.12s ease' }} />
          </div>
        </div>
      )}

      {/* ── Loading overlay ── */}
      {isLoading && (
        <div style={{ position:'absolute', inset:0, background:'#FFFFFF', zIndex:20,
          display:'flex', flexDirection:'column', alignItems:'center',
          justifyContent:'center', gap:18 }}>
          <img src="/logo1.png" alt="Memoera"
            style={{ width:58, height:58, objectFit:'contain',
              animation:'colSpin 2s linear infinite' }} />
          <div style={{ fontSize:14, fontWeight:700, color:TEAL, fontFamily:FONT }}>
            Loading Frames…
          </div>
          <div style={{ width:200, height:4, borderRadius:2,
            background:'rgba(0,0,0,0.08)', overflow:'hidden' }}>
            <div style={{ height:'100%', borderRadius:2, background:TEAL,
              width: pct + '%', transition:'width 0.25s ease' }} />
          </div>
          <div style={{ fontSize:11, color:'rgba(0,0,0,0.38)', fontFamily:FONT }}>
            {pct}%
          </div>
        </div>
      )}
    </div>
  );
}
