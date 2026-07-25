import { useEffect, useState } from 'react';

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const TAGLINE = "Bring Memories to Life";

export default function SplashScreen({ onDone }) {
  const [exiting, setExiting] = useState(false);
  const [charIdx, setCharIdx] = useState(0);

  useEffect(() => {
    const exitT = setTimeout(() => setExiting(true), 3800);
    const doneT = setTimeout(onDone, 4400);
    return () => { clearTimeout(exitT); clearTimeout(doneT); };
  }, [onDone]);

  // Typewriter effect for tagline — starts after 1.1s
  useEffect(() => {
    if (charIdx >= TAGLINE.length) return;
    const t = setTimeout(() => setCharIdx(i => i + 1), charIdx === 0 ? 1100 : 55);
    return () => clearTimeout(t);
  }, [charIdx]);

  return (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse at 50% 40%, #071C22 0%, #040D0B 65%)',
      overflow: 'hidden',
      opacity:   exiting ? 0 : 1,
      transform: exiting ? 'scale(1.06)' : 'scale(1)',
      transition: 'opacity 0.7s ease, transform 0.7s ease',
    }}>
      <style>{`
        @keyframes sp-enter {
          from { opacity: 0; transform: scale(0.7); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes sp-breathe {
          0%, 100% { transform: scale(1); }
          50%       { transform: scale(1.05); }
        }
        @keyframes sp-ring {
          0%   { transform: scale(0.55); opacity: 0.7; }
          100% { transform: scale(2.2);  opacity: 0; }
        }
        @keyframes sp-ring2 {
          0%   { transform: scale(0.55); opacity: 0.45; }
          100% { transform: scale(2.2);  opacity: 0; }
        }
        @keyframes sp-ring3 {
          0%   { transform: scale(0.55); opacity: 0.25; }
          100% { transform: scale(2.2);  opacity: 0; }
        }
        @keyframes sp-welcome {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes sp-cursor {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0; }
        }
        @keyframes sp-particle {
          0%   { transform: translateY(0)   scale(1);   opacity: 0.8; }
          100% { transform: translateY(-80px) scale(0); opacity: 0; }
        }
      `}</style>

      {/* Floating ambient particles */}
      {[
        { left:'18%', top:'25%', delay:'0s',    size:4, color:'#00C9A7' },
        { left:'75%', top:'20%', delay:'0.6s',  size:3, color:'#C9A84C' },
        { left:'60%', top:'70%', delay:'1.1s',  size:4, color:'#00C9A7' },
        { left:'30%', top:'65%', delay:'0.3s',  size:3, color:'#00C9A7' },
        { left:'85%', top:'50%', delay:'0.9s',  size:2, color:'#C9A84C' },
        { left:'12%', top:'55%', delay:'1.5s',  size:3, color:'#00C9A7' },
      ].map((p, i) => (
        <div key={i} style={{
          position:'absolute', left:p.left, top:p.top,
          width:p.size, height:p.size, borderRadius:'50%', background:p.color,
          boxShadow:`0 0 6px ${p.color}`,
          animation:`sp-particle 3.5s ease-out ${p.delay} infinite`,
          pointerEvents:'none',
        }} />
      ))}

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, position:'relative' }}>

        {/* Pulsing rings behind logo */}
        <div style={{ position:'relative', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ position:'absolute', width:180, height:180, borderRadius:'50%',
            border:'2px solid #00C9A7',
            animation:'sp-ring 2.8s ease-out 0.9s infinite' }} />
          <div style={{ position:'absolute', width:180, height:180, borderRadius:'50%',
            border:'1.5px solid #C9A84C',
            animation:'sp-ring2 2.8s ease-out 1.5s infinite' }} />
          <div style={{ position:'absolute', width:180, height:180, borderRadius:'50%',
            border:'1px solid #00C9A7',
            animation:'sp-ring3 2.8s ease-out 2.1s infinite' }} />

          <img
            src="/logo1.png"
            alt="Memoera"
            style={{
              width: 160, maxWidth: '50vw', height: 'auto',
              display: 'block', objectFit: 'contain', position:'relative', zIndex:1,
              animation: 'sp-enter 0.8s cubic-bezier(0.22,1,0.36,1) forwards, sp-breathe 3s ease-in-out 1s infinite',
            }}
          />
        </div>

        {/* Welcome */}
        <div style={{ textAlign:'center', animation:'sp-welcome 0.7s ease 0.5s both' }}>
          <p style={{ margin:0, fontSize:24, fontWeight:700, letterSpacing:'0.06em',
            color:'#ffffff', fontFamily:FONT }}>
            Welcome
          </p>
        </div>

        {/* Typewriter tagline */}
        <div style={{ minHeight:22, textAlign:'center' }}>
          <span style={{ fontSize:13, fontWeight:500, letterSpacing:'0.12em', color:'#00C9A7',
            fontFamily:FONT, textTransform:'uppercase' }}>
            {TAGLINE.slice(0, charIdx)}
          </span>
          {charIdx < TAGLINE.length && (
            <span style={{ fontSize:13, color:'#00C9A7', fontFamily:FONT,
              animation:'sp-cursor 0.7s step-end infinite' }}>|</span>
          )}
        </div>
      </div>
    </div>
  );
}
