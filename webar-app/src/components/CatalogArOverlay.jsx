import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const TEAL = "#00C9A7";

function openLink(url) {
  if (Capacitor.isNativePlatform()) {
    Browser.open({ url }).catch(() => { window.open(url, '_blank', 'noopener'); });
  } else {
    window.open(url, '_blank', 'noopener');
  }
}

// Shown over the AR camera when a 'catalog' target is scanned — a browsable
// list of items (photo, name, price, description), each tappable to open its
// video or link. Mirrors AnimationArOverlay's full-screen-over-camera layout.
export default function CatalogArOverlay({ title, items, onClose }) {
  return (
    <div style={{ position:'fixed', inset:0, zIndex:9000, background:'linear-gradient(180deg,#061A1F 0%,#0A2229 100%)',
      display:'flex', flexDirection:'column', fontFamily:FONT }}>

      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'48px 20px 14px', flexShrink:0 }}>
        <button onClick={onClose} style={{ background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.18)',
          borderRadius:20, color:'rgba(255,255,255,0.8)', fontSize:13, fontWeight:600, fontFamily:FONT, padding:'7px 16px', cursor:'pointer' }}>
          ✕ Close
        </button>
        <div style={{ fontSize:17, fontWeight:800, color:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {title || 'Catalog'}
        </div>
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:'8px 16px 40px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
        {(!items || items.length === 0) && (
          <div style={{ gridColumn:'1 / -1', textAlign:'center', marginTop:40, color:'rgba(255,255,255,0.4)', fontSize:13 }}>
            This catalog has no items yet.
          </div>
        )}
        {items && items.map((it, i) => {
          const openable = it.videoUrl || it.urlLink;
          return (
            <div key={i} onClick={() => openable && openLink(it.videoUrl || it.urlLink)}
              style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)',
                borderRadius:16, overflow:'hidden', cursor: openable ? 'pointer' : 'default' }}>
              <div style={{ width:'100%', aspectRatio:'1', background:'#000' }}>
                {it.imageUrl && <img src={it.imageUrl} alt={it.title} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />}
              </div>
              <div style={{ padding:'10px 12px' }}>
                <div style={{ fontSize:13.5, fontWeight:700, color:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {it.title || 'Untitled'}
                </div>
                {it.price && <div style={{ fontSize:12.5, fontWeight:700, color:TEAL, marginTop:2 }}>{it.price}</div>}
                {it.description && (
                  <div style={{ fontSize:11.5, color:'rgba(255,255,255,0.5)', marginTop:4, display:'-webkit-box',
                    WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>
                    {it.description}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
