import { useState, useCallback, useRef } from 'react';
import { COMPILER_URL } from '../hooks/loadMindARCompiler.js';
import { saveCatalog } from '../hooks/useCatalog.js';
import { saveTargets } from '../hooks/useArStorage.js';
import { rebuildPublicMindInBackground } from '../utils/rebuildPublicMind.js';
import { assessMarkerQuality } from '../utils/assessMarkerQuality.js';
import UploadProgressOverlay from './UploadProgressOverlay.jsx';
import UploadDropZone from './UploadDropZone.jsx';

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const TEAL = "#00C9A7";
const GOLD = "#C9A84C";

function emptyItem() {
  return { id: Date.now() + Math.random().toString(36).slice(2), title: '', price: '', description: '', urlLink: '', imageFile: null, imagePreview: null };
}

function ItemCard({ item, index, onChange, onRemove, onPickImage }) {
  return (
    <div style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:16, padding:14, display:'flex', flexDirection:'column', gap:10 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ fontSize:12, fontWeight:700, color:GOLD, letterSpacing:'0.06em' }}>ITEM {index + 1}</span>
        <button onClick={onRemove} style={{ background:'transparent', border:'none', color:'rgba(255,255,255,0.4)', fontSize:12, cursor:'pointer' }}>Remove</button>
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

export default function CatalogSetupScreen({ onStart, onBack, isPublic = false }) {
  const [catalogName, setCatalogName] = useState('My Catalog');
  const [markerFile,    setMarkerFile]    = useState(null);
  const [markerPreview, setMarkerPreview] = useState(null);
  const [items,   setItems]   = useState([emptyItem()]);
  const [state,   setState]   = useState('idle');
  const [progress,setProgress]= useState(0);
  const [error,   setError]   = useState('');
  const [markerSheet, setMarkerSheet] = useState(false);
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

  const updateItem = (id, patch) => setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const removeItem = (id) => setItems((prev) => (prev.length > 1 ? prev.filter((it) => it.id !== id) : prev));
  const addItem    = () => setItems((prev) => [...prev, emptyItem()]);

  const pickItemImage = (id) => {
    const input = itemImageRefs.current[id];
    input?.click();
  };
  const onItemImageChosen = (id, e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    updateItem(id, { imageFile: file, imagePreview: URL.createObjectURL(file) });
  };

  const canCreate = catalogName.trim() && markerFile && items.every((it) => it.imageFile && it.title.trim());

  const handleCreate = useCallback(async () => {
    if (!canCreate) return;
    setState('compiling'); setProgress(0); setError('');
    try {
      const catalogId = await saveCatalog(catalogName.trim(), items, (pct) => setProgress(Math.round(pct * 0.3)));

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
        if (pct !== lastPct) { lastPct = pct; setProgress(30 + Math.round(pct * 0.3)); return new Promise((r) => setTimeout(r, 0)); }
      });
      URL.revokeObjectURL(markerObjUrl);
      const mindBuffer = await compiler.exportData();

      setState('uploading'); setProgress(60);
      const label       = catalogName.trim();
      const targetsMeta = [{ label, planeWidth:1, planeHeight:0.5625, planeOffsetY:0, targetType:'catalog', urlLink:String(catalogId) }];
      const freshMarkerBlob = new Blob([await markerFile.arrayBuffer()], { type: markerFile.type || 'image/jpeg' });
      await saveTargets(targetsMeta, mindBuffer, null, [freshMarkerBlob], (pct) => setProgress(60 + Math.round(pct * 0.3)), isPublic);

      setState('finalizing'); setProgress(95);

      const mindUrl  = URL.createObjectURL(new Blob([mindBuffer], { type:'application/octet-stream' }));
      const arTargets = [{ label, targetIndex:0, planeWidth:1, planeHeight:0.5625, planeOffsetY:0,
        targetType:'catalog', urlLink:String(catalogId), videoUrl:'', isPublic }];
      onStart({ targets: arTargets, mindFileUrl: mindUrl });

      if (isPublic) rebuildPublicMindInBackground();
    } catch (err) {
      setState('error');
      setError(err.message || 'Failed to create catalog. Please try again.');
    }
  }, [canCreate, catalogName, items, markerFile, onStart, isPublic]);

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
            Scan the cover photo → browse all your items
          </div>
        </div>
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:'0 20px 40px', display:'flex', flexDirection:'column', gap:20 }}>
        <div>
          <div style={labelStyle}>Catalog Name</div>
          <input value={catalogName} onChange={(e) => setCatalogName(e.target.value)} placeholder="e.g. Summer Collection"
            style={inputStyle} />
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
            <div style={labelStyle}>Items ({items.length})</div>
            <button onClick={addItem} style={{ background:'rgba(0,201,167,0.15)', border:`1px solid ${TEAL}55`,
              borderRadius:20, color:TEAL, fontSize:12, fontWeight:700, fontFamily:FONT, padding:'6px 14px', cursor:'pointer' }}>
              + Add Item
            </button>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {items.map((item, i) => (
              <ItemCard key={item.id} item={item} index={i}
                onChange={(patch) => updateItem(item.id, patch)}
                onRemove={() => removeItem(item.id)}
                onPickImage={() => pickItemImage(item.id)} />
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
            Add a catalog name, a cover photo, and a photo + name for every item
          </div>
        )}
      </div>
    </div>
  );
}

const labelStyle = { fontSize:12, fontWeight:700, color:'rgba(255,255,255,0.6)',
  fontFamily:"Outfit, sans-serif", letterSpacing:'0.08em', marginBottom:8 };
