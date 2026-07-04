import { useState, useEffect } from 'react';

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const TEAL = "#00C9A7";

function decodeArToken(token) {
  try { return JSON.parse(atob(token)); }
  catch { return null; }
}

export default function PublicArView({ token }) {
  const [data, setData]   = useState(null);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const d = decodeArToken(token);
    if (!d || (!d.v && !d.u)) { setError(true); return; }
    setData(d);
    // Update page meta for Google/Lens indexing
    document.title = d.l ? `${d.l} — Memoera AR` : 'Memoera AR Experience';
    const setMeta = (prop, val) => {
      let el = document.querySelector(`meta[property="${prop}"]`) || document.querySelector(`meta[name="${prop}"]`);
      if (!el) { el = document.createElement('meta'); el.setAttribute(prop.startsWith('og:') ? 'property' : 'name', prop); document.head.appendChild(el); }
      el.setAttribute('content', val);
    };
    if (d.i) {
      setMeta('og:image', d.i);
      setMeta('twitter:image', d.i);
    }
    setMeta('og:title',       d.l ? `${d.l} — Memoera AR` : 'Memoera AR Experience');
    setMeta('og:description', 'Scan this image with any camera to launch an Augmented Reality experience powered by Memoera.');
    setMeta('og:url',         window.location.href);
    setMeta('og:type',        'website');
  }, [token]);

  const shareUrl = window.location.href;

  function handleCopyLink() {
    navigator.clipboard?.writeText(shareUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  if (error) {
    return (
      <div style={s.screen}>
        <div style={s.center}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔗</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', fontFamily: FONT, marginBottom: 8 }}>Invalid AR Link</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', fontFamily: FONT }}>This link may be expired or broken.</div>
          <a href="/" style={s.openBtn}>Open Memoera</a>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div style={s.screen}>
      <style>{`
        @keyframes pv-glow { 0%,100%{box-shadow:0 0 0 0 rgba(0,201,167,0.4)} 50%{box-shadow:0 0 0 18px rgba(0,201,167,0)} }
        @keyframes pv-fade { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pv-ring { 0%{transform:scale(0.9);opacity:0.6} 100%{transform:scale(1.8);opacity:0} }
      `}</style>

      {/* Background image blur */}
      {data.i && (
        <img src={data.i} alt="" style={s.bgBlur} />
      )}
      <div style={s.bgOverlay} />

      {/* Header */}
      <div style={s.header}>
        <img src="/logo1.png" alt="Memoera" style={s.logo} />
        <span style={s.brand}>Memoera</span>
        <a href="/" style={s.headerLink}>Open App</a>
      </div>

      {/* Card */}
      <div style={s.card}>

        {/* Target image or icon */}
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          {data.i ? (
            <>
              <div style={s.ring} />
              <div style={{ ...s.ring, animationDelay: '0.8s' }} />
              <img src={data.i} alt={data.l || 'AR Target'}
                style={s.targetImg} />
            </>
          ) : (
            <div style={s.iconBox}>
              <span style={{ fontSize: 44 }}>🎯</span>
            </div>
          )}
        </div>

        {/* Label */}
        <h1 style={s.title}>{data.l || 'AR Experience'}</h1>
        <p style={s.sub}>
          {data.t === 'url'
            ? 'Scan the target image with Memoera to open the linked content.'
            : data.t === 'glb'
            ? 'Scan the target image with Memoera to view the 3D model in AR.'
            : 'Point your Memoera camera at the target image above to launch the AR video.'}
        </p>

        {/* Primary action */}
        {data.t === 'video' && data.v && (
          <div style={{ marginBottom: 16 }}>
            <p style={s.previewLabel}>Preview</p>
            <video src={data.v} controls autoPlay playsInline muted
              style={s.video} />
          </div>
        )}

        {data.t === 'url' && data.u && (
          <a href={data.u} target="_blank" rel="noreferrer" style={s.actionBtn}>
            🔗 Open Link
          </a>
        )}

        {/* How to use */}
        <div style={s.howBox}>
          <div style={s.howTitle}>How to trigger AR</div>
          {[
            { n: '1', text: 'Download Memoera — free on Android' },
            { n: '2', text: 'Tap Scan, point at the target image above' },
            { n: '3', text: 'Watch the AR content appear live on screen' },
          ].map(({ n, text }) => (
            <div key={n} style={s.howRow}>
              <div style={s.howNum}>{n}</div>
              <span style={s.howText}>{text}</span>
            </div>
          ))}
        </div>

        {/* Google Lens tip */}
        <div style={s.lensTip}>
          <span style={{ fontSize: 18 }}>🔍</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: TEAL, fontFamily: FONT }}>Google Lens tip</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', fontFamily: FONT, marginTop: 2, lineHeight: 1.5 }}>
              Long-press the target image on any webpage → "Search with Google Lens" → tap this result to open the AR view instantly.
            </div>
          </div>
        </div>

        {/* Share */}
        <button onClick={handleCopyLink} style={s.copyBtn}>
          {copied ? '✓ Link copied!' : '📎 Copy AR Link'}
        </button>

        {/* Open app */}
        <a href="/" style={s.openBtn}>
          Open Memoera App
        </a>
      </div>

      {/* Footer */}
      <div style={s.footer}>
        Powered by <strong style={{ color: TEAL }}>Memoera</strong> · Augmented Reality Platform
      </div>
    </div>
  );
}

const s = {
  screen:     { position:'fixed', inset:0, background:'#060F14', display:'flex',
                flexDirection:'column', alignItems:'center', overflowY:'auto',
                fontFamily:FONT, WebkitFontSmoothing:'antialiased' },
  bgBlur:     { position:'fixed', inset:0, width:'100%', height:'100%', objectFit:'cover',
                filter:'blur(24px) brightness(0.18)', pointerEvents:'none', zIndex:0 },
  bgOverlay:  { position:'fixed', inset:0, background:'linear-gradient(180deg,rgba(6,15,20,0.7) 0%,rgba(6,15,20,0.95) 60%)',
                zIndex:1, pointerEvents:'none' },
  header:     { position:'relative', zIndex:2, display:'flex', alignItems:'center', gap:10,
                padding:'16px 20px', width:'100%', maxWidth:480,
                borderBottom:'1px solid rgba(255,255,255,0.07)' },
  logo:       { width:32, height:32, objectFit:'contain', borderRadius:'50%' },
  brand:      { fontSize:16, fontWeight:700, color:'#fff', flex:1 },
  headerLink: { fontSize:12, fontWeight:700, color:TEAL, textDecoration:'none',
                padding:'6px 14px', border:`1.5px solid ${TEAL}55`, borderRadius:20 },
  card:       { position:'relative', zIndex:2, width:'100%', maxWidth:420,
                padding:'24px 20px 32px', display:'flex', flexDirection:'column',
                alignItems:'center', gap:12, animation:'pv-fade 0.5s ease both' },
  ring:       { position:'absolute', width:160, height:160, borderRadius:16,
                border:`1.5px solid ${TEAL}55`,
                animation:'pv-ring 2.4s ease-out infinite' },
  targetImg:  { width:160, height:160, objectFit:'cover', borderRadius:16,
                border:`2px solid ${TEAL}66`, position:'relative',
                animation:'pv-glow 3s ease-in-out infinite',
                boxShadow:`0 8px 32px rgba(0,201,167,0.25)` },
  iconBox:    { width:100, height:100, borderRadius:'50%',
                background:'rgba(0,201,167,0.12)', display:'flex',
                alignItems:'center', justifyContent:'center',
                border:`2px solid ${TEAL}44` },
  title:      { fontSize:22, fontWeight:800, color:'#fff', margin:0,
                textAlign:'center', letterSpacing:'-0.3px' },
  sub:        { fontSize:13, color:'rgba(255,255,255,0.55)', textAlign:'center',
                lineHeight:1.6, margin:0, maxWidth:340 },
  previewLabel:{ fontSize:10, fontWeight:700, color:'rgba(255,255,255,0.35)',
                 letterSpacing:'0.1em', textTransform:'uppercase', alignSelf:'flex-start' },
  video:      { width:'100%', maxWidth:380, borderRadius:12,
                background:'#000', display:'block' },
  actionBtn:  { display:'inline-flex', alignItems:'center', justifyContent:'center',
                background:`linear-gradient(135deg,${TEAL},#00E5CC)`,
                border:'none', borderRadius:50, color:'#040D0B',
                fontSize:15, fontWeight:700, fontFamily:FONT,
                padding:'14px 28px', cursor:'pointer', textDecoration:'none',
                width:'100%', maxWidth:340, textAlign:'center' },
  howBox:     { width:'100%', maxWidth:340, background:'rgba(255,255,255,0.04)',
                border:'1px solid rgba(255,255,255,0.08)', borderRadius:14,
                padding:'14px 16px' },
  howTitle:   { fontSize:12, fontWeight:700, color:'rgba(255,255,255,0.55)',
                letterSpacing:'0.08em', textTransform:'uppercase',
                marginBottom:12, fontFamily:FONT },
  howRow:     { display:'flex', alignItems:'flex-start', gap:10, marginBottom:8 },
  howNum:     { width:22, height:22, borderRadius:'50%', background:TEAL,
                color:'#040D0B', fontSize:11, fontWeight:700,
                display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 },
  howText:    { fontSize:12, color:'rgba(255,255,255,0.65)', lineHeight:1.5, paddingTop:2 },
  lensTip:    { width:'100%', maxWidth:340, background:'rgba(0,201,167,0.07)',
                border:`1px solid ${TEAL}33`, borderRadius:14,
                padding:'12px 14px', display:'flex', gap:12, alignItems:'flex-start' },
  copyBtn:    { width:'100%', maxWidth:340, background:'rgba(255,255,255,0.06)',
                border:'1.5px solid rgba(255,255,255,0.15)', borderRadius:50,
                color:'#fff', fontSize:14, fontWeight:600, fontFamily:FONT,
                padding:'12px 20px', cursor:'pointer' },
  openBtn:    { display:'flex', alignItems:'center', justifyContent:'center',
                width:'100%', maxWidth:340, background:`linear-gradient(135deg,${TEAL},#00E5CC)`,
                border:'none', borderRadius:50, color:'#040D0B',
                fontSize:15, fontWeight:700, fontFamily:FONT,
                padding:'14px 28px', cursor:'pointer', textDecoration:'none',
                textAlign:'center' },
  footer:     { position:'relative', zIndex:2, fontSize:11,
                color:'rgba(255,255,255,0.3)', padding:'20px',
                textAlign:'center', fontFamily:FONT },
  center:     { display:'flex', flexDirection:'column', alignItems:'center',
                justifyContent:'center', flex:1, padding:24, textAlign:'center' },
};
