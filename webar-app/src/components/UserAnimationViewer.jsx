import { useState, useEffect, useRef } from 'react';

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const TEAL = "#00C9A7";

export default function UserAnimationViewer({ title, frames, onBack, onDelete }) {
  const [idx,     setIdx]     = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed,   setSpeed]   = useState(8);
  const timerRef  = useRef(null);
  const dragRef   = useRef({ active: false, startX: 0, startIdx: 0 });

  useEffect(() => {
    clearInterval(timerRef.current);
    if (!playing || frames.length < 2) return;
    timerRef.current = setInterval(() => {
      setIdx((i) => (i + 1) % frames.length);
    }, 1000 / speed);
    return () => clearInterval(timerRef.current);
  }, [playing, speed, frames.length]);

  const onTouchStart = (e) => {
    dragRef.current = { active: true, startX: e.touches[0].clientX, startIdx: idx };
    setPlaying(false);
  };
  const onTouchMove = (e) => {
    if (!dragRef.current.active) return;
    const dx    = e.touches[0].clientX - dragRef.current.startX;
    const delta = Math.floor(dx / 8);
    const n     = frames.length;
    setIdx(((dragRef.current.startIdx + delta) % n + n) % n);
  };
  const onTouchEnd = () => { dragRef.current.active = false; };

  const onMouseDown = (e) => {
    dragRef.current = { active: true, startX: e.clientX, startIdx: idx };
    setPlaying(false);
  };
  const onMouseMove = (e) => {
    if (!dragRef.current.active) return;
    const dx    = e.clientX - dragRef.current.startX;
    const delta = Math.floor(dx / 8);
    const n     = frames.length;
    setIdx(((dragRef.current.startIdx + delta) % n + n) % n);
  };
  const onMouseUp   = () => { dragRef.current.active = false; };
  const onMouseLeave = () => { dragRef.current.active = false; };

  const handleDelete = () => {
    if (window.confirm('Delete this animation? This cannot be undone.')) onDelete();
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'#000', display:'flex',
      flexDirection:'column', fontFamily:FONT, userSelect:'none' }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', padding:'48px 16px 12px',
        background:'rgba(0,0,0,0.85)', flexShrink:0 }}>
        <button onClick={onBack} style={{ background:'rgba(255,255,255,0.10)',
          border:'1px solid rgba(255,255,255,0.2)', borderRadius:20, color:'#fff',
          fontSize:13, fontWeight:600, fontFamily:FONT, padding:'8px 16px', cursor:'pointer' }}>
          Back
        </button>
        <div style={{ marginLeft:14, flex:1, minWidth:0 }}>
          <div style={{ fontSize:14, fontWeight:700, color:'#fff',
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{title}</div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.45)', fontFamily:FONT }}>
            {idx + 1} / {frames.length} frames
          </div>
        </div>
        <button onClick={handleDelete} style={{ background:'rgba(220,50,50,0.18)',
          border:'1px solid rgba(220,50,50,0.4)', borderRadius:20, color:'#FF7070',
          fontSize:12, fontWeight:600, fontFamily:FONT, padding:'7px 14px', cursor:'pointer' }}>
          Delete
        </button>
      </div>

      {/* Frame canvas */}
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center',
        overflow:'hidden', position:'relative', background:'#050505',
        touchAction:'none', cursor:'grab', userSelect:'none' }}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseLeave}>
        {frames[idx] && (
          <img src={frames[idx]} alt=""
            style={{ maxWidth:'100%', maxHeight:'100%', objectFit:'contain', display:'block' }} />
        )}
        <div style={{ position:'absolute', bottom:14, left:0, right:0,
          textAlign:'center', fontSize:10, color:'rgba(255,255,255,0.28)', fontFamily:FONT,
          pointerEvents:'none' }}>
          Drag left/right to scrub • Press ▶ to auto-play
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height:2, background:'rgba(255,255,255,0.1)', flexShrink:0 }}>
        <div style={{ height:'100%', background:TEAL,
          width:`${((idx + 1) / frames.length) * 100}%`,
          transition:'width 0.05s linear' }} />
      </div>

      {/* Controls */}
      <div style={{ background:'rgba(10,10,10,0.95)', padding:'14px 20px 40px',
        display:'flex', alignItems:'center', gap:16, flexShrink:0 }}>
        <button onClick={() => setPlaying((p) => !p)}
          style={{ width:52, height:52, borderRadius:'50%', border:`1.5px solid ${TEAL}88`,
            background: playing ? `rgba(0,201,167,0.18)` : `rgba(0,201,167,0.08)`,
            color:TEAL, fontSize:22, cursor:'pointer', display:'flex',
            alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          {playing ? '⏸' : '▶'}
        </button>
        <div style={{ flex:1, display:'flex', flexDirection:'column', gap:6 }}>
          <div style={{ display:'flex', justifyContent:'space-between' }}>
            <span style={{ fontSize:11, color:'rgba(255,255,255,0.5)', fontFamily:FONT }}>Speed</span>
            <span style={{ fontSize:11, color:TEAL, fontFamily:FONT, fontWeight:700 }}>{speed} fps</span>
          </div>
          <input type="range" min={1} max={24} step={1} value={speed}
            onChange={(e) => setSpeed(+e.target.value)}
            style={{ width:'100%', accentColor:TEAL, cursor:'pointer' }} />
        </div>
      </div>
    </div>
  );
}
