import { useEffect, useRef, useState, useCallback } from 'react';

const FONT  = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const TEAL  = "#00C9A7";
const TOTAL = 98;
const FRAMES_PATH = '/car-frames';
const DEG_PER_FRAME = 360 / TOTAL;

function playEngineSound() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(55, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.5);
    osc.frequency.exponentialRampToValueAtTime(95,  ctx.currentTime + 1.3);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.7);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 1.8);
  } catch { /* audio not available — ignore */ }
}

function playRevSound() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(90, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(240, ctx.currentTime + 0.18);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch { /* audio not available — ignore */ }
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > 180)  d -= 360;
  while (d < -180) d += 360;
  return d;
}

// Slow-motion factor — wheel must turn 5.5x further per frame step
const WHEEL_DEG_PER_FRAME = DEG_PER_FRAME * 5.5;

export default function CarFrameViewer({ onBack }) {
  const [phase, setPhase] = useState('start'); // 'start' | 'starting' | 'running'

  const canvasRef   = useRef(null);
  const framesRef   = useRef([]);
  const frameIdxRef = useRef(0);

  // Canvas drag scrub refs
  const canvasDragRef  = useRef(false);
  const dragStartXRef  = useRef(0);
  const frameAtDragRef = useRef(0);

  // Steering wheel refs
  const wheelGroupRef  = useRef(null);
  const wheelWrapRef   = useRef(null);
  const wheelDragRef   = useRef(false);
  const lastAngleRef   = useRef(0);
  const wheelRotRef    = useRef(0);
  const frameAccumRef  = useRef(0);
  const lastSoundTsRef = useRef(0);

  const [loaded, setLoaded] = useState(0);

  // ── Preload car frames as soon as component mounts ─────────────────────
  useEffect(() => {
    let mounted = true;
    const imgs = new Array(TOTAL);
    let done = 0;
    for (let i = 0; i < TOTAL; i++) {
      const img = new Image();
      img.src = `${FRAMES_PATH}/frame_${String(i).padStart(4, '0')}.jpg`;
      img.onload = img.onerror = () => { done++; if (mounted) setLoaded(done); };
      imgs[i] = img;
    }
    framesRef.current = imgs;
    return () => { mounted = false; };
  }, []);

  const drawFrame = useCallback((idx) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const img = framesRef.current[idx];
    if (img?.complete && img.naturalWidth > 0)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  }, []);

  // Draw first frame once running & loaded
  useEffect(() => {
    if (phase === 'running' && loaded >= TOTAL) drawFrame(0);
  }, [phase, loaded, drawFrame]);

  // ── Start Engine → ignition sequence → running ──────────────────────────
  const handleStartEngine = useCallback(() => {
    playEngineSound();
    setPhase('starting');
    setTimeout(() => setPhase('running'), 1900);
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
    const next  = ((frameAtDragRef.current + Math.round(delta / 7)) % TOTAL + TOTAL) % TOTAL;
    frameIdxRef.current = next;
    drawFrame(next);
    e.preventDefault();
  }, [drawFrame]);

  const onCanvasUp = useCallback(() => { canvasDragRef.current = false; }, []);

  // ── Steering wheel drag → rotates wheel + drives frame index ───────────
  const wheelAngleAt = useCallback((clientX, clientY) => {
    const rect = wheelWrapRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return Math.atan2(clientY - cy, clientX - cx) * (180 / Math.PI);
  }, []);

  const onWheelDown = useCallback((e) => {
    wheelDragRef.current = true;
    lastAngleRef.current = wheelAngleAt(e.clientX, e.clientY);
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  }, [wheelAngleAt]);

  const onWheelMove = useCallback((e) => {
    if (!wheelDragRef.current) return;
    const angle = wheelAngleAt(e.clientX, e.clientY);
    const delta = angleDiff(angle, lastAngleRef.current);
    lastAngleRef.current = angle;

    wheelRotRef.current += delta;
    if (wheelGroupRef.current)
      wheelGroupRef.current.setAttribute('transform', `rotate(${wheelRotRef.current} 100 100)`);

    // Left-to-right (clockwise) → drive forward · Right-to-left (counter-clockwise) → revving
    const now = performance.now();
    if (Math.abs(delta) > 0.15 && now - lastSoundTsRef.current > 350) {
      lastSoundTsRef.current = now;
      if (delta > 0) playEngineSound(); else playRevSound();
    }

    frameAccumRef.current += delta;
    while (frameAccumRef.current >= WHEEL_DEG_PER_FRAME) {
      frameAccumRef.current -= WHEEL_DEG_PER_FRAME;
      frameIdxRef.current = (frameIdxRef.current + 1) % TOTAL;
      drawFrame(frameIdxRef.current);
    }
    while (frameAccumRef.current <= -WHEEL_DEG_PER_FRAME) {
      frameAccumRef.current += WHEEL_DEG_PER_FRAME;
      frameIdxRef.current = (frameIdxRef.current - 1 + TOTAL) % TOTAL;
      drawFrame(frameIdxRef.current);
    }
    e.preventDefault();
  }, [wheelAngleAt, drawFrame]);

  const onWheelUp = useCallback(() => { wheelDragRef.current = false; }, []);

  const pct       = Math.round((loaded / TOTAL) * 100);
  const isLoading = loaded < TOTAL;

  return (
    <div style={{ position:'fixed', inset:0, background:'#0B0F19',
      fontFamily:FONT, overflow:'hidden', userSelect:'none' }}>

      <style>{`
        @keyframes colSpin    { to { transform:rotate(360deg); } }
        @keyframes enginePulse {
          0%, 100% { box-shadow:0 0 0 0 rgba(0,201,167,0.55); }
          50%      { box-shadow:0 0 0 24px rgba(0,201,167,0); }
        }
        @keyframes flashFade  { from { opacity:0.55; } to { opacity:0; } }
        @keyframes rpmBar     {
          0%   { width:0%;  background:#00C9A7; }
          55%  { width:96%; background:#FF6B35; }
          80%  { width:58%; background:#FF6B35; }
          100% { width:68%; background:#FFB23F; }
        }
        @keyframes gearSpin   { to { transform:rotate(360deg); } }
        @keyframes textFade   {
          0%   { opacity:0; transform:translateY(6px); }
          15%  { opacity:1; transform:translateY(0); }
          85%  { opacity:1; }
          100% { opacity:0; }
        }
      `}</style>

      {/* ── Header — floating overlay (start / running phases only) ── */}
      {phase !== 'starting' && (
        <div style={{ display:'flex', alignItems:'center',
          padding:'max(12px, env(safe-area-inset-top)) 16px 0',
          position:'absolute', top:0, left:0, right:0, zIndex:10 }}>
          <button onClick={onBack}
            style={{ background:'rgba(255,255,255,0.08)', border:'1.5px solid rgba(255,255,255,0.18)',
              borderRadius:20, color:'#FFFFFF', fontSize:13, fontWeight:600, fontFamily:FONT,
              padding:'8px 16px', cursor:'pointer', backdropFilter:'blur(6px)' }}>
            ← Back
          </button>
          <div style={{ marginLeft:14, background:'rgba(255,255,255,0.08)', borderRadius:14,
            padding:'6px 12px', backdropFilter:'blur(6px)' }}>
            <div style={{ fontSize:15, fontWeight:700, color:'#FFFFFF', letterSpacing:'0.02em' }}>
              Sample 2 — Car
            </div>
          </div>
        </div>
      )}

      {/* ── Phase: Start Engine ── */}
      {phase === 'start' && (
        <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column',
          alignItems:'center', justifyContent:'center', gap:28 }}>
          <img src={`${FRAMES_PATH}/frame_0000.jpg`} alt=""
            style={{ position:'absolute', inset:0, width:'100%', height:'100%',
              objectFit:'cover', opacity:0.25, filter:'blur(2px)' }} />
          <div style={{ position:'relative', zIndex:1, display:'flex',
            flexDirection:'column', alignItems:'center', gap:22 }}>
            <div style={{ fontSize:14, fontWeight:600, color:'rgba(255,255,255,0.7)',
              letterSpacing:'0.08em', textTransform:'uppercase' }}>
              Tap to power up
            </div>
            <button onClick={handleStartEngine}
              style={{ width:140, height:140, borderRadius:'50%', border:'none',
                background:'linear-gradient(145deg,#00E0B8,#00997D)', color:'#06231D',
                fontSize:16, fontWeight:800, fontFamily:FONT, letterSpacing:'0.04em',
                cursor:'pointer', animation:'enginePulse 2s ease-in-out infinite',
                display:'flex', alignItems:'center', justifyContent:'center',
                flexDirection:'column', gap:6 }}>
              <span style={{ fontSize:34 }}>⏻</span>
              START<br/>ENGINE
            </button>
          </div>
        </div>
      )}

      {/* ── Phase: Starting (ignition animation) ── */}
      {phase === 'starting' && (
        <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column',
          alignItems:'center', justifyContent:'center', gap:22, zIndex:5 }}>
          <div style={{ position:'absolute', inset:0, background:'#FFFFFF',
            animation:'flashFade 0.35s ease-out forwards', pointerEvents:'none' }} />
          <div style={{ fontSize:46, animation:'gearSpin 0.9s linear infinite' }}>⚙️</div>
          <div style={{ fontSize:14, fontWeight:700, color:TEAL, letterSpacing:'0.08em',
            textTransform:'uppercase', animation:'textFade 1.9s ease-in-out forwards' }}>
            Starting Engine…
          </div>
          <div style={{ width:220, height:8, borderRadius:4,
            background:'rgba(255,255,255,0.08)', overflow:'hidden' }}>
            <div style={{ height:'100%', borderRadius:4,
              animation:'rpmBar 1.9s ease-out forwards' }} />
          </div>
        </div>
      )}

      {/* ── Phase: Running — full-screen canvas + steering wheel overlay ── */}
      {phase === 'running' && (
        <>
          <canvas
            ref={canvasRef}
            width={540} height={304}
            onPointerDown={onCanvasDown}
            onPointerMove={onCanvasMove}
            onPointerUp={onCanvasUp}
            onPointerCancel={onCanvasUp}
            style={{ position:'absolute', inset:0, width:'100%', height:'100%', display:'block',
              background:'#0B0F19', objectFit:'contain',
              touchAction:'none', cursor:'grab' }}
          />

          {!isLoading && (
            <div style={{ position:'absolute', left:0, right:0,
              bottom:'max(20px, env(safe-area-inset-bottom))',
              display:'flex', justifyContent:'center', zIndex:10 }}>
              <div
                ref={wheelWrapRef}
                onPointerDown={onWheelDown}
                onPointerMove={onWheelMove}
                onPointerUp={onWheelUp}
                onPointerCancel={onWheelUp}
                style={{ width:160, height:160, borderRadius:'50%',
                  opacity:0,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  touchAction:'none', cursor:'grab', pointerEvents:'auto' }}>
                <svg viewBox="0 0 200 200" width={150} height={150}>
                  <g ref={wheelGroupRef} style={{ transformOrigin:'100px 100px' }}>
                    <circle cx="100" cy="100" r="88" fill="none" stroke="#1A1A2E" strokeWidth="14" />
                    <circle cx="100" cy="100" r="88" fill="none" stroke={TEAL} strokeWidth="3" strokeDasharray="4 10" />
                    <rect x="92" y="40" width="16" height="60" rx="8" fill="#1A1A2E" />
                    <rect x="92" y="40" width="16" height="60" rx="8" fill="#1A1A2E" transform="rotate(120 100 100)" />
                    <rect x="92" y="40" width="16" height="60" rx="8" fill="#1A1A2E" transform="rotate(240 100 100)" />
                    <circle cx="100" cy="100" r="34" fill="#1A1A2E" />
                    <circle cx="100" cy="100" r="34" fill="none" stroke={TEAL} strokeWidth="2" />
                    <text x="100" y="108" textAnchor="middle" fontSize="22" fontWeight="800"
                      fill={TEAL} fontFamily={FONT}>M</text>
                  </g>
                </svg>
              </div>
            </div>
          )}

          {/* ── Loading overlay ── */}
          {isLoading && (
            <div style={{ position:'absolute', inset:0, background:'#0B0F19', zIndex:20,
              display:'flex', flexDirection:'column', alignItems:'center',
              justifyContent:'center', gap:18 }}>
              <img src="/logo1.png" alt="Memoera"
                style={{ width:58, height:58, objectFit:'contain',
                  animation:'colSpin 2s linear infinite' }} />
              <div style={{ fontSize:14, fontWeight:700, color:TEAL, fontFamily:FONT }}>
                Loading Frames…
              </div>
              <div style={{ width:200, height:4, borderRadius:2,
                background:'rgba(255,255,255,0.08)', overflow:'hidden' }}>
                <div style={{ height:'100%', borderRadius:2, background:TEAL,
                  width: pct + '%', transition:'width 0.25s ease' }} />
              </div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.38)', fontFamily:FONT }}>
                {pct}%
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
