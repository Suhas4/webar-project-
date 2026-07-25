import { useState, useEffect, useRef, useCallback } from 'react';

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const TEAL = "#00C9A7";

export default function AnimationArOverlay({ title, frames, onClose }) {
  const [frameIdx, setFrameIdx]   = useState(0);
  const [playing,  setPlaying]    = useState(false);
  const [fps,      setFps]        = useState(8);
  const intervalRef  = useRef(null);
  const dragRef      = useRef({ active: false, startX: 0, startIdx: 0 });
  const total = frames.length;

  // Auto-play
  useEffect(() => {
    if (!playing) { clearInterval(intervalRef.current); return; }
    intervalRef.current = setInterval(() => {
      setFrameIdx((i) => (i + 1) % total);
    }, Math.round(1000 / fps));
    return () => clearInterval(intervalRef.current);
  }, [playing, fps, total]);

  // Touch / pointer drag to scrub frames
  const onPointerDown = useCallback((e) => {
    dragRef.current = { active: true, startX: e.clientX ?? e.touches?.[0]?.clientX ?? 0, startIdx: frameIdx };
    setPlaying(false);
  }, [frameIdx]);

  const onPointerMove = useCallback((e) => {
    if (!dragRef.current.active) return;
    const x = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const delta = x - dragRef.current.startX;
    const perPx = total / (window.innerWidth * 0.8);
    const offset = Math.round(delta * perPx);
    const idx = ((dragRef.current.startIdx - offset) % total + total) % total;
    setFrameIdx(idx);
  }, [total]);

  const onPointerUp = useCallback(() => {
    dragRef.current.active = false;
  }, []);

  return (
    <div
      style={{ position:'fixed', inset:0, zIndex:9999, background:'#000',
        display:'flex', flexDirection:'column', userSelect:'none', touchAction:'none' }}
      onMouseDown={onPointerDown}
      onMouseMove={onPointerMove}
      onMouseUp={onPointerUp}
      onTouchStart={onPointerDown}
      onTouchMove={onPointerMove}
      onTouchEnd={onPointerUp}
    >
      {/* Frame */}
      <img
        src={frames[frameIdx]}
        alt={`Frame ${frameIdx + 1}`}
        draggable={false}
        style={{ position:'absolute', inset:0, width:'100%', height:'100%',
          objectFit:'contain', display:'block', pointerEvents:'none' }}
      />

      {/* Top bar */}
      <div style={{ position:'absolute', top:0, left:0, right:0, padding:'48px 16px 16px',
        background:'linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, transparent 100%)',
        display:'flex', alignItems:'center', gap:12, pointerEvents:'none' }}>
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          style={{ background:'rgba(0,0,0,0.55)', border:'1px solid rgba(0,201,167,0.5)',
            borderRadius:22, color:TEAL, fontSize:13, fontWeight:700, fontFamily:FONT,
            padding:'8px 16px', cursor:'pointer', backdropFilter:'blur(6px)',
            pointerEvents:'all' }}>
          ← Scan Again
        </button>
        {title && (
          <div style={{ flex:1, fontSize:14, fontWeight:700, color:'#fff',
            fontFamily:FONT, textShadow:'0 1px 4px rgba(0,0,0,0.8)',
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {title}
          </div>
        )}
        {/* Frame counter */}
        <div style={{ background:'rgba(0,0,0,0.55)', border:'1px solid rgba(255,255,255,0.2)',
          borderRadius:20, padding:'4px 10px', fontSize:11, color:'rgba(255,255,255,0.8)',
          fontFamily:FONT, fontWeight:600, backdropFilter:'blur(4px)', pointerEvents:'none' }}>
          {frameIdx + 1} / {total}
        </div>
      </div>

      {/* Bottom controls */}
      <div style={{ position:'absolute', bottom:0, left:0, right:0,
        padding:'16px 20px 40px',
        background:'linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%)',
        pointerEvents:'none' }}>

        {/* Drag hint */}
        <div style={{ textAlign:'center', fontSize:11, color:'rgba(255,255,255,0.5)',
          fontFamily:FONT, marginBottom:14, letterSpacing:'0.05em' }}>
          ← Drag to scrub frames →
        </div>

        {/* Play/pause + speed */}
        <div style={{ display:'flex', alignItems:'center', gap:12, justifyContent:'center',
          pointerEvents:'all' }}>
          <button
            onClick={(e) => { e.stopPropagation(); setPlaying((p) => !p); }}
            style={{ background:`rgba(0,201,167,0.18)`, border:`1px solid ${TEAL}88`,
              borderRadius:50, color:TEAL, fontSize:13, fontWeight:700,
              fontFamily:FONT, padding:'8px 20px', cursor:'pointer' }}>
            {playing ? '⏸ Pause' : '▶ Play'}
          </button>

          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:11, color:'rgba(255,255,255,0.55)', fontFamily:FONT }}>Speed</span>
            <input
              type="range" min={1} max={24} step={1} value={fps}
              onChange={(e) => { e.stopPropagation(); setFps(Number(e.target.value)); }}
              onClick={(e) => e.stopPropagation()}
              style={{ width:80, accentColor:TEAL, cursor:'pointer' }}
            />
            <span style={{ fontSize:11, color:TEAL, fontFamily:FONT, fontWeight:700,
              minWidth:32 }}>{fps}fps</span>
          </div>
        </div>
      </div>
    </div>
  );
}
