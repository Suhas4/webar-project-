import { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '../config/api.js';

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const TEAL = "#00C9A7";
const GOLD = "#C9A84C";

const auth = () => ({ Authorization: 'Bearer ' + (localStorage.getItem('memoera_token') || '') });

// Common trades, so someone who doesn't know what to type has a way in.
const SUGGESTIONS = [
  'Jewellery', 'Carpenter', 'Restaurant', 'Furniture', 'Electronics',
  'Gym', 'Salon', 'Clothing', 'Bakery', 'Hardware',
];

// Finds registered businesses by trade, name, address or something they sell,
// and puts a call/WhatsApp button next to each — the point of the platform is
// connecting a buyer to a seller, so contact is one tap from the result.
export default function BusinessSearchScreen({ initialQuery = '', onBack }) {
  const [query, setQuery]       = useState(initialQuery);
  const [results, setResults]   = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [openId, setOpenId]     = useState(null);
  const [catalogs, setCatalogs] = useState({});   // sellerId -> items

  const search = useCallback(async (q) => {
    const term = (q ?? '').trim();
    if (term.length < 2) { setError('Type at least two characters'); return; }
    setLoading(true); setError(''); setOpenId(null);
    try {
      const r = await fetch(`${API_BASE}/api/business/search?q=${encodeURIComponent(term)}`, { headers: auth() });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error || 'Search failed.'); setResults([]); return; }
      setResults(d.businesses || []);
    } catch {
      setError('Could not reach Memoera. Check your connection.');
      setResults([]);
    } finally { setLoading(false); }
  }, []);

  // Run the term typed on Home straight away rather than making the user
  // re-enter it here.
  useEffect(() => { if (initialQuery.trim().length >= 2) search(initialQuery); }, [initialQuery, search]);

  const toggleCatalog = async (id) => {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    if (catalogs[id]) return;
    try {
      const r = await fetch(`${API_BASE}/api/business/catalog?id=${id}`, { headers: auth() });
      if (!r.ok) return;
      const d = await r.json();
      setCatalogs((c) => ({ ...c, [id]: d.items || [] }));
    } catch { /* the row just stays empty */ }
  };

  return (
    <div style={st.screen}>
      <div style={st.header}>
        <button onClick={onBack} style={st.back}>←</button>
        <div>
          <div style={st.title}>Find a business</div>
          <div style={st.sub}>Shops and services registered on Memoera</div>
        </div>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); search(query); }} style={st.searchRow}>
        <input value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Jewellery, carpenter, restaurant…"
          style={st.input} autoFocus={!initialQuery} />
        <button type="submit" style={st.go}>→</button>
      </form>

      <div style={st.body}>
        {results === null && !loading && (
          <>
            <div style={st.label}>Popular searches</div>
            <div style={st.chips}>
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => { setQuery(s); search(s); }} style={st.chip}>{s}</button>
              ))}
            </div>
          </>
        )}

        {loading && <div style={st.note}>Searching…</div>}
        {error && <div style={{ ...st.note, color: '#FF6B6B' }}>{error}</div>}

        {results && !loading && results.length === 0 && !error && (
          <div style={st.note}>
            No businesses found for “{query}”.<br />
            Try a broader word — “jewellery” rather than a shop name.
          </div>
        )}

        {results && results.length > 0 && (
          <>
            <div style={st.label}>{results.length} result{results.length === 1 ? '' : 's'}</div>
            {results.map((b) => {
              const wa = (b.phone || '').replace(/\D/g, '');
              const open = openId === b.id;
              const items = catalogs[b.id];
              return (
                <div key={b.id} style={st.card}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div style={st.avatar}>{(b.name || '?').trim().charAt(0).toUpperCase()}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={st.name}>{b.name}</div>
                      {b.category && <div style={st.category}>{b.category}</div>}
                      {b.address && <div style={st.meta}>📍 {b.address}</div>}
                      {b.hours && <div style={st.meta}>🕐 {b.hours}</div>}
                    </div>
                    {b.listings > 0 && (
                      <span style={st.badge}>{b.listings} item{b.listings === 1 ? '' : 's'}</span>
                    )}
                  </div>

                  <div style={st.actions}>
                    {b.phone && (
                      <a href={`tel:${b.phone}`} style={{ ...st.action, background: TEAL, color: '#04211d' }}>
                        📞 Call
                      </a>
                    )}
                    {wa && (
                      <a href={`https://wa.me/91${wa}`} target="_blank" rel="noopener noreferrer"
                        style={{ ...st.action, background: 'rgba(37,211,102,.16)', color: '#25D366',
                          border: '1px solid rgba(37,211,102,.5)' }}>
                        💬 WhatsApp
                      </a>
                    )}
                    {b.listings > 0 && (
                      <button onClick={() => toggleCatalog(b.id)}
                        style={{ ...st.action, background: 'transparent', color: GOLD,
                          border: `1px solid ${GOLD}66`, cursor: 'pointer' }}>
                        {open ? 'Hide catalogue' : 'Catalogue'}
                      </button>
                    )}
                  </div>

                  {b.phone && <div style={st.phone}>{b.phone}</div>}

                  {open && (
                    <div style={st.catalog}>
                      {!items && <div style={st.note}>Loading…</div>}
                      {items && items.length === 0 && <div style={st.note}>Nothing listed yet.</div>}
                      {items && items.map((it, i) => (
                        <div key={i} style={st.item}>
                          {it.imageUrl
                            ? <img src={it.imageUrl} alt="" loading="lazy" style={st.itemImg} />
                            : <div style={{ ...st.itemImg, display: 'flex', alignItems: 'center',
                                justifyContent: 'center', fontSize: 18 }}>📦</div>}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={st.itemName}>{it.label || 'Product'}</div>
                            {it.notes && <div style={st.itemNote}>{it.notes}</div>}
                            {it.moq && <div style={st.itemNote}>Min order: {it.moq}{it.unit ? ' ' + it.unit : ''}</div>}
                          </div>
                          {it.price && (
                            <div style={st.price}>₹{it.price}{it.unit ? <span style={st.unit}>/{it.unit}</span> : null}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            <div style={st.disclaimer}>
              Memoera doesn’t handle payment — we connect you with the seller directly.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const st = {
  screen: { position:'fixed', inset:0, background:'linear-gradient(170deg,#061A1F,#0A2229 55%,#061820)',
    display:'flex', flexDirection:'column', fontFamily:FONT, color:'#fff', overflow:'hidden' },
  header: { display:'flex', alignItems:'center', gap:12, padding:'48px 18px 12px', flexShrink:0 },
  back:   { background:'transparent', border:'1.5px solid rgba(255,255,255,.2)', borderRadius:'50%',
    width:34, height:34, color:'rgba(255,255,255,.75)', fontSize:16, cursor:'pointer', flexShrink:0 },
  title:  { fontSize:18, fontWeight:800, letterSpacing:'-.02em' },
  sub:    { fontSize:11.5, color:'rgba(255,255,255,.45)', marginTop:2 },

  searchRow: { display:'flex', gap:8, padding:'0 18px 12px', flexShrink:0 },
  input: { flex:1, minWidth:0, background:'rgba(255,255,255,.07)', border:'1px solid rgba(255,255,255,.15)',
    borderRadius:12, padding:'12px 14px', fontSize:14, color:'#fff', fontFamily:FONT, outline:'none' },
  go: { width:46, borderRadius:12, border:'none', background:`linear-gradient(135deg,${TEAL},#00E5CC)`,
    color:'#04211d', fontSize:18, fontWeight:800, cursor:'pointer', flexShrink:0 },

  body: { flex:1, overflowY:'auto', padding:'0 18px 40px' },
  label: { fontSize:11, fontWeight:700, letterSpacing:'.09em', textTransform:'uppercase',
    color:'rgba(255,255,255,.42)', margin:'12px 0 8px' },
  chips: { display:'flex', flexWrap:'wrap', gap:8 },
  chip: { background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.14)', borderRadius:20,
    color:'rgba(255,255,255,.8)', fontSize:12.5, fontWeight:600, fontFamily:FONT,
    padding:'8px 15px', cursor:'pointer' },
  note: { color:'rgba(255,255,255,.5)', fontSize:13, textAlign:'center', padding:'26px 10px', lineHeight:1.7 },

  card: { background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.1)',
    borderRadius:16, padding:14, marginBottom:12 },
  avatar: { width:44, height:44, borderRadius:13, flexShrink:0, display:'flex', alignItems:'center',
    justifyContent:'center', fontSize:19, fontWeight:800, color:'#04211d',
    background:`linear-gradient(135deg,${TEAL},#00E5CC)` },
  name: { fontSize:15, fontWeight:800, letterSpacing:'-.01em' },
  category: { fontSize:11.5, color:TEAL, fontWeight:700, marginTop:2 },
  meta: { fontSize:11.5, color:'rgba(255,255,255,.55)', marginTop:4, lineHeight:1.45 },
  badge: { fontSize:10.5, fontWeight:800, color:GOLD, background:'rgba(201,168,76,.14)',
    border:`1px solid ${GOLD}55`, borderRadius:20, padding:'4px 9px', flexShrink:0, whiteSpace:'nowrap' },

  actions: { display:'flex', gap:8, marginTop:12, flexWrap:'wrap' },
  action: { flex:'1 1 auto', minWidth:96, textAlign:'center', borderRadius:10, border:'none',
    padding:'10px 12px', fontSize:12.5, fontWeight:800, fontFamily:FONT, textDecoration:'none' },
  phone: { fontFamily:'ui-monospace, monospace', fontSize:12, color:'rgba(255,255,255,.5)',
    marginTop:8, textAlign:'center' },

  catalog: { marginTop:12, borderTop:'1px solid rgba(255,255,255,.1)', paddingTop:12 },
  item: { display:'flex', gap:10, alignItems:'center', padding:'8px 0',
    borderBottom:'1px solid rgba(255,255,255,.06)' },
  itemImg: { width:46, height:46, borderRadius:10, objectFit:'cover', flexShrink:0,
    background:'rgba(255,255,255,.07)' },
  itemName: { fontSize:13, fontWeight:700 },
  itemNote: { fontSize:11, color:'rgba(255,255,255,.45)', marginTop:2 },
  price: { fontSize:14, fontWeight:800, color:TEAL, flexShrink:0 },
  unit: { fontSize:10, color:'rgba(255,255,255,.4)', fontWeight:600 },

  disclaimer: { fontSize:11, color:GOLD, textAlign:'center', background:'rgba(201,168,76,.08)',
    border:`1px solid ${GOLD}44`, borderRadius:12, padding:'10px 14px', marginTop:6 },
};
