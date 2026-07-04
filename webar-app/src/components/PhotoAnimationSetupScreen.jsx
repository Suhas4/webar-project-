import { useState, useEffect, useRef, useCallback } from 'react';
import { COMPILER_URL } from '../hooks/loadMindARCompiler.js';
import { saveAnimation } from '../hooks/usePhotoAnimations.js';
import { saveTargets } from '../hooks/useArStorage.js';
import { rebuildPublicMindInBackground } from '../utils/rebuildPublicMind.js';
import { assessMarkerQuality } from '../utils/assessMarkerQuality.js';
import UploadProgressOverlay from './UploadProgressOverlay.jsx';

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const TEAL = "#00C9A7";
const GOLD = "#C9A84C";

// ── Built-in Memoera sample animations ──────────────────────────────────────
const MEMOERA_SAMPLES = [
  { id: 's1', name: 'Invitation',  emoji: '🎂', framesPath: '/invitation-29-frames', total: 360, thumb: '/invitation-29-frames/frame_0000.jpg', draggable: true },
  { id: 's2', name: 'Car Cover',   emoji: '🚗', stops: ['#1c1c1c','#3a3a3a','#707070','#b0b0b0','#e0e0e0'] },
];

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
export default function PhotoAnimationSetupScreen({ onStart, onBack, isPublic = false }) {
  const [markerFile,    setMarkerFile]    = useState(null);
  const [markerPreview, setMarkerPreview] = useState(null);
  const [frameFiles,    setFrameFiles]    = useState([]);
  const [framePreviews, setFramePreviews] = useState([]);
  const [animName,      setAnimName]      = useState('My AR Animation');
  const [state,         setState]         = useState('idle');
  const [progress,      setProgress]      = useState(0);
  const [error,         setError]         = useState('');
  const [markerSheet,   setMarkerSheet]   = useState(false);
  const [frameSheet,    setFrameSheet]    = useState(false);
  const [extracting,    setExtracting]    = useState(false);
  const [editModal,     setEditModal]     = useState(null); // { file }

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

  const canCreate = markerFile && frameFiles.length >= 2 && animName.trim();

  const handleCreate = useCallback(async () => {
    if (!canCreate) return;
    setState('compiling'); setProgress(0); setError('');
    try {
      const animId = await saveAnimation(animName.trim(), frameFiles);

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
  }, [canCreate, animName, frameFiles, markerFile, onStart, isPublic]);

  const isWorking = ['compiling','uploading','finalizing'].includes(state);

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
          <div onClick={() => setMarkerSheet(true)}
            style={{ borderRadius:16, border:`2px dashed ${markerPreview ? TEAL+'66' : 'rgba(255,255,255,0.18)'}`,
              background: markerPreview ? 'rgba(0,201,167,0.05)' : 'rgba(255,255,255,0.03)',
              overflow:'hidden', cursor:'pointer', minHeight:120,
              display:'flex', alignItems:'center', justifyContent:'center' }}>
            {markerPreview ? (
              <img src={markerPreview} alt="Marker"
                style={{ width:'100%', maxHeight:180, objectFit:'contain', display:'block', padding:8 }} />
            ) : (
              <div style={{ textAlign:'center', padding:24 }}>
                <div style={{ fontSize:28, marginBottom:8 }}>🎯</div>
                <div style={{ fontSize:12, color:TEAL, fontWeight:700, fontFamily:FONT }}>
                  Tap to pick marker photo
                </div>
              </div>
            )}
          </div>
          {markerPreview && (
            <button onClick={() => setMarkerSheet(true)}
              style={{ marginTop:8, background:'transparent', border:'none',
                color:'rgba(255,255,255,0.45)', fontSize:11, fontFamily:FONT,
                cursor:'pointer', padding:0 }}>
              Change marker image
            </button>
          )}
        </div>

        {/* Animation frames */}
        <div style={{ marginBottom:24 }}>
          <div style={labelStyle}>Animation Frame Photos</div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', fontFamily:FONT, marginBottom:10 }}>
            Pick photos, a video, or a Memoera sample — they play as a slideshow when scanned
          </div>
          <div onClick={() => setFrameSheet(true)}
            style={{ borderRadius:16, border:`2px dashed ${frameFiles.length ? GOLD+'66' : 'rgba(255,255,255,0.18)'}`,
              background: frameFiles.length ? 'rgba(201,168,76,0.05)' : 'rgba(255,255,255,0.03)',
              cursor:'pointer', minHeight:100,
              display:'flex', alignItems:'center', justifyContent:'center',
              flexWrap:'wrap', gap:8, padding: frameFiles.length ? 10 : 0 }}>
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
              <div style={{ textAlign:'center', padding:24 }}>
                <div style={{ fontSize:28, marginBottom:8 }}>🎞️</div>
                <div style={{ fontSize:12, color:GOLD, fontWeight:700, fontFamily:FONT }}>
                  Tap to pick frames
                </div>
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
          <div style={stepStyle}>✨ &nbsp;The animation plays automatically — all {frameFiles.length || 'N'} frames</div>
          <div style={stepStyle}>👆 &nbsp;They can drag left/right to scrub through frames manually</div>
        </div>

        {/* Error */}
        {state === 'error' && (
          <div style={{ background:'rgba(220,50,50,0.12)', border:'1px solid rgba(220,50,50,0.35)',
            borderRadius:12, padding:'12px 16px', marginBottom:20,
            fontSize:12, color:'#E05555', fontFamily:FONT }}>
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

        {!markerFile && (
          <div style={{ textAlign:'center', fontSize:11, color:'rgba(255,255,255,0.3)',
            fontFamily:FONT, marginTop:12 }}>
            Pick a marker image and at least 2 frame photos to continue
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
    </div>
  );
}

const labelStyle = { fontSize:12, fontWeight:700, color:'rgba(255,255,255,0.6)',
  fontFamily:"Outfit, sans-serif", letterSpacing:'0.08em', marginBottom:8 };
const stepStyle  = { fontSize:12, color:'rgba(255,255,255,0.55)',
  fontFamily:"Outfit, sans-serif", lineHeight:1.9 };
