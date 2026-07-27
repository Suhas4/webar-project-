const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const TEAL = "#00C9A7";

// Shown over the AR camera when "Buy Now"/"Shop Now" is tapped on a scanned
// video — the uploading business's contact card, with a direct Call button
// so the viewer can start a conversation about it right away.
export default function BusinessDetailsOverlay({ status, details, onClose }) {
  return (
    <div style={{ position:'fixed', inset:0, zIndex:9100, background:'rgba(0,0,0,0.72)',
      display:'flex', alignItems:'flex-end', justifyContent:'center', fontFamily:FONT }}
      onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width:'100%', maxWidth:420, background:'linear-gradient(180deg,#0d2530 0%,#081c26 100%)',
          borderRadius:'24px 24px 0 0', padding:'22px 22px 32px', boxShadow:'0 -8px 40px rgba(0,0,0,0.6)' }}>
        <div style={{ width:44, height:5, borderRadius:3, background:'rgba(255,255,255,0.18)', margin:'0 auto 18px' }} />

        {status === 'loading' && (
          <div style={{ textAlign:'center', padding:'20px 0', color:'rgba(255,255,255,0.6)', fontSize:14 }}>
            Loading details…
          </div>
        )}

        {status === 'unavailable' && (
          <div style={{ textAlign:'center', padding:'12px 0 4px' }}>
            <div style={{ fontSize:32, marginBottom:8 }}>🏬</div>
            <div style={{ color:'#fff', fontSize:15, fontWeight:700, marginBottom:6 }}>No business details available</div>
            <div style={{ color:'rgba(255,255,255,0.5)', fontSize:12.5 }}>This content isn't linked to a business account yet.</div>
            <button onClick={onClose} style={{ marginTop:18, background:'transparent', border:'1.5px solid rgba(255,255,255,0.25)',
              borderRadius:50, color:'rgba(255,255,255,0.75)', fontSize:13, fontFamily:FONT, padding:'10px 28px', cursor:'pointer' }}>
              Close
            </button>
          </div>
        )}

        {status === 'ready' && details && (
          <>
            <div style={{ fontSize:11, fontWeight:700, color:TEAL, letterSpacing:'0.1em', marginBottom:6 }}>BUSINESS DETAILS</div>
            <div style={{ fontSize:20, fontWeight:800, color:'#fff', marginBottom:14 }}>{details.businessName}</div>

            {details.businessAddress && (
              <Row icon="📍" text={details.businessAddress} />
            )}
            {details.phone && <Row icon="📞" text={details.phone} />}
            {details.email && <Row icon="✉️" text={details.email} />}
            {details.website && <Row icon="🌐" text={details.website} />}
            {details.instagram && <Row icon="📷" text={details.instagram} />}

            <div style={{ display:'flex', gap:10, marginTop:20 }}>
              <button onClick={onClose} style={{ flex:1, background:'transparent', border:'1.5px solid rgba(255,255,255,0.25)',
                borderRadius:50, color:'rgba(255,255,255,0.75)', fontSize:14, fontWeight:700, fontFamily:FONT, padding:'13px 0', cursor:'pointer' }}>
                Close
              </button>
              {details.phone && (
                <a href={`tel:${details.phone}`} style={{ flex:1.4, textAlign:'center', textDecoration:'none',
                  background:`linear-gradient(135deg, ${TEAL}, #00E5CC)`, borderRadius:50, color:'#04211d',
                  fontSize:14, fontWeight:700, fontFamily:FONT, padding:'13px 0', cursor:'pointer' }}>
                  📞 Call Now
                </a>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ icon, text }) {
  return (
    <div style={{ display:'flex', alignItems:'flex-start', gap:10, marginBottom:10 }}>
      <span style={{ fontSize:15, flexShrink:0 }}>{icon}</span>
      <span style={{ fontSize:13.5, color:'rgba(255,255,255,0.85)', lineHeight:1.4, wordBreak:'break-word' }}>{text}</span>
    </div>
  );
}
