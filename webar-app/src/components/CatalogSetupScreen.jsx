import { useState, useCallback, useRef } from 'react';
import { jsPDF } from 'jspdf';
import { COMPILER_URL } from '../hooks/loadMindARCompiler.js';
import { saveTargets } from '../hooks/useArStorage.js';
import { rebuildPublicMindInBackground } from '../utils/rebuildPublicMind.js';
import { assessMarkerQuality } from '../utils/assessMarkerQuality.js';
import UploadProgressOverlay from './UploadProgressOverlay.jsx';
import UploadDropZone from './UploadDropZone.jsx';

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const TEAL = "#00C9A7";
const GOLD = "#C9A84C";

// The theme colour is picked as CSS hex but jsPDF wants 0-255 channels, so it
// has to be split apart for the PDF side. Falls back to the app's teal rather
// than throwing on a malformed value.
function hexToRgb(hex) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || '');
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 201, 167];
}

function emptyItem() {
  return { id: Date.now() + Math.random().toString(36).slice(2), title: '', price: '', description: '', urlLink: '', imageFile: null, imagePreview: null };
}

// Resize + re-encode to a JPEG data URL so large phone photos don't bloat the
// generated PDF — mirrors the same approach used for Photo Animation frames.
async function imageFileToDataURL(file, maxW = 900) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxW / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve({ dataUrl: canvas.toDataURL('image/jpeg', 0.82), w, h });
    };
    img.src = url;
  });
}

// Builds a simple catalog PDF — one item per section, photo + name + price +
// description — so scanning the cover photo can just open a document instead
// of needing its own AR overlay/viewer.
async function generateCatalogPdf(name, items, themeColor) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  const [ar, ag, ab] = hexToRgb(themeColor);
  let y = margin;

  doc.setFontSize(22);
  doc.setFont(undefined, 'bold');
  doc.text(name || 'Catalog', margin, y);
  y += 34;
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(120);
  doc.text(`${items.length} item${items.length !== 1 ? 's' : ''}`, margin, y);
  doc.setTextColor(20);
  y += 12;

  // Accent rule under the header — the one place the theme colour reads as
  // deliberate branding rather than just a tinted price.
  doc.setDrawColor(ar, ag, ab);
  doc.setLineWidth(2.5);
  doc.line(margin, y, margin + 64, y);
  doc.setLineWidth(1);
  y += 22;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const imgMaxW = pageW - margin * 2;
    const imgMaxH = 240;
    let imgH = 0;

    if (item.imageFile) {
      const { dataUrl, w, h } = await imageFileToDataURL(item.imageFile);
      const scale = Math.min(imgMaxW / w, imgMaxH / h, 1);
      const drawW = w * scale;
      const drawH = h * scale;
      if (y + drawH + 90 > pageH - margin) { doc.addPage(); y = margin; }
      doc.addImage(dataUrl, 'JPEG', margin, y, drawW, drawH);
      imgH = drawH;
    } else if (y + 90 > pageH - margin) {
      doc.addPage(); y = margin;
    }

    y += imgH + 16;
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text(item.title || `Item ${i + 1}`, margin, y);
    if (item.price) {
      doc.setTextColor(ar, ag, ab);
      doc.text(item.price, pageW - margin, y, { align: 'right' });
      doc.setTextColor(20);
    }
    y += 18;
    if (item.description) {
      doc.setFontSize(11);
      doc.setFont(undefined, 'normal');
      const lines = doc.splitTextToSize(item.description, pageW - margin * 2);
      doc.text(lines, margin, y);
      y += lines.length * 14;
    }
    if (item.urlLink) {
      doc.setFontSize(10);
      doc.setTextColor(0, 120, 220);
      doc.textWithLink(item.urlLink, margin, y + 4, { url: item.urlLink });
      doc.setTextColor(20);
      y += 18;
    }
    y += 24;
    if (i < items.length - 1) {
      doc.setDrawColor(225);
      doc.line(margin, y - 12, pageW - margin, y - 12);
    }
  }

  const blob = doc.output('blob');
  blob.name = `${(name || 'catalog').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`;
  return blob;
}

function ItemCard({ item, index, onChange, onRemove, onPickImage, canRemove }) {
  return (
    <div style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:16, padding:14, display:'flex', flexDirection:'column', gap:10 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ fontSize:12, fontWeight:700, color:GOLD, letterSpacing:'0.06em' }}>ITEM {index + 1}</span>
        {canRemove && (
          <button onClick={onRemove} style={{ background:'transparent', border:'none', color:'rgba(255,255,255,0.4)', fontSize:12, cursor:'pointer' }}>Remove</button>
        )}
      </div>

      <div onClick={onPickImage} style={{ cursor:'pointer', borderRadius:12, overflow:'hidden', height:110,
        background: item.imagePreview ? '#000' : 'rgba(255,255,255,0.06)', border:'1px dashed rgba(255,255,255,0.2)',
        display:'flex', alignItems:'center', justifyContent:'center' }}>
        {item.imagePreview
          ? <img src={item.imagePreview} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
          : <span style={{ fontSize:12, color:'rgba(255,255,255,0.45)' }}>Tap to add photo</span>}
      </div>

      <input value={item.title} onChange={(e) => onChange({ title: e.target.value })} placeholder="Item name"
        style={inputStyle} />
      <input value={item.price} onChange={(e) => onChange({ price: e.target.value })} placeholder="Price (optional)"
        style={inputStyle} />
      <textarea value={item.description} onChange={(e) => onChange({ description: e.target.value })} placeholder="Description (optional)"
        rows={2} style={{ ...inputStyle, resize:'none', fontFamily:FONT }} />
      <input value={item.urlLink} onChange={(e) => onChange({ urlLink: e.target.value })} placeholder="Link (optional — product page, video, etc.)"
        style={inputStyle} />
    </div>
  );
}

const inputStyle = { width:'100%', background:'rgba(255,255,255,0.07)', border:'1.5px solid rgba(255,255,255,0.15)',
  borderRadius:10, padding:'10px 12px', fontSize:13, color:'#fff', fontFamily:FONT, outline:'none', boxSizing:'border-box' };

// Live preview of the PDF that Create will actually produce.
//
// Deliberately mirrors generateCatalogPdf's layout rather than being a prettier
// marketing card: header, item count, accent rule, then photo / title + price /
// description / link per item, divided by a hairline. A preview that looked
// nicer than the artifact would just be a lie told at edit time — the whole
// point is seeing the document before paying for a compile and upload.
function CatalogPreview({ name, themeColor, items, markerPreview, activeId }) {
  // Must match generateCatalogPdf's input exactly — handleCreate passes it
  // `filledItems`, which is items carrying a photo. Previewing anything looser
  // (say, anything with a title typed into it) would show rows that silently
  // never make it into the document, and disagree with the "Items (n)" count
  // in the editor beside it.
  const shown = items.filter((it) => it.imageFile);
  // Half-finished rows still deserve an answer to "where did my typing go?".
  const pending = items.filter((it) => !it.imageFile &&
    (it.title.trim() || it.description.trim() || it.price.trim()));

  return (
    <div style={{ background:'#fff', borderRadius:12, boxShadow:'0 18px 50px -12px rgba(0,0,0,.6)',
      padding:'26px 24px 30px', color:'#141414', minHeight:260 }}>

      <div style={{ fontSize:21, fontWeight:800, lineHeight:1.15, wordBreak:'break-word' }}>
        {name.trim() || 'Catalog'}
      </div>
      <div style={{ fontSize:11, color:'#787878', marginTop:6 }}>
        {shown.length} item{shown.length !== 1 ? 's' : ''}
      </div>
      <div style={{ width:64, height:2.5, background:themeColor, borderRadius:2, margin:'12px 0 18px' }} />

      {shown.length === 0 && pending.length === 0 && (
        <div style={{ fontSize:12.5, color:'#9a9a9a', lineHeight:1.6, padding:'14px 0 6px' }}>
          Add a photo and a name for your first item — it appears here exactly as it
          will be laid out in the PDF.
        </div>
      )}

      {shown.map((item, i) => {
        const isActive = item.id === activeId;
        return (
          <div key={item.id} style={{
            paddingTop: i === 0 ? 0 : 16, marginTop: i === 0 ? 0 : 16,
            borderTop: i === 0 ? 'none' : '1px solid #e1e1e1',
          }}>
            <div style={{
              borderRadius:8, padding: isActive ? 8 : 0, margin: isActive ? -8 : 0,
              background: isActive ? `${themeColor}14` : 'transparent',
              outline: isActive ? `1.5px solid ${themeColor}66` : 'none',
              transition:'background .18s ease',
            }}>
              {item.imagePreview && (
                <img src={item.imagePreview} alt="" style={{ width:'100%', maxHeight:190, objectFit:'cover',
                  display:'block', borderRadius:4, marginBottom:12 }} />
              )}
              <div style={{ display:'flex', alignItems:'baseline', gap:12 }}>
                <div style={{ flex:1, fontSize:14.5, fontWeight:700, wordBreak:'break-word' }}>
                  {item.title.trim() || `Item ${i + 1}`}
                </div>
                {item.price.trim() && (
                  <div style={{ fontSize:14.5, fontWeight:700, color:themeColor, whiteSpace:'nowrap' }}>
                    {item.price}
                  </div>
                )}
              </div>
              {item.description.trim() && (
                <div style={{ fontSize:11.5, lineHeight:1.55, marginTop:7, color:'#333', whiteSpace:'pre-wrap',
                  wordBreak:'break-word' }}>
                  {item.description}
                </div>
              )}
              {item.urlLink.trim() && (
                <div style={{ fontSize:10.5, color:'#0078DC', marginTop:8, wordBreak:'break-all' }}>
                  {item.urlLink}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {pending.length > 0 && (
        <div style={{ marginTop: shown.length ? 18 : 0, background:'#FFF6E0', border:'1px solid #F0DCA8',
          borderRadius:8, padding:'10px 12px', fontSize:11, color:'#6B5415', lineHeight:1.5 }}>
          {pending.length} item{pending.length !== 1 ? 's have' : ' has'} text but no photo yet — add
          {pending.length !== 1 ? ' photos' : ' a photo'} to include {pending.length !== 1 ? 'them' : 'it'} in the catalog.
        </div>
      )}

      {markerPreview && (
        <div style={{ marginTop:22, paddingTop:16, borderTop:'1px dashed #d8d8d8', display:'flex', gap:11, alignItems:'center' }}>
          <img src={markerPreview} alt="" style={{ width:46, height:46, objectFit:'cover', borderRadius:6, flexShrink:0 }} />
          <div style={{ fontSize:10.5, color:'#8a8a8a', lineHeight:1.45 }}>
            Scanning this cover photo opens the catalog above.
          </div>
        </div>
      )}
    </div>
  );
}

export default function CatalogSetupScreen({ onStart, onBack, isPublic = false }) {
  const [catalogName, setCatalogName] = useState('My Catalog');
  const [markerFile,    setMarkerFile]    = useState(null);
  const [markerPreview, setMarkerPreview] = useState(null);
  const [items,   setItems]   = useState([emptyItem()]);
  const [themeColor, setThemeColor] = useState(TEAL);
  const [activeId,   setActiveId]   = useState(null);
  const [state,   setState]   = useState('idle');
  const [progress,setProgress]= useState(0);
  const [error,   setError]   = useState('');
  const markerInputRef = useRef(null);
  const itemImageRefs   = useRef({});

  const applyMarker = useCallback(async (file) => {
    if (!file) return;
    const quality = await assessMarkerQuality(file);
    if (quality?.isLowDetail && !window.confirm(
      'This photo looks fairly plain or low-contrast — flat logos and plain-color images give the scanner fewer distinctive details to lock onto, and may scan unreliably. Continue with this photo anyway?'
    )) return;
    setMarkerFile(file);
    setMarkerPreview(URL.createObjectURL(file));
  }, []);

  const pickMarkerFromInput = useCallback((e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) applyMarker(file);
  }, [applyMarker]);

  // Editing a row is what marks it active, not focusing it: typing is the
  // signal worth following in the preview, and it survives the re-render that
  // adding a photo triggers (which a focus-only handler does not).
  const updateItem = (id, patch) => {
    setActiveId(id);
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };
  const removeItem = (id) => setItems((prev) => (prev.length > 1 ? prev.filter((it) => it.id !== id) : prev));
  const addItem    = () => setItems((prev) => [...prev, emptyItem()]);

  const pickItemImage = (id) => {
    const input = itemImageRefs.current[id];
    input?.click();
  };
  // Uploading a photo for the last item in the list immediately opens up the
  // next item's card — a guided one-at-a-time flow instead of requiring a
  // separate "+ Add Item" tap after every photo.
  const onItemImageChosen = (id, e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setActiveId(id);
    setItems((prev) => {
      const next = prev.map((it) => (it.id === id ? { ...it, imageFile: file, imagePreview: URL.createObjectURL(file) } : it));
      const isLast = prev[prev.length - 1]?.id === id;
      return isLast ? [...next, emptyItem()] : next;
    });
  };

  const filledItems = items.filter((it) => it.imageFile);
  const canCreate = catalogName.trim() && markerFile && filledItems.length > 0 && filledItems.every((it) => it.title.trim());

  const handleCreate = useCallback(async () => {
    if (!canCreate) return;
    setState('compiling'); setProgress(0); setError('');
    try {
      const name = catalogName.trim();
      const pdfBlob = await generateCatalogPdf(name, filledItems, themeColor);
      setProgress(10);

      const markerBuf  = await markerFile.arrayBuffer();
      const markerBlob = new Blob([markerBuf], { type: markerFile.type || 'image/jpeg' });
      const markerObjUrl = URL.createObjectURL(markerBlob);
      const markerImg = await new Promise((res, rej) => {
        const img = new Image();
        img.onload  = () => res(img);
        img.onerror = () => rej(new Error('Failed to load marker image'));
        img.src = markerObjUrl;
      });

      if (!window.MINDAR?.IMAGE?.Compiler) {
        await import(/* @vite-ignore */ COMPILER_URL);
      }
      if (!window.MINDAR?.IMAGE?.Compiler) throw new Error('MindAR compiler not available. Check internet connection.');

      const compiler = new window.MINDAR.IMAGE.Compiler();
      let lastPct = -1;
      await compiler.compileImageTargets([markerImg], (prog) => {
        const pct = Math.min(100, Math.round(prog * 100));
        if (pct !== lastPct) { lastPct = pct; setProgress(10 + Math.round(pct * 0.4)); return new Promise((r) => setTimeout(r, 0)); }
      });
      URL.revokeObjectURL(markerObjUrl);
      const mindBuffer = await compiler.exportData();

      setState('uploading'); setProgress(55);
      const targetsMeta = [{ label: name, planeWidth:1, planeHeight:0.5625, planeOffsetY:0, targetType:'document', urlLink:'', fileName: pdfBlob.name }];
      const freshMarkerBlob = new Blob([await markerFile.arrayBuffer()], { type: markerFile.type || 'image/jpeg' });
      await saveTargets(targetsMeta, mindBuffer, null, [freshMarkerBlob], (pct) => setProgress(55 + Math.round(pct * 0.35)), isPublic, [pdfBlob]);

      setState('finalizing'); setProgress(95);

      const mindUrl  = URL.createObjectURL(new Blob([mindBuffer], { type:'application/octet-stream' }));
      const arTargets = [{ label: name, targetIndex:0, planeWidth:1, planeHeight:0.5625, planeOffsetY:0,
        targetType:'document', urlLink:URL.createObjectURL(pdfBlob), fileName: pdfBlob.name, previewUrl:'', videoUrl:'', isPublic }];
      onStart({ targets: arTargets, mindFileUrl: mindUrl });

      if (isPublic) rebuildPublicMindInBackground();
    } catch (err) {
      setState('error');
      setError(err.message || 'Failed to create catalog. Please try again.');
    }
  }, [canCreate, catalogName, filledItems, markerFile, onStart, isPublic, themeColor]);

  const isWorking = ['compiling','uploading','finalizing'].includes(state);

  return (
    <div style={{ position:'fixed', inset:0, background:'linear-gradient(160deg,#061A1F 0%,#0A2229 50%,#061820 100%)',
      display:'flex', flexDirection:'column', fontFamily:FONT, overflow:'hidden' }}>

      {isWorking && <UploadProgressOverlay compileState={state} progress={progress} />}

      <input ref={markerInputRef} type="file" accept="image/*" style={{ display:'none' }} onChange={pickMarkerFromInput} />
      {items.map((it) => (
        <input key={it.id} ref={(el) => { itemImageRefs.current[it.id] = el; }} type="file" accept="image/*"
          style={{ display:'none' }} onChange={(e) => onItemImageChosen(it.id, e)} />
      ))}

      <div style={{ padding:'48px 20px 16px', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
        <button onClick={onBack} style={{ background:'transparent', border:'1.5px solid rgba(255,255,255,0.2)',
          borderRadius:20, color:'rgba(255,255,255,0.7)', fontSize:13, fontWeight:600, fontFamily:FONT, padding:'7px 16px', cursor:'pointer' }}>
          ← Back
        </button>
        <div>
          <div style={{ fontSize:18, fontWeight:700, color:'#fff', fontFamily:FONT }}>Create Catalog</div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.45)', fontFamily:FONT, marginTop:2 }}>
            Scan the cover photo → opens your catalog as a PDF
          </div>
        </div>
      </div>

      {/* Side-by-side only once there is genuinely room for two columns. Below
          that the preview stacks under the editor rather than being squeezed —
          on a phone a split pane leaves neither side usable. */}
      <style>{`
        .cat-split { display:flex; flex-direction:column; gap:22px; align-items:stretch; }
        .cat-editor { display:flex; flex-direction:column; gap:20px; min-width:0; }
        .cat-preview-col { min-width:0; }
        @media (min-width: 900px) {
          .cat-split { flex-direction:row; align-items:flex-start; gap:30px; }
          .cat-editor { flex:0 0 400px; }
          .cat-preview-col { flex:1; position:sticky; top:0; }
        }
      `}</style>

      <div style={{ flex:1, overflowY:'auto', padding:'0 20px 40px' }}>
       <div className="cat-split">
        <div className="cat-editor">
        <div>
          <div style={labelStyle}>Catalog Name</div>
          <input value={catalogName} onChange={(e) => setCatalogName(e.target.value)} placeholder="e.g. Summer Collection"
            style={inputStyle} />
        </div>

        <div>
          <div style={labelStyle}>Theme Colour</div>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <input type="color" value={themeColor} onChange={(e) => setThemeColor(e.target.value)}
              aria-label="Catalog theme colour"
              style={{ width:44, height:44, padding:0, border:'none', borderRadius:10, background:'none',
                cursor:'pointer', flexShrink:0 }} />
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', fontFamily:FONT, lineHeight:1.5 }}>
              Used for prices and the accent rule in the generated PDF
            </div>
          </div>
        </div>

        <div>
          <div style={labelStyle}>Cover / Marker Image</div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', fontFamily:FONT, marginBottom:10 }}>
            This is the photo people scan to open the catalog
          </div>
          <UploadDropZone title="Tap to upload" hint="JPG, PNG (Max 50MB)" preview={markerPreview}
            onClick={() => markerInputRef.current?.click()} />
        </div>

        <div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
            <div style={labelStyle}>Items ({filledItems.length})</div>
            <button onClick={addItem} style={{ background:'rgba(0,201,167,0.15)', border:`1px solid ${TEAL}55`,
              borderRadius:20, color:TEAL, fontSize:12, fontWeight:700, fontFamily:FONT, padding:'6px 14px', cursor:'pointer' }}>
              + Add Item
            </button>
          </div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.35)', fontFamily:FONT, marginBottom:2 }}>
            Add a photo for each item — the next item's card appears automatically
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:12, marginTop: 10 }}>
            {items.map((item, i) => (
              <div key={item.id} onFocusCapture={() => setActiveId(item.id)}>
                <ItemCard item={item} index={i}
                  canRemove={items.length > 1}
                  onChange={(patch) => updateItem(item.id, patch)}
                  onRemove={() => removeItem(item.id)}
                  onPickImage={() => { setActiveId(item.id); pickItemImage(item.id); }} />
              </div>
            ))}
          </div>
        </div>

        {state === 'error' && (
          <div style={{ background:'rgba(220,50,50,0.12)', border:'1px solid rgba(220,50,50,0.35)',
            borderRadius:12, padding:'12px 16px', fontSize:12, color:'#FF6B6B', fontFamily:FONT }}>
            {error}
          </div>
        )}

        <button onClick={handleCreate} disabled={!canCreate || isWorking}
          style={{ width:'100%', background: canCreate ? `linear-gradient(135deg, ${TEAL}, #00E5CC)` : 'rgba(255,255,255,0.08)',
            border:'none', borderRadius:50, color: canCreate ? '#040D0B' : 'rgba(255,255,255,0.3)',
            fontSize:16, fontWeight:700, fontFamily:FONT, padding:'16px',
            cursor: canCreate ? 'pointer' : 'not-allowed', opacity: isWorking ? 0.6 : 1 }}>
          {isWorking ? 'Creating...' : 'Create Catalog'}
        </button>
        {!canCreate && !isWorking && (
          <div style={{ textAlign:'center', fontSize:11, color:'rgba(255,255,255,0.3)', fontFamily:FONT }}>
            Add a catalog name, a cover photo, and a photo + name for at least one item
          </div>
        )}
        </div>

        <div className="cat-preview-col">
          <div style={{ ...labelStyle, display:'flex', alignItems:'center', gap:8 }}>
            Live Preview
            <span style={{ fontSize:10, fontWeight:600, letterSpacing:0, color:'rgba(255,255,255,0.35)' }}>
              — updates as you type
            </span>
          </div>
          <CatalogPreview name={catalogName} themeColor={themeColor} items={items}
            markerPreview={markerPreview} activeId={activeId} />
        </div>
       </div>
      </div>
    </div>
  );
}

const labelStyle = { fontSize:12, fontWeight:700, color:'rgba(255,255,255,0.6)',
  fontFamily:"Outfit, sans-serif", letterSpacing:'0.08em', marginBottom:8 };
