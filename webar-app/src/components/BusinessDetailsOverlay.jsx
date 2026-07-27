const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const TEAL = "#00C9A7";
const GOLD = "#C9A84C";

// Shown over the AR camera when "Buy Now" is tapped on a scanned video —
// every seller who's listed a price against this product (cheapest first),
// each with a direct Call/WhatsApp button. Memoera never handles payment or
// cash — this is purely a directory connecting buyer to seller.
export default function BusinessDetailsOverlay({ status, sellers, onClose }) {
  return (
    <div style={{ position:'fixed', inset:0, zIndex:9500, background:'rgba(0,0,0,0.75)',
      display:'flex', alignItems:'flex-end', fontFamily:FONT }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width:'100%', maxHeight:'78vh', overflowY:'auto',
        background:'linear-gradient(180deg,#0d2530 0%,#081c26 100%)', borderRadius:'24px 24px 0 0',
        padding:'20px 20px 28px', boxShadow:'0 -8px 40px rgba(0,0,0,0.6)' }}>

        <div style={{ width:44, height:5, borderRadius:3, background:'rgba(255,255,255,0.18)', margin:'0 auto 16px' }} />

        {status === 'loading' && (
          <div style={{ textAlign:'center', padding:'20px 0', color:'rgba(255,255,255,0.6)', fontSize:14 }}>
            Finding sellers…
          </div>
        )}

        {status === 'unavailable' && (
          <div style={{ textAlign:'center', padding:'12px 0 24px' }}>
            <div style={{ fontSize:32, marginBottom:10 }}>🛍️</div>
            <div style={{ fontSize:15, fontWeight:700, color:'#fff', marginBottom:6 }}>No sellers listed yet</div>
            <div style={{ fontSize:13, color:'rgba(255,255,255,0.5)' }}>Nobody has published a price for this product yet.</div>
            <button onClick={onClose} style={{ marginTop:20, background:'transparent', border:'1.5px solid rgba(255,255,255,0.25)',
              borderRadius:50, color:'rgba(255,255,255,0.7)', fontSize:13, fontFamily:FONT, padding:'10px 24px', cursor:'pointer' }}>
              Close
            </button>
          </div>
        )}

        {status === 'ready' && sellers && sellers.length > 0 && (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div style={{ fontSize:11, fontWeight:700, color:TEAL, letterSpacing:'0.08em' }}>
              {sellers.length} SELLER{sellers.length !== 1 ? 'S' : ''} FOR THIS PRODUCT
            </div>

            {sellers.map((s, i) => {
              const waMsg = encodeURIComponent(`Hi, I'm interested in this product listed on Memoera at ₹${s.price}${s.unit ? '/' + s.unit : ''}.`);
              const waPhone = (s.phone || '').replace(/\D/g, '');
              return (
                <div key={i} style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:16, padding:'14px 16px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                    <div style={{ minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <span style={{ fontSize:14.5, fontWeight:800, color:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.businessName}</span>
                        {s.verified && (
                          <span style={{ fontSize:9, fontWeight:800, color:GOLD, background:'rgba(201,168,76,0.15)', border:`1px solid ${GOLD}55`, borderRadius:10, padding:'2px 6px', flexShrink:0 }}>✓ VERIFIED</span>
                        )}
                      </div>
                      {s.notes && <div style={{ fontSize:11.5, color:'rgba(255,255,255,0.5)', marginTop:3 }}>{s.notes}</div>}
                    </div>
                    <div style={{ textAlign:'right', flexShrink:0 }}>
                      <div style={{ fontSize:16, fontWeight:800, color:TEAL }}>₹{s.price}</div>
                      {s.unit && <div style={{ fontSize:10.5, color:'rgba(255,255,255,0.4)' }}>/ {s.unit}</div>}
                    </div>
                  </div>
                  {s.moq && <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', marginTop:6 }}>MOQ: {s.moq}{s.unit ? ' ' + s.unit : ''}</div>}
                  <div style={{ display:'flex', gap:8, marginTop:10 }}>
                    <a href={`tel:${s.phone}`} style={{ flex:1, background:`linear-gradient(135deg, ${TEAL}, #00E5CC)`,
                      border:'none', borderRadius:50, color:'#04211d', fontSize:12.5, fontWeight:700, fontFamily:FONT,
                      padding:'10px 0', textAlign:'center', textDecoration:'none' }}>
                      📞 Call
                    </a>
                    <a href={`https://wa.me/91${waPhone}?text=${waMsg}`} target="_blank" rel="noopener noreferrer"
                      style={{ flex:1, background:'rgba(37,211,102,0.15)', border:'1px solid rgba(37,211,102,0.5)',
                      borderRadius:50, color:'#25D366', fontSize:12.5, fontWeight:700, fontFamily:FONT,
                      padding:'10px 0', textAlign:'center', textDecoration:'none' }}>
                      💬 WhatsApp
                    </a>
                  </div>
                </div>
              );
            })}

            <div style={{ background:'rgba(201,168,76,0.08)', border:`1px solid ${GOLD}44`, borderRadius:12, padding:'10px 14px', fontSize:11, color:GOLD, textAlign:'center' }}>
              Memoera doesn't handle payment — we just connect you with the seller.
            </div>

            <button onClick={onClose} style={{ background:'transparent', border:'1.5px solid rgba(255,255,255,0.25)',
              borderRadius:50, color:'rgba(255,255,255,0.7)', fontSize:13, fontWeight:600, fontFamily:FONT, padding:'11px 0', cursor:'pointer' }}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
