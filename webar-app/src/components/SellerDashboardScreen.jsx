import { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '../config/api.js';

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const TEAL = "#00C9A7";
const GOLD = "#C9A84C";

function getToken() { return localStorage.getItem('memoera_token') || ''; }

const inputStyle = { width:'100%', background:'rgba(255,255,255,0.07)', border:'1.5px solid rgba(255,255,255,0.15)',
  borderRadius:10, padding:'11px 13px', fontSize:13.5, color:'#fff', fontFamily:FONT, outline:'none', boxSizing:'border-box' };
const labelStyle = { fontSize:11.5, fontWeight:700, color:'rgba(255,255,255,0.55)', letterSpacing:'0.06em', marginBottom:6, display:'block' };

export default function SellerDashboardScreen({ onBack }) {
  const [tab, setTab] = useState('listings'); // 'listings' | 'add'
  const [business, setBusiness] = useState(null); // { businessName, phone } | null while loading
  const [setupName, setSetupName] = useState('');
  const [setupPhone, setSetupPhone] = useState('');
  const [savingSetup, setSavingSetup] = useState(false);

  const [listings, setListings] = useState(null); // null = loading
  const [markers, setMarkers] = useState(null);
  const [selectedTargetId, setSelectedTargetId] = useState(null);
  const [price, setPrice] = useState('');
  const [moq, setMoq] = useState('');
  const [unit, setUnit] = useState('piece');
  const [notes, setNotes] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [toast, setToast] = useState('');

  const flashToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const loadBusiness = useCallback(() => {
    fetch(`${API_BASE}/api/business/details`, { headers: { Authorization: 'Bearer ' + getToken() } })
      .then((r) => r.json())
      .then((d) => { setBusiness(d); setSetupName(d.businessName || ''); setSetupPhone(d.phone || ''); })
      .catch(() => setBusiness({ businessName: '', phone: '' }));
  }, []);

  const loadListings = useCallback(() => {
    fetch(`${API_BASE}/api/listings`, { headers: { Authorization: 'Bearer ' + getToken() } })
      .then((r) => r.json())
      .then((d) => setListings(d.listings || []))
      .catch(() => setListings([]));
  }, []);

  const loadMarkers = useCallback(() => {
    fetch(`${API_BASE}/api/targets/public`)
      .then((r) => r.json())
      .then((d) => setMarkers(d.targets || []))
      .catch(() => setMarkers([]));
  }, []);

  useEffect(() => { loadBusiness(); loadListings(); loadMarkers(); }, [loadBusiness, loadListings, loadMarkers]);

  const hasBusinessSetup = business && business.businessName && business.phone;

  const saveSetup = async () => {
    if (!setupName.trim() || !/^\d{10}$/.test(setupPhone.replace(/\D/g, ''))) {
      flashToast('Enter a business name and a valid 10-digit phone number.');
      return;
    }
    setSavingSetup(true);
    try {
      const res = await fetch(`${API_BASE}/api/business/details`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getToken() },
        body: JSON.stringify({ businessName: setupName.trim(), phone: setupPhone.replace(/\D/g, '') }),
      });
      if (!res.ok) throw new Error();
      setBusiness({ businessName: setupName.trim(), phone: setupPhone.replace(/\D/g, '') });
      flashToast('Saved! You can publish listings now.');
    } catch { flashToast("Couldn't save — please try again."); }
    setSavingSetup(false);
  };

  const publish = async () => {
    if (!selectedTargetId) { flashToast('Pick a product/marker first.'); return; }
    if (!price.trim()) { flashToast('Enter a price.'); return; }
    setPublishing(true);
    try {
      const res = await fetch(`${API_BASE}/api/listings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getToken() },
        body: JSON.stringify({ targetId: selectedTargetId, price: price.trim(), moq: moq.trim(), unit: unit.trim(), notes: notes.trim() }),
      });
      if (!res.ok) throw new Error();
      flashToast('Listing published! Buyers scanning this product will see you.');
      setSelectedTargetId(null); setPrice(''); setMoq(''); setNotes('');
      loadListings();
      setTab('listings');
    } catch { flashToast("Couldn't publish — please try again."); }
    setPublishing(false);
  };

  const deleteListing = async (id) => {
    if (!window.confirm('Remove this listing?')) return;
    try {
      await fetch(`${API_BASE}/api/listings?id=${id}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + getToken() } });
      loadListings();
    } catch {}
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'linear-gradient(160deg,#061A1F 0%,#0A2229 50%,#061820 100%)',
      display:'flex', flexDirection:'column', fontFamily:FONT, overflow:'hidden' }}>

      <button onClick={onBack} style={{ position:'fixed', top:48, left:16, zIndex:2,
        background:'transparent', border:'1.5px solid rgba(255,255,255,0.2)', borderRadius:20,
        color:'rgba(255,255,255,0.7)', fontSize:13, fontWeight:600, fontFamily:FONT, padding:'7px 16px', cursor:'pointer' }}>
        ← Back
      </button>

      <div style={{ padding:'96px 20px 8px' }}>
        <div style={{ fontSize:20, fontWeight:800, color:'#fff' }}>Seller Dashboard</div>
        <div style={{ fontSize:11.5, color:'rgba(255,255,255,0.45)', marginTop:4 }}>
          List your price on any scanned product — buyers see everyone who carries it
        </div>
      </div>

      {business === null ? (
        <div style={{ textAlign:'center', marginTop:60, color:'rgba(255,255,255,0.4)', fontSize:13 }}>Loading…</div>
      ) : !hasBusinessSetup ? (
        <div style={{ padding:'12px 20px 40px', display:'flex', flexDirection:'column', gap:12 }}>
          <div style={{ background:'rgba(0,201,167,0.08)', border:`1px solid ${TEAL}44`, borderRadius:16, padding:'16px 18px' }}>
            <div style={{ fontSize:14, fontWeight:700, color:'#fff', marginBottom:4 }}>One quick step first</div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.55)', marginBottom:14 }}>
              Buyers need a business name and phone number to reach you — add them once, they're reused for every listing.
            </div>
            <label style={labelStyle}>Business Name</label>
            <input style={{ ...inputStyle, marginBottom:10 }} value={setupName} onChange={(e) => setSetupName(e.target.value)} placeholder="e.g. Sharma Steel Industries" />
            <label style={labelStyle}>Phone Number</label>
            <input style={{ ...inputStyle, marginBottom:14 }} value={setupPhone} inputMode="numeric" maxLength={10}
              onChange={(e) => setSetupPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="10-digit mobile number" />
            <button onClick={saveSetup} disabled={savingSetup} style={{ width:'100%', background:`linear-gradient(135deg, ${TEAL}, #00E5CC)`,
              border:'none', borderRadius:50, color:'#04211d', fontSize:14, fontWeight:700, fontFamily:FONT, padding:'13px', cursor:'pointer', opacity: savingSetup ? 0.6 : 1 }}>
              {savingSetup ? 'Saving…' : 'Save & Continue'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div style={{ display:'flex', gap:8, padding:'0 20px 12px' }}>
            {[{ key:'listings', label:'My Listings' }, { key:'add', label:'+ Add Listing' }].map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)}
                style={{ flex:1, background: tab === t.key ? `linear-gradient(135deg, ${TEAL}, #00E5CC)` : 'rgba(255,255,255,0.06)',
                  border:'none', borderRadius:12, color: tab === t.key ? '#04211d' : 'rgba(255,255,255,0.7)',
                  fontSize:13, fontWeight:700, fontFamily:FONT, padding:'11px 0', cursor:'pointer' }}>
                {t.label}
              </button>
            ))}
          </div>

          <div style={{ flex:1, overflowY:'auto', padding:'0 20px 40px' }}>
            {tab === 'listings' && (
              listings === null ? (
                <div style={{ textAlign:'center', marginTop:40, color:'rgba(255,255,255,0.4)', fontSize:13 }}>Loading…</div>
              ) : listings.length === 0 ? (
                <div style={{ textAlign:'center', marginTop:60 }}>
                  <div style={{ fontSize:32, marginBottom:10 }}>🛍️</div>
                  <div style={{ fontSize:13, color:'rgba(255,255,255,0.45)' }}>No listings yet — tap "+ Add Listing" to publish your first price.</div>
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  {listings.map((l) => (
                    <div key={l.id} style={{ display:'flex', gap:12, background:'rgba(255,255,255,0.05)',
                      border:'1px solid rgba(255,255,255,0.1)', borderRadius:14, padding:12, alignItems:'center' }}>
                      <div style={{ width:52, height:52, borderRadius:10, overflow:'hidden', background:'#000', flexShrink:0 }}>
                        {l.imageUrl && <img src={l.imageUrl} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13.5, fontWeight:700, color:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{l.label}</div>
                        <div style={{ fontSize:12.5, fontWeight:700, color:TEAL, marginTop:2 }}>
                          ₹{l.price}{l.unit ? ` / ${l.unit}` : ''}{l.moq ? ` · MOQ ${l.moq}` : ''}
                        </div>
                      </div>
                      <button onClick={() => deleteListing(l.id)} style={{ background:'transparent', border:'none', color:'rgba(255,120,120,0.85)', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )
            )}

            {tab === 'add' && (
              <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                <div>
                  <label style={labelStyle}>Pick a product / marker</label>
                  {markers === null ? (
                    <div style={{ fontSize:12, color:'rgba(255,255,255,0.4)' }}>Loading…</div>
                  ) : markers.length === 0 ? (
                    <div style={{ fontSize:12, color:'rgba(255,255,255,0.4)' }}>No public products to list against yet.</div>
                  ) : (
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
                      {markers.map((m) => (
                        <div key={m.id} onClick={() => setSelectedTargetId(m.id)}
                          style={{ cursor:'pointer', borderRadius:12, overflow:'hidden', border: selectedTargetId === m.id ? `2px solid ${TEAL}` : '1px solid rgba(255,255,255,0.12)' }}>
                          <div style={{ width:'100%', aspectRatio:'1', background:'#000' }}>
                            {m.imageUrl && <img src={m.imageUrl} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />}
                          </div>
                          <div style={{ fontSize:10.5, color:'#fff', padding:'5px 6px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.label}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label style={labelStyle}>Price (₹)</label>
                  <input style={inputStyle} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 450" inputMode="numeric" />
                </div>
                <div style={{ display:'flex', gap:12 }}>
                  <div style={{ flex:1 }}>
                    <label style={labelStyle}>MOQ (optional)</label>
                    <input style={inputStyle} value={moq} onChange={(e) => setMoq(e.target.value)} placeholder="e.g. 50" />
                  </div>
                  <div style={{ flex:1 }}>
                    <label style={labelStyle}>Unit</label>
                    <input style={inputStyle} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. piece, kg, box" />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Notes (optional)</label>
                  <textarea style={{ ...inputStyle, resize:'none' }} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any details buyers should know" />
                </div>

                <div style={{ background:'rgba(201,168,76,0.08)', border:`1px solid ${GOLD}44`, borderRadius:12, padding:'10px 14px', fontSize:11.5, color:GOLD }}>
                  Memoera doesn't handle payment — this just publishes your contact so buyers can call or WhatsApp you directly.
                </div>

                <button onClick={publish} disabled={publishing} style={{ width:'100%', background:`linear-gradient(135deg, ${TEAL}, #00E5CC)`,
                  border:'none', borderRadius:50, color:'#04211d', fontSize:15, fontWeight:700, fontFamily:FONT, padding:'15px', cursor:'pointer', opacity: publishing ? 0.6 : 1 }}>
                  {publishing ? 'Publishing…' : 'Publish Listing'}
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {toast && (
        <div style={{ position:'fixed', left:'50%', bottom:30, transform:'translateX(-50%)', zIndex:100,
          background:'rgba(0,0,0,0.85)', color:'#fff', fontSize:13, padding:'10px 18px', borderRadius:20,
          border:`1px solid ${TEAL}55`, whiteSpace:'nowrap', maxWidth:'85vw', overflow:'hidden', textOverflow:'ellipsis' }}>
          {toast}
        </div>
      )}
    </div>
  );
}
