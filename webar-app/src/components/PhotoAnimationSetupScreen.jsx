import { useState, useEffect, useRef, useCallback } from 'react';
import { COMPILER_URL } from '../hooks/loadMindARCompiler.js';
import { saveAnimation } from '../hooks/usePhotoAnimations.js';
import { saveTargets } from '../hooks/useArStorage.js';
import { rebuildPublicMindInBackground } from '../utils/rebuildPublicMind.js';
import { assessMarkerQuality } from '../utils/assessMarkerQuality.js';
import UploadProgressOverlay from './UploadProgressOverlay.jsx';
import UploadDropZone from './UploadDropZone.jsx';
import FrameViewer from './FrameViewer.jsx';
import CarFrameViewer from './CarFrameViewer.jsx';

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const TEAL = "#00C9A7";
const GOLD = "#C9A84C";

// ── Built-in Memoera sample animations ──────────────────────────────────────
const MEMOERA_SAMPLES = [
  { id: 's1', name: 'Invitation',  emoji: '🎂', framesPath: '/invitation-29-frames', total: 360, thumb: '/invitation-29-frames/frame_0000.jpg', draggable: true },
  { id: 's2', name: 'Car Cover',   emoji: '🚗', stops: ['#1c1c1c','#3a3a3a','#707070','#b0b0b0','#e0e0e0'] },
];

// ── What-it-looks-like examples shown before the user builds their own ─────
const EXAMPLES = [
  { id: 'ex-car', kind: 'car', title: 'Car Reveal', thumb: '/car-frames/frame_0000.jpg', badge: '360° SPIN' },
  { id: 'ex-invite', kind: 'sample', title: 'Invitation', framesPath: '/invitation-29-frames', total: 360, thumb: '/invitation-29-frames/frame_0000.jpg', canvasWidth: 540, canvasHeight: 960, badge: 'BIRTHDAY' },
  { id: 'ex-sample', kind: 'sample', title: 'Sample', framesPath: '/collection-frames', total: 93, thumb: '/collection-frames/frame_0000.jpg', badge: '360° SPIN' },
];

// ── 3D Animation Experience ─────────────────────────────────────────────────
// A guided version of the same frame-sequence engine the Car Reveal already
// uses. Instead of dumping an unordered multi-select in, the user fills one
// slot per angle — which both answers "have I taken enough photos?" visually
// and gives us the photos already in spin order, so the result actually reads
// as walking around the product.
//
// Deliberately NOT AI: nothing here reconstructs geometry or detects what the
// product is. The category and experience type are the user's own choice and
// only decide labelling and which angles are asked for.
const ANGLE_SLOTS = [
  { key: 'front',   label: 'Front',   glyph: '▣', required: true  },
  { key: 'front45', label: '45°',     glyph: '◹', required: false },
  { key: 'right',   label: 'Right',   glyph: '◨', required: true  },
  { key: 'back45',  label: '45° opp', glyph: '◸', required: false },
  { key: 'back',    label: 'Back',    glyph: '▢', required: true  },
  { key: 'left',    label: 'Left',    glyph: '◧', required: true  },
  { key: 'top',     label: 'Top',     glyph: '△', required: false },
  { key: 'detail',  label: 'Detail',  glyph: '◉', required: false },
];

const PRODUCT_CATEGORIES = [
  { key: 'car',       label: 'Car',        emoji: '🚗' },
  { key: 'gym',       label: 'Gym',        emoji: '🏋️' },
  { key: 'apparel',   label: 'Apparel',    emoji: '👖' },
  { key: 'furniture', label: 'Furniture',  emoji: '🪑' },
  { key: 'jewellery', label: 'Jewellery',  emoji: '💍' },
  { key: 'other',     label: 'Other',      emoji: '➕' },
];

// Which experience each trade is most likely to want first. The full list is
// always available — this only decides the order they're offered in.
const EXPERIENCE_TYPES = [
  { key: 'uncover',    label: 'Uncover',    hint: 'Premium reveal',    glyph: '◍' },
  { key: 'spin',       label: '360° View',  hint: 'All the way round', glyph: '↻' },
  { key: 'walk',       label: 'Walkaround', hint: 'Interactive tour',  glyph: '◎' },
  { key: 'use',        label: 'Drive / Use',hint: 'Show it in use',    glyph: '⚙' },
  { key: 'explode',    label: 'Explode',    hint: 'See inside',        glyph: '✧' },
];

const CATEGORY_SUGGESTS = {
  car:       ['uncover', 'use', 'spin', 'walk', 'explode'],
  gym:       ['use', 'walk', 'spin', 'explode', 'uncover'],
  apparel:   ['spin', 'uncover', 'walk', 'explode', 'use'],
  furniture: ['walk', 'explode', 'spin', 'uncover', 'use'],
  jewellery: ['uncover', 'spin', 'walk', 'use', 'explode'],
  other:     ['spin', 'uncover', 'walk', 'use', 'explode'],
};

async function generateSampleFrames(stops) {
  const files = [];
  for (let i = 0; i < stops.length; i++) {
    const canvas = document.createElement('canvas');
    canvas.width = 480; canvas.height = 480;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(240, 160, 30, 240, 280, 340);
    grad.addColorStop(0, stops[i]);
    grad.addColorStop(1, stops[(i + 2) % stops.length]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 480, 480);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
    files.push(new File([blob], `sample_frame_${i + 1}.jpg`, { type: 'image/jpeg' }));
  }
  return files;
}

async function extractFramesFromUrl(videoUrl, count = 12) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.src         = videoUrl;
    video.muted       = true;
    video.crossOrigin = 'anonymous';
    video.preload     = 'metadata';
    video.onerror     = () => reject(new Error('Could not load sample video'));

    video.onloadedmetadata = async () => {
      const duration = Math.min(video.duration || 10, 30);
      const step  = duration / count;
      const files = [];
      try {
        for (let i = 0; i < count; i++) {
          await new Promise((r) => { video.currentTime = step * i + 0.05; video.onseeked = r; });
          const canvas = document.createElement('canvas');
          // Scale uniformly (not per-axis) so the aspect ratio isn't distorted.
          const vw = video.videoWidth || 480, vh = video.videoHeight || 480;
          const scale = Math.min(1, 1920 / Math.max(vw, vh));
          canvas.width  = Math.round(vw * scale);
          canvas.height = Math.round(vh * scale);
          canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
          const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
          files.push(new File([blob], `frame_${i + 1}.jpg`, { type: 'image/jpeg' }));
        }
      } catch (_) {}
      resolve(files);
    };
  });
}

async function loadFramesFromPath(framesPath, total) {
  const BATCH = 30;
  const files = new Array(total);
  for (let start = 0; start < total; start += BATCH) {
    const end = Math.min(start + BATCH, total);
    await Promise.all(
      Array.from({ length: end - start }, async (_, j) => {
        const i   = start + j;
        const url = `${framesPath}/frame_${String(i).padStart(4, '0')}.jpg`;
        const res = await fetch(url);
        const blob = await res.blob();
        files[i] = new File([blob], `frame_${i + 1}.jpg`, { type: 'image/jpeg' });
      })
    );
  }
  return files;
}

async function extractVideoFrames(videoFile, count = 10) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url   = URL.createObjectURL(videoFile);
    video.src        = url;
    video.muted      = true;
    video.playsInline = true;
    video.preload    = 'metadata';
    video.onerror    = () => { URL.revokeObjectURL(url); reject(new Error('Could not read video')); };

    video.onloadedmetadata = async () => {
      const duration = Math.min(video.duration || 10, 30);
      const step  = duration / count;
      const files = [];
      try {
        for (let i = 0; i < count; i++) {
          await new Promise((r) => { video.currentTime = step * i + step * 0.1; video.onseeked = r; });
          const canvas = document.createElement('canvas');
          // Scale uniformly (not per-axis) so the aspect ratio isn't distorted.
          const vw = video.videoWidth || 480, vh = video.videoHeight || 480;
          const scale = Math.min(1, 1920 / Math.max(vw, vh));
          canvas.width  = Math.round(vw * scale);
          canvas.height = Math.round(vh * scale);
          canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
          const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
          files.push(new File([blob], `frame_${i + 1}.jpg`, { type: 'image/jpeg' }));
        }
      } catch (_) {}
      URL.revokeObjectURL(url);
      resolve(files);
    };
  });
}

// ── Small sample preview card ─────────────────────────────────────────────
function SampleCard({ sample, onClick }) {
  const hasThumb = !!sample.thumb;
  const gradient = !hasThumb && sample.stops
    ? `linear-gradient(135deg, ${sample.stops[0]}, ${sample.stops[2]}, ${sample.stops[4]})`
    : null;

  return (
    <div onClick={onClick}
      style={{ borderRadius:14, overflow:'hidden', cursor:'pointer', width:140, flexShrink:0,
        border: hasThumb ? '1.5px solid rgba(0,201,167,0.45)' : '1.5px solid rgba(255,255,255,0.12)',
        background: hasThumb ? 'rgba(0,201,167,0.06)' : 'rgba(255,255,255,0.04)',
        position:'relative' }}>

      {/* Thumbnail / gradient preview */}
      <div style={{ width:'100%', height:80, position:'relative', overflow:'hidden',
        background: gradient || '#0a1a20' }}>
        {hasThumb && (
          <img src={sample.thumb} alt={sample.name}
            style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
        )}
        {/* Draggable overlay badge */}
        {sample.draggable && (
          <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center',
            justifyContent:'center', pointerEvents:'none' }}>
            <div style={{ background:'rgba(0,0,0,0.52)', borderRadius:20, padding:'5px 10px',
              display:'flex', alignItems:'center', gap:5, backdropFilter:'blur(3px)' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                stroke="#00C9A7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/>
                <polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/>
                <line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/>
              </svg>
              <span style={{ fontSize:9, color:'#00C9A7', fontWeight:800, letterSpacing:'0.06em' }}>DRAG</span>
            </div>
          </div>
        )}
        {/* FRAMES badge */}
        {hasThumb && sample.total && (
          <div style={{ position:'absolute', top:5, right:6, background:'rgba(0,201,167,0.85)',
            borderRadius:20, padding:'2px 7px' }}>
            <span style={{ fontSize:8, fontWeight:800, color:'#fff', letterSpacing:'0.06em' }}>{sample.total} FRAMES</span>
          </div>
        )}
      </div>

      <div style={{ padding:'8px 10px 10px', display:'flex', alignItems:'center', gap:6 }}>
        <span style={{ fontSize:16 }}>{sample.emoji}</span>
        <span style={{ fontSize:12, fontWeight:700,
          color: hasThumb ? TEAL : 'rgba(255,255,255,0.85)', fontFamily:FONT }}>
          {sample.name}
        </span>
      </div>
    </div>
  );
}

// ── Photo edit modal — crop + background removal ──────────────────────────
function PhotoEditModal({ file, isMarker, onApply, onCancel }) {
  const [preview,     setPreview]     = useState(null);
  const [working,     setWorking]     = useState(false);
  const [currentFile, setCurrentFile] = useState(file);

  useEffect(() => {
    const url = URL.createObjectURL(currentFile);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [currentFile]);

  const cropToSquare = async () => {
    setWorking(true);
    const blob = await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const size = Math.min(img.width, img.height);
        const c = document.createElement('canvas');
        c.width = c.height = size;
        c.getContext('2d').drawImage(img,
          (img.width - size) / 2, (img.height - size) / 2,
          size, size, 0, 0, size, size);
        c.toBlob(resolve, 'image/jpeg', 0.9);
      };
      img.src = URL.createObjectURL(currentFile);
    });
    setCurrentFile(new File([blob], currentFile.name, { type: 'image/jpeg' }));
    setWorking(false);
  };

  const removeBg = async () => {
    setWorking(true);
    const blob = await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const id = ctx.getImageData(0, 0, c.width, c.height);
        const d = id.data, W = c.width, H = c.height;
        const ci = [0, W-1, (H-1)*W, (H-1)*W + W-1];
        let bR=0, bG=0, bB=0;
        ci.forEach(i => { bR+=d[i*4]; bG+=d[i*4+1]; bB+=d[i*4+2]; });
        bR/=4; bG/=4; bB/=4;
        for (let i=0; i<d.length; i+=4) {
          const dr=d[i]-bR, dg=d[i+1]-bG, db=d[i+2]-bB;
          if (Math.sqrt(dr*dr+dg*dg+db*db) < 55) d[i+3]=0;
        }
        ctx.putImageData(id, 0, 0);
        c.toBlob(resolve, 'image/png');
      };
      img.src = URL.createObjectURL(currentFile);
    });
    setCurrentFile(new File([blob], currentFile.name.replace(/\.(jpe?g)$/i, '.png'), { type: 'image/png' }));
    setWorking(false);
  };

  return (
    <div style={{ position:'fixed', inset:0, zIndex:600, background:'rgba(0,0,0,0.88)',
      display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ width:'100%', maxWidth:360, background:'#0d2530',
        borderRadius:20, padding:20, display:'flex', flexDirection:'column', gap:12 }}>
        <div style={{ fontSize:15, fontWeight:700, color:'#fff', fontFamily:FONT }}>
          {isMarker ? 'Edit Marker Photo' : 'Edit Frame Photo'}
        </div>
        {preview && (
          <div style={{ borderRadius:12, overflow:'hidden', background:'#112233', maxHeight:300, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <img src={preview} alt="edit"
              style={{ maxWidth:'100%', maxHeight:300, objectFit:'contain', display:'block' }} />
          </div>
        )}
        {working && (
          <div style={{ textAlign:'center', fontSize:12, color:TEAL, fontFamily:FONT }}>Processing…</div>
        )}
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={cropToSquare} disabled={working}
            style={{ flex:1, background:'rgba(255,255,255,0.09)', border:'1px solid rgba(255,255,255,0.18)',
              borderRadius:10, color:'#fff', fontSize:12, fontWeight:700, fontFamily:FONT,
              padding:'10px 4px', cursor:'pointer', opacity: working ? 0.5 : 1 }}>
            ✂ Crop Square
          </button>
          <button onClick={removeBg} disabled={working}
            style={{ flex:1, background:`rgba(0,201,167,0.12)`, border:`1px solid ${TEAL}44`,
              borderRadius:10, color:TEAL, fontSize:12, fontWeight:700, fontFamily:FONT,
              padding:'10px 4px', cursor:'pointer', opacity: working ? 0.5 : 1 }}>
            🪄 Remove BG
          </button>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={onCancel}
            style={{ flex:1, background:'transparent', border:'1px solid rgba(255,255,255,0.18)',
              borderRadius:10, color:'rgba(255,255,255,0.55)', fontSize:13, fontFamily:FONT,
              padding:11, cursor:'pointer' }}>
            Cancel
          </button>
          <button onClick={() => onApply(currentFile)} disabled={working}
            style={{ flex:2, background:TEAL, border:'none', borderRadius:10,
              color:'#000', fontSize:13, fontWeight:700, fontFamily:FONT,
              padding:11, cursor:'pointer', opacity: working ? 0.5 : 1 }}>
            {isMarker ? '✓ Use as Marker' : '✓ Add to Frames'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Bottom-sheet modal ────────────────────────────────────────────────────
function Sheet({ title, children, onClose }) {
  return (
    <div style={{ position:'fixed', inset:0, zIndex:500, display:'flex', flexDirection:'column', justifyContent:'flex-end' }}
      onClick={onClose}>
      <div style={{ background:'rgba(0,0,0,0.55)', position:'absolute', inset:0, backdropFilter:'blur(4px)' }} />
      <div onClick={(e) => e.stopPropagation()}
        style={{ position:'relative', background:'linear-gradient(180deg,#0d2530 0%,#081c26 100%)',
          borderRadius:'24px 24px 0 0', maxHeight:'82vh', display:'flex', flexDirection:'column',
          boxShadow:'0 -8px 40px rgba(0,0,0,0.6)' }}>
        {/* Handle */}
        <div style={{ width:44, height:5, borderRadius:3, background:'rgba(255,255,255,0.18)', margin:'12px auto 0', flexShrink:0 }} />
        <div style={{ fontSize:14, fontWeight:700, color:'rgba(255,255,255,0.7)', fontFamily:FONT,
          padding:'16px 20px 4px', letterSpacing:'0.06em', flexShrink:0 }}>{title}</div>
        <div style={{ overflowY:'auto', paddingBottom:40 }}>{children}</div>
      </div>
    </div>
  );
}

function SheetRow({ icon, label, sub, onClick, accent }) {
  return (
    <div onClick={onClick}
      style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 20px', cursor:'pointer' }}>
      <div style={{ width:44, height:44, borderRadius:12, flexShrink:0,
        background: accent ? `rgba(0,201,167,0.15)` : 'rgba(255,255,255,0.07)',
        display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>{icon}</div>
      <div>
        <div style={{ fontSize:14, fontWeight:700, color: accent ? TEAL : '#fff', fontFamily:FONT }}>{label}</div>
        {sub && <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', fontFamily:FONT, marginTop:1 }}>{sub}</div>}
      </div>
    </div>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────
export default function PhotoAnimationSetupScreen({ onStart, onBack, isPublic = false, sharedImageFile, sharedImagePreviewUrl, sharedLabel }) {
  const [markerFile,    setMarkerFile]    = useState(sharedImageFile || null);
  const [markerPreview, setMarkerPreview] = useState(sharedImagePreviewUrl || null);
  const [frameFiles,    setFrameFiles]    = useState([]);
  const [framePreviews, setFramePreviews] = useState([]);
  const [animName,      setAnimName]      = useState(sharedLabel || 'My AR Animation');
  const [state,         setState]         = useState('idle');
  const [progress,      setProgress]      = useState(0);
  const [error,         setError]         = useState('');
  const [markerSheet,   setMarkerSheet]   = useState(false);
  const [frameSheet,    setFrameSheet]    = useState(false);
  const [extracting,    setExtracting]    = useState(false);
  const [editModal,     setEditModal]     = useState(null); // { file }
  const [previewActive, setPreviewActive] = useState(null); // example being watched full-screen

  // ── 3D Animation Experience mode ──────────────────────────────────────────
  const [mode,          setMode]          = useState('simple'); // 'simple' | '3d'
  const [category,      setCategory]      = useState('car');
  const [experience,    setExperience]    = useState('uncover');
  const [angleFiles,    setAngleFiles]    = useState({});  // { front: File, ... }
  const [anglePreviews, setAnglePreviews] = useState({});
  const [pendingAngle,  setPendingAngle]  = useState(null); // slot awaiting a photo
  const angleCamRef     = useRef(null);
  const angleGalleryRef = useRef(null);

  // File inputs — separate refs for camera vs gallery vs storage vs video
  const markerCamRef     = useRef(null);
  const markerGalleryRef = useRef(null);
  const markerFilesRef   = useRef(null);
  const framesGalleryRef = useRef(null);
  const framesVideoRef   = useRef(null);
  const framesCamRef     = useRef(null);

  const applyMarker = useCallback(async (file) => {
    if (!file) return;
    const quality = await assessMarkerQuality(file);
    if (quality?.isLowDetail && !window.confirm(
      'This photo looks fairly plain or low-contrast — flat logos and plain-color images give the scanner fewer distinctive details to lock onto, and may scan unreliably. Continue with this photo anyway?'
    )) return;
    setMarkerFile(file);
    setMarkerPreview(URL.createObjectURL(file));
    setMarkerSheet(false);
  }, []);

  const pickMarkerFromInput = useCallback((e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setMarkerSheet(false);
    setEditModal({ file, isMarker: true });
  }, []);

  const applyFrames = useCallback((files) => {
    if (!files.length) return;
    if (files.length < 2) { alert('Please select at least 2 photos for the animation.'); return; }
    setFrameFiles(files);
    setFramePreviews(files.slice(0, 4).map((f) => URL.createObjectURL(f)));
    setFrameSheet(false);
  }, []);

  const pickFramesFromGallery = useCallback((e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    // Single photo → open edit modal (crop + BG remove) before adding
    if (files.length === 1) {
      setFrameSheet(false);
      setEditModal({ file: files[0] });
    } else {
      applyFrames(files);
    }
  }, [applyFrames]);

  const pickFramesFromVideo = useCallback(async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setFrameSheet(false);
    setExtracting(true);
    try {
      const frames = await extractVideoFrames(file, 10);
      if (frames.length < 2) { alert('Could not extract enough frames. Try a longer video clip.'); return; }
      applyFrames(frames);
    } catch (err) {
      alert('Failed to extract frames: ' + (err.message || ''));
    } finally {
      setExtracting(false);
    }
  }, [applyFrames]);

  const pickFrameFromCamera = useCallback((e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setFrameSheet(false);
    setEditModal({ file });
  }, []);

  const applyEditedFrame = useCallback((editedFile, isMarker) => {
    setEditModal(null);
    if (isMarker) {
      applyMarker(editedFile);
    } else {
      setFrameFiles((prev) => {
        const next = [...prev, editedFile];
        setFramePreviews(next.slice(0, 4).map((f) => URL.createObjectURL(f)));
        return next;
      });
    }
  }, [applyMarker]);

  const pickSample = useCallback(async (sample) => {
    setFrameSheet(false);
    setExtracting(true);
    try {
      const frames = sample.framesPath
        ? await loadFramesFromPath(sample.framesPath, sample.total)
        : await generateSampleFrames(sample.stops);
      if (frames.length < 2) { alert('Could not load sample frames.'); return; }
      setFrameFiles(frames);
      setFramePreviews(frames.slice(0, 4).map((f) => URL.createObjectURL(f)));
    } catch (err) {
      alert('Failed to load sample: ' + (err.message || ''));
    } finally {
      setExtracting(false);
    }
  }, []);

  const applyAngle = useCallback((slotKey, file) => {
    if (!file || !slotKey) return;
    setAngleFiles((prev) => ({ ...prev, [slotKey]: file }));
    setAnglePreviews((prev) => {
      if (prev[slotKey]) URL.revokeObjectURL(prev[slotKey]);
      return { ...prev, [slotKey]: URL.createObjectURL(file) };
    });
    setPendingAngle(null);
  }, []);

  const pickAngleFromInput = useCallback((e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) applyAngle(pendingAngle, file);
    else setPendingAngle(null);
  }, [applyAngle, pendingAngle]);

  const clearAngle = useCallback((slotKey) => {
    setAngleFiles((prev) => { const n = { ...prev }; delete n[slotKey]; return n; });
    setAnglePreviews((prev) => {
      if (prev[slotKey]) URL.revokeObjectURL(prev[slotKey]);
      const n = { ...prev }; delete n[slotKey]; return n;
    });
  }, []);

  // ANGLE_SLOTS is declared in spin order, so filtering it straight through
  // hands the engine frames that already read as walking around the product.
  const angleFrames  = ANGLE_SLOTS.map((s) => angleFiles[s.key]).filter(Boolean);
  const anglesNeeded = ANGLE_SLOTS.filter((s) => s.required);
  const anglesDone   = anglesNeeded.filter((s) => angleFiles[s.key]).length;
  const is3d         = mode === '3d';

  const effectiveFrames = is3d ? angleFrames : frameFiles;
  const canCreate = markerFile && animName.trim() && effectiveFrames.length >= 2 &&
    (!is3d || anglesDone === anglesNeeded.length);

  const handleCreate = useCallback(async () => {
    if (!canCreate) return;
    setState('compiling'); setProgress(0); setError('');
    try {
      const animId = await saveAnimation(animName.trim(), effectiveFrames);

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
        if (pct !== lastPct) { lastPct = pct; setProgress(pct); return new Promise((r) => setTimeout(r, 0)); }
      });
      URL.revokeObjectURL(markerObjUrl);
      const mindBuffer = await compiler.exportData();

      setState('uploading'); setProgress(0);
      const label       = animName.trim();
      const targetsMeta = [{ label, planeWidth:1, planeHeight:0.5625, planeOffsetY:0, targetType:'animation', urlLink:animId }];
      const freshMarkerBlob = new Blob([await markerFile.arrayBuffer()], { type: markerFile.type || 'image/jpeg' });
      await saveTargets(targetsMeta, mindBuffer, null, [freshMarkerBlob], (pct) => setProgress(pct), isPublic);

      setState('finalizing'); setProgress(0);

      const mindUrl  = URL.createObjectURL(new Blob([mindBuffer], { type:'application/octet-stream' }));
      const arTargets = [{ label, targetIndex:0, planeWidth:1, planeHeight:0.5625, planeOffsetY:0,
        targetType:'animation', urlLink:animId, videoUrl:'', isPublic }];
      onStart({ targets: arTargets, mindFileUrl: mindUrl });

      if (isPublic) rebuildPublicMindInBackground();
    } catch (err) {
      setState('error');
      setError(err.message || 'Failed to create animation. Please try again.');
    }
  }, [canCreate, animName, effectiveFrames, markerFile, onStart, isPublic]);

  const isWorking = ['compiling','uploading','finalizing'].includes(state);

  if (previewActive?.kind === 'car') return <CarFrameViewer onBack={() => setPreviewActive(null)} />;
  if (previewActive?.kind === 'sample') return (
    <FrameViewer title={previewActive.title} framesPath={previewActive.framesPath}
      total={previewActive.total} onBack={() => setPreviewActive(null)}
      canvasWidth={previewActive.canvasWidth} canvasHeight={previewActive.canvasHeight} />
  );

  return (
    <div style={{ position:'fixed', inset:0,
      background:'linear-gradient(160deg,#061A1F 0%,#0A2229 50%,#061820 100%)',
      display:'flex', flexDirection:'column', fontFamily:FONT, overflow:'hidden' }}>

      {(isWorking || extracting) && (
        <UploadProgressOverlay compileState={extracting ? 'compiling' : state} progress={progress}
          label={extracting ? 'Extracting frames…' : undefined} />
      )}

      {editModal && (
        <PhotoEditModal
          file={editModal.file}
          isMarker={editModal.isMarker}
          onApply={(f) => applyEditedFrame(f, editModal.isMarker)}
          onCancel={() => setEditModal(null)}
        />
      )}

      {/* Hidden file inputs */}
      <input ref={markerCamRef}     type="file" capture="environment" accept="image/*"
        style={{ display:'none' }} onChange={pickMarkerFromInput} />
      <input ref={markerGalleryRef} type="file" accept="image/*"
        style={{ display:'none' }} onChange={pickMarkerFromInput} />
      <input ref={markerFilesRef}   type="file" accept=".jpg,.jpeg,.png,.webp,.heic,.bmp"
        style={{ display:'none' }} onChange={pickMarkerFromInput} />
      <input ref={framesGalleryRef} type="file" accept="image/*" multiple
        style={{ display:'none' }} onChange={pickFramesFromGallery} />
      <input ref={framesVideoRef}   type="file" accept="video/*"
        style={{ display:'none' }} onChange={pickFramesFromVideo} />
      <input ref={framesCamRef}     type="file" accept="image/*" capture="environment"
        style={{ display:'none' }} onChange={pickFrameFromCamera} />
      <input ref={angleCamRef}      type="file" accept="image/*" capture="environment"
        style={{ display:'none' }} onChange={pickAngleFromInput} />
      <input ref={angleGalleryRef}  type="file" accept="image/*"
        style={{ display:'none' }} onChange={pickAngleFromInput} />

      {/* Header */}
      <div style={{ padding:'48px 20px 16px', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
        <button onClick={onBack}
          style={{ background:'transparent', border:'1.5px solid rgba(255,255,255,0.2)',
            borderRadius:20, color:'rgba(255,255,255,0.7)', fontSize:13, fontWeight:600,
            fontFamily:FONT, padding:'7px 16px', cursor:'pointer' }}>
          ← Back
        </button>
        <div>
          <div style={{ fontSize:18, fontWeight:700, color:'#fff', fontFamily:FONT }}>Photo Animation AR</div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.45)', fontFamily:FONT, marginTop:2 }}>
            Scan an image → animation plays
          </div>
        </div>
      </div>

      {/* Scrollable body */}
      <div style={{ flex:1, overflowY:'auto', padding:'0 20px 40px' }}>

        {/* See it in action — real examples of what a scanned photo animation looks like */}
        <div style={{ marginBottom:24 }}>
          <div style={labelStyle}>See It In Action</div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', fontFamily:FONT, marginBottom:10 }}>
            Tap an example to watch what people see when they scan
          </div>
          <div style={{ display:'flex', gap:12, overflowX:'auto', paddingBottom:4 }}>
            {EXAMPLES.map((ex) => (
              <div key={ex.id} onClick={() => setPreviewActive(ex)}
                style={{ cursor:'pointer', borderRadius:14, overflow:'hidden', width:120, flexShrink:0,
                  border:'1.5px solid rgba(0,201,167,0.35)', background:'rgba(0,201,167,0.06)' }}>
                <div style={{ width:'100%', height:90, position:'relative', overflow:'hidden', background:'#0a1a20' }}>
                  <img src={ex.thumb} alt={ex.title} loading="lazy" decoding="async"
                    style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
                  <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center',
                    justifyContent:'center', background:'rgba(0,0,0,0.18)' }}>
                    <div style={{ width:30, height:30, borderRadius:'50%', background:'rgba(0,0,0,0.55)',
                      display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z"/></svg>
                    </div>
                  </div>
                  <div style={{ position:'absolute', top:5, right:5, background:'rgba(0,201,167,0.9)',
                    borderRadius:20, padding:'2px 7px' }}>
                    <span style={{ fontSize:8, fontWeight:800, color:'#fff', letterSpacing:'0.06em' }}>{ex.badge}</span>
                  </div>
                </div>
                <div style={{ padding:'7px 9px 9px', fontSize:12, fontWeight:700, color:TEAL, fontFamily:FONT }}>
                  {ex.title}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Mode — plain slideshow vs the guided angle-by-angle experience */}
        <div style={{ marginBottom:24 }}>
          <div style={labelStyle}>Animation Type</div>
          <div style={{ display:'flex', gap:10 }}>
            <ModeCard active={!is3d} onClick={() => setMode('simple')}
              glyph="🎞️" title="Simple Animation"
              sub="Photos or a video play as a slideshow" />
            <ModeCard active={is3d} onClick={() => setMode('3d')}
              glyph="🧊" title="3D Animation Experience" badge="NEW"
              sub="Guided angles — spin around the product" />
          </div>
        </div>

        {is3d && (
          <>
            {/* Product category */}
            <div style={{ marginBottom:20 }}>
              <div style={labelStyle}>Product Category</div>
              <div style={{ display:'flex', gap:8, overflowX:'auto', paddingBottom:4 }}>
                {PRODUCT_CATEGORIES.map((c) => {
                  const on = category === c.key;
                  return (
                    <button key={c.key} onClick={() => {
                      setCategory(c.key);
                      setExperience(CATEGORY_SUGGESTS[c.key][0]);
                    }}
                      style={{ flexShrink:0, minWidth:76, borderRadius:14, cursor:'pointer',
                        background: on ? 'rgba(0,201,167,0.12)' : 'rgba(255,255,255,0.05)',
                        border: `1.5px solid ${on ? TEAL : 'rgba(255,255,255,0.12)'}`,
                        padding:'10px 8px', display:'flex', flexDirection:'column',
                        alignItems:'center', gap:4, fontFamily:FONT }}>
                      <span style={{ fontSize:20 }}>{c.emoji}</span>
                      <span style={{ fontSize:11, fontWeight:700,
                        color: on ? TEAL : 'rgba(255,255,255,0.6)' }}>{c.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Experience type — ordered by what this category usually wants */}
            <div style={{ marginBottom:20 }}>
              <div style={labelStyle}>Experience Type</div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', fontFamily:FONT, marginBottom:10 }}>
                Suggested for {PRODUCT_CATEGORIES.find(c => c.key === category)?.label.toLowerCase()}
              </div>
              <div style={{ display:'flex', gap:8, overflowX:'auto', paddingBottom:4 }}>
                {CATEGORY_SUGGESTS[category].map((k) => {
                  const x  = EXPERIENCE_TYPES.find(e => e.key === k);
                  const on = experience === k;
                  return (
                    <button key={k} onClick={() => setExperience(k)}
                      style={{ flexShrink:0, width:96, borderRadius:14, cursor:'pointer',
                        background: on ? 'rgba(201,168,76,0.14)' : 'rgba(255,255,255,0.05)',
                        border: `1.5px solid ${on ? GOLD : 'rgba(255,255,255,0.12)'}`,
                        padding:'10px 8px', display:'flex', flexDirection:'column',
                        alignItems:'center', gap:3, fontFamily:FONT, textAlign:'center' }}>
                      <span style={{ fontSize:18, color: on ? GOLD : 'rgba(255,255,255,0.5)' }}>{x.glyph}</span>
                      <span style={{ fontSize:11, fontWeight:700,
                        color: on ? GOLD : 'rgba(255,255,255,0.7)' }}>{x.label}</span>
                      <span style={{ fontSize:9, color:'rgba(255,255,255,0.35)', lineHeight:1.3 }}>{x.hint}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Photo guide — tap a slot to fill that angle */}
            <div style={{ marginBottom:24 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                <div style={{ ...labelStyle, marginBottom:0 }}>Photo Guide</div>
                <span style={{ marginLeft:'auto', fontSize:11, fontWeight:700, fontFamily:FONT,
                  color: anglesDone === anglesNeeded.length ? TEAL : GOLD }}>
                  {anglesDone} of {anglesNeeded.length} required
                </span>
              </div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', fontFamily:FONT, marginBottom:10 }}>
                Tap each box and photograph that side. Order matters — it becomes the spin.
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:8 }}>
                {ANGLE_SLOTS.map((s) => {
                  const done = !!angleFiles[s.key];
                  return (
                    <button key={s.key} onClick={() => setPendingAngle(s.key)}
                      style={{ position:'relative', aspectRatio:'4/3', borderRadius:12,
                        cursor:'pointer', overflow:'hidden', padding:0, fontFamily:FONT,
                        background: done ? '#0a1a20' : 'rgba(255,255,255,0.04)',
                        border: `1.5px ${done ? 'solid' : 'dashed'} ${done ? TEAL : 'rgba(255,255,255,0.18)'}` }}>
                      {done ? (
                        <img src={anglePreviews[s.key]} alt={s.label}
                          style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
                      ) : (
                        <span style={{ display:'flex', flexDirection:'column', alignItems:'center',
                          justifyContent:'center', height:'100%', gap:3 }}>
                          <span style={{ fontSize:17, color:'rgba(255,255,255,0.35)' }}>{s.glyph}</span>
                          <span style={{ fontSize:10, fontWeight:700, color:'rgba(255,255,255,0.55)' }}>{s.label}</span>
                          {!s.required && (
                            <span style={{ fontSize:8, color:'rgba(255,255,255,0.28)' }}>optional</span>
                          )}
                        </span>
                      )}
                      {done && (
                        <>
                          <span style={{ position:'absolute', top:4, right:4, width:17, height:17,
                            borderRadius:'50%', background:TEAL, color:'#04211d', fontSize:11,
                            fontWeight:800, lineHeight:'17px', textAlign:'center' }}>✓</span>
                          <span onClick={(e) => { e.stopPropagation(); clearAngle(s.key); }}
                            style={{ position:'absolute', top:4, left:4, width:17, height:17,
                              borderRadius:'50%', background:'rgba(0,0,0,0.6)', color:'#fff',
                              fontSize:11, lineHeight:'17px', textAlign:'center' }}>✕</span>
                          <span style={{ position:'absolute', left:0, right:0, bottom:0,
                            background:'rgba(0,0,0,0.55)', fontSize:9, fontWeight:700,
                            color:'#fff', padding:'2px 0' }}>{s.label}</span>
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
              {angleFrames.length > 0 && (
                <div style={{ fontSize:11, color:TEAL, fontFamily:FONT, fontWeight:600, marginTop:8 }}>
                  {angleFrames.length} photo{angleFrames.length === 1 ? '' : 's'} added
                  {anglesDone < anglesNeeded.length && ' — add the remaining required angles to continue'}
                </div>
              )}
            </div>
          </>
        )}

        {/* Name */}
        <div style={{ marginBottom:20 }}>
          <div style={labelStyle}>Animation Name</div>
          <input type="text" value={animName} onChange={(e) => setAnimName(e.target.value)}
            placeholder="e.g. Wedding Album 2024"
            style={{ width:'100%', background:'rgba(255,255,255,0.07)',
              border:'1.5px solid rgba(255,255,255,0.15)', borderRadius:12,
              padding:'12px 14px', fontSize:14, color:'#fff',
              fontFamily:FONT, outline:'none', boxSizing:'border-box' }} />
        </div>

        {/* Marker image */}
        <div style={{ marginBottom:20 }}>
          <div style={labelStyle}>Target / Marker Image</div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', fontFamily:FONT, marginBottom:10 }}>
            This is the photo people scan with the camera to trigger the animation
          </div>
          <UploadDropZone
            title="Tap to upload"
            hint="JPG, PNG (Max 50MB)"
            preview={markerPreview}
            onClick={() => setMarkerSheet(true)}
          />
          {markerPreview && (
            <button onClick={() => setMarkerSheet(true)}
              style={{ marginTop:8, background:'transparent', border:'none',
                color:'rgba(255,255,255,0.45)', fontSize:11, fontFamily:FONT,
                cursor:'pointer', padding:0 }}>
              Change marker image
            </button>
          )}
        </div>

        {/* Animation frames — 3D mode collects these through the photo guide instead */}
        <div style={{ marginBottom:24, display: is3d ? 'none' : 'block' }}>
          <div style={labelStyle}>Animation Frame Photos</div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', fontFamily:FONT, marginBottom:10 }}>
            Pick photos, a video, or a Memoera sample — they play as a slideshow when scanned
          </div>
          <div onClick={() => setFrameSheet(true)}
            style={{ borderRadius:20, border:`2px dashed ${GOLD}`,
              background: frameFiles.length ? 'rgba(201,168,76,0.08)' : '#0E3833',
              cursor:'pointer', minHeight:frameFiles.length ? 100 : 160,
              display:'flex', alignItems:'center', justifyContent:'center',
              flexWrap:'wrap', gap:8, padding: frameFiles.length ? 10 : '32px 20px' }}>
            {frameFiles.length ? (
              <>
                {framePreviews.map((src, i) => (
                  <img key={i} src={src} alt=""
                    style={{ width:64, height:64, objectFit:'cover', borderRadius:10, flexShrink:0 }} />
                ))}
                {frameFiles.length > 4 && (
                  <div style={{ width:64, height:64, borderRadius:10, background:'rgba(255,255,255,0.08)',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:13, fontWeight:700, color:'rgba(255,255,255,0.6)', fontFamily:FONT }}>
                    +{frameFiles.length - 4}
                  </div>
                )}
              </>
            ) : (
              <div style={{ textAlign:'center', display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
                <span style={{ fontSize:56 }}>🎞️</span>
                <span style={{ fontSize:19, fontWeight:700, color:'#ffffff', fontFamily:FONT }}>Tap to upload</span>
                <span style={{ fontSize:13, fontWeight:600, color:'rgba(255,255,255,0.65)', fontFamily:FONT }}>Photos, video, or a sample</span>
              </div>
            )}
          </div>
          {frameFiles.length > 0 && (
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:8 }}>
              <span style={{ fontSize:11, color:GOLD, fontFamily:FONT, fontWeight:600 }}>
                {frameFiles.length} frames selected
              </span>
              <button onClick={() => setFrameSheet(true)}
                style={{ background:'transparent', border:'none',
                  color:'rgba(255,255,255,0.45)', fontSize:11, fontFamily:FONT,
                  cursor:'pointer', padding:0 }}>
                Change frames
              </button>
            </div>
          )}
        </div>

        {/* How it works */}
        <div style={{ background:'rgba(255,255,255,0.04)', borderRadius:14,
          border:'1px solid rgba(255,255,255,0.08)', padding:'14px 16px', marginBottom:24 }}>
          <div style={{ fontSize:12, fontWeight:700, color:'rgba(255,255,255,0.5)',
            fontFamily:FONT, letterSpacing:'0.08em', marginBottom:8 }}>HOW IT WORKS</div>
          <div style={stepStyle}>🎯 &nbsp;Someone scans the marker photo with their camera</div>
          <div style={stepStyle}>✨ &nbsp;The animation plays automatically — all {effectiveFrames.length || 'N'} frames</div>
          <div style={stepStyle}>
            {is3d
              ? '👆  They drag left/right to turn the product and look at any side'
              : '👆  They can drag left/right to scrub through frames manually'}
          </div>
        </div>

        {/* Error */}
        {state === 'error' && (
          <div style={{ background:'rgba(220,50,50,0.12)', border:'1px solid rgba(220,50,50,0.35)',
            borderRadius:12, padding:'12px 16px', marginBottom:20,
            fontSize:12, color:'#FF6B6B', fontFamily:FONT }}>
            {error}
          </div>
        )}

        {/* Create button */}
        <button onClick={handleCreate} disabled={!canCreate || isWorking}
          style={{ width:'100%', background: canCreate
            ? `linear-gradient(135deg, ${TEAL}, #00E5CC)`
            : 'rgba(255,255,255,0.08)',
            border:'none', borderRadius:50, color: canCreate ? '#040D0B' : 'rgba(255,255,255,0.3)',
            fontSize:16, fontWeight:700, fontFamily:FONT, padding:'16px',
            cursor: canCreate ? 'pointer' : 'not-allowed', opacity: isWorking ? 0.6 : 1 }}>
          {isWorking ? 'Creating...' : 'Create AR Animation'}
        </button>

        {!canCreate && (
          <div style={{ textAlign:'center', fontSize:11, color:'rgba(255,255,255,0.3)',
            fontFamily:FONT, marginTop:12 }}>
            {!markerFile
              ? 'Pick a marker image to continue'
              : is3d
                ? `Add the ${anglesNeeded.length - anglesDone} remaining required angle${anglesNeeded.length - anglesDone === 1 ? '' : 's'}`
                : 'Add at least 2 frame photos to continue'}
          </div>
        )}
      </div>

      {/* ── Marker picker sheet ──────────────────────────────────────────────── */}
      {markerSheet && (
        <Sheet title="CHOOSE MARKER PHOTO SOURCE" onClose={() => setMarkerSheet(false)}>
          <SheetRow icon="📷" label="Take Photo" sub="Open live camera" accent
            onClick={() => { setMarkerSheet(false); setTimeout(() => markerCamRef.current?.click(), 80); }} />
          <SheetRow icon="🖼️" label="Photo Gallery" sub="Pick from your photos"
            onClick={() => { setMarkerSheet(false); setTimeout(() => markerGalleryRef.current?.click(), 80); }} />
          <SheetRow icon="📁" label="Phone Storage" sub="Browse internal storage files"
            onClick={() => { setMarkerSheet(false); setTimeout(() => markerFilesRef.current?.click(), 80); }} />
        </Sheet>
      )}

      {/* ── Frame picker sheet ───────────────────────────────────────────────── */}
      {frameSheet && (
        <Sheet title="CHOOSE ANIMATION SOURCE" onClose={() => setFrameSheet(false)}>
          {/* Memoera samples grid */}
          <div style={{ padding:'10px 20px 4px' }}>
            <div style={{ fontSize:11, fontWeight:700, color:TEAL, fontFamily:FONT,
              letterSpacing:'0.1em', marginBottom:10 }}>MEMOERA ANIMATION SAMPLES</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:12, maxHeight:320, overflowY:'auto' }}>
              {MEMOERA_SAMPLES.map((s) => (
                <SampleCard key={s.id} sample={s} onClick={() => pickSample(s)} />
              ))}
            </div>
          </div>
          <div style={{ height:1, background:'rgba(255,255,255,0.08)', margin:'14px 20px 4px' }} />
          <SheetRow icon="📸" label="Take Photo (Camera)" sub="Capture live — crop & remove background before adding" accent
            onClick={() => { setFrameSheet(false); setTimeout(() => framesCamRef.current?.click(), 80); }} />
          <SheetRow icon="🖼️" label="From Photo Gallery" sub="Select 2+ photos as animation frames"
            onClick={() => { setFrameSheet(false); setTimeout(() => framesGalleryRef.current?.click(), 80); }} />
          <SheetRow icon="🎥" label="From Video" sub="Pick a video — frames are extracted automatically"
            onClick={() => { setFrameSheet(false); setTimeout(() => framesVideoRef.current?.click(), 80); }} />
        </Sheet>
      )}

      {/* ── Angle picker sheet (3D Animation Experience) ─────────────────────── */}
      {pendingAngle && (
        <Sheet
          title={`ADD THE ${(ANGLE_SLOTS.find(s => s.key === pendingAngle)?.label || '').toUpperCase()} PHOTO`}
          onClose={() => setPendingAngle(null)}>
          <SheetRow icon="📷" label="Take Photo" sub="Stand square to this side of the product" accent
            onClick={() => setTimeout(() => angleCamRef.current?.click(), 80)} />
          <SheetRow icon="🖼️" label="Photo Gallery" sub="Pick a photo you already took"
            onClick={() => setTimeout(() => angleGalleryRef.current?.click(), 80)} />
        </Sheet>
      )}
    </div>
  );
}

function ModeCard({ active, onClick, glyph, title, sub, badge }) {
  return (
    <button onClick={onClick}
      style={{ flex:1, minWidth:0, position:'relative', borderRadius:16, cursor:'pointer',
        textAlign:'left', padding:'13px 12px', fontFamily:FONT,
        background: active ? 'rgba(0,201,167,0.12)' : 'rgba(255,255,255,0.05)',
        border: `1.5px solid ${active ? TEAL : 'rgba(255,255,255,0.12)'}` }}>
      {badge && (
        <span style={{ position:'absolute', top:8, right:8, background:GOLD, color:'#2b1002',
          fontSize:8, fontWeight:800, letterSpacing:'0.08em', borderRadius:20, padding:'2px 6px' }}>
          {badge}
        </span>
      )}
      <div style={{ fontSize:22, marginBottom:6 }}>{glyph}</div>
      <div style={{ fontSize:12.5, fontWeight:800, color: active ? TEAL : '#fff', lineHeight:1.25 }}>
        {title}
      </div>
      <div style={{ fontSize:10, color:'rgba(255,255,255,0.45)', marginTop:3, lineHeight:1.35 }}>
        {sub}
      </div>
    </button>
  );
}

const labelStyle = { fontSize:12, fontWeight:700, color:'rgba(255,255,255,0.6)',
  fontFamily:"Outfit, sans-serif", letterSpacing:'0.08em', marginBottom:8 };
const stepStyle  = { fontSize:12, color:'rgba(255,255,255,0.55)',
  fontFamily:"Outfit, sans-serif", lineHeight:1.9 };
