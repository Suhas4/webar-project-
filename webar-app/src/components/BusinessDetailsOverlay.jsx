const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const TEAL = "#00C9A7";

// Shown over the AR camera when "Buy Now" is tapped on a scanned video —
// the uploader's business name/address/contact info, with a Call button
// (tel: link) so a viewer can reach them directly.
export default function BusinessDetailsOverlay({ status, details, onClose }) {
  return (
    <div style={{ position:'fixed', inset:0, zIndex:9500, background:'rgba(0,0,0,0.75)',
      display:'flex', alignItems:'flex-end', fontFamily:FONT }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width:'100%', maxHeight:'70vh', overflowY:'auto',
        background:'linear-gradient(180deg,#0d2530 0%,#081c26 100%)', borderRadius:'24px 24px 0 0',
        padding:'20px 24px 32px', boxShadow:'0 -8px 40px rgba(0,0,0,0.6)' }}>

        <div style={{ width:44, height:5, borderRadius:3, background:'rgba(255,255,255,0.18)', margin:'0 auto 18px' }} />

        {status === 'loading' && (
          <div style={{ textAlign:'center', padding:'20px 0', color:'rgba(255,255,255,0.6)', fontSize:14 }}>
            Loading business details…
          </div>
        )}

        {status === 'unavailable' && (
          <div style={{ textAlign:'center', padding:'12px 0 24px' }}>
            <div style={{ fontSize:32, marginBottom:10 }}>🏬</div>
            <div style={{ fontSize:15, fontWeight:700, color:'#fff', marginBottom:6 }}>No business details available</div>
            <div style={{ fontSize:13, color:'rgba(255,255,255,0.5)' }}>This content's uploader hasn't set up a business profile.</div>
            <button onClick={onClose} style={{ marginTop:20, background:'transparent', border:'1.5px solid rgba(255,255,255,0.25)',
              borderRadius:50, color:'rgba(255,255,255,0.7)', fontSize:13, fontFamily:FONT, padding:'10px 24px', cursor:'pointer' }}>
              Close
            </button>
          </div>
        )}

        {status === 'ready' && details && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:TEAL, letterSpacing:'0.08em', marginBottom:4 }}>BUSINESS</div>
              <div style={{ fontSize:19, fontWeight:800, color:'#fff' }}>{details.businessName}</div>
            </div>

            {details.businessAddress && (
              <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
                <span style={{ fontSize:16 }}>📍</span>
                <div style={{ fontSize:13.5, color:'rgba(255,255,255,0.8)', lineHeight:1.4 }}>{details.businessAddress}</div>
              </div>
            )}
            {details.email && (
              <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                <span style={{ fontSize:16 }}>✉️</span>
                <div style={{ fontSize:13.5, color:'rgba(255,255,255,0.8)' }}>{details.email}</div>
              </div>
            )}
            {details.website && (
              <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                <span style={{ fontSize:16 }}>🌐</span>
                <a href={details.website.startsWith('http') ? details.website : `https://${details.website}`}
                  target="_blank" rel="noopener noreferrer" style={{ fontSize:13.5, color:TEAL, textDecoration:'none' }}>
                  {details.website}
                </a>
              </div>
            )}
            {details.instagram && (
              <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                <span style={{ fontSize:16 }}>📷</span>
                <div style={{ fontSize:13.5, color:'rgba(255,255,255,0.8)' }}>{details.instagram}</div>
              </div>
            )}

            <div style={{ display:'flex', gap:10, marginTop:8 }}>
              <button onClick={onClose} style={{ flex:1, background:'transparent', border:'1.5px solid rgba(255,255,255,0.25)',
                borderRadius:50, color:'rgba(255,255,255,0.7)', fontSize:14, fontWeight:600, fontFamily:FONT, padding:'13px 0', cursor:'pointer' }}>
                Close
              </button>
              {details.phone && (
                <a href={`tel:${details.phone}`} style={{ flex:2, background:`linear-gradient(135deg, ${TEAL}, #00E5CC)`,
                  border:'none', borderRadius:50, color:'#04211d', fontSize:14, fontWeight:700, fontFamily:FONT,
                  padding:'13px 0', textAlign:'center', textDecoration:'none' }}>
                  📞 Call {details.phone}
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
