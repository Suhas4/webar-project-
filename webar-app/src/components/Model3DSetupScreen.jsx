import { useState, useCallback, useEffect, useRef } from 'react';
import { COMPILER_URL } from '../hooks/loadMindARCompiler.js';
import CameraCapture from './CameraCapture.jsx';
import UploadProgressOverlay from './UploadProgressOverlay.jsx';
import { saveTargets, loadTargets } from '../hooks/useArStorage.js';
import { rebuildPublicMindInBackground } from '../utils/rebuildPublicMind.js';
import { assessMarkerQuality } from '../utils/assessMarkerQuality.js';
import { useLanguage } from '../context/LanguageContext.jsx';
import { T } from '../config/translations.js';
import { useTheme } from '../context/ThemeContext.jsx';

const ASPECT_MAP = { '16:9': 0.5625, '4:3': 0.75, '1:1': 1.0, '9:16': 1.7778 };
const MODEL_EXTENSIONS = ['.glb', '.gltf', '.obj', '.fbx'];

// Entrance animations the uploaded 3D model can play in AR when it first appears
// after a successful scan. 'popIn' is the default — a friendly, safe-feeling
// overshoot scale that works for almost any model shape.
const MODEL_ANIMATIONS = [
  { id: 'popIn',   icon: '🎈', label: 'Bounce In',  desc: 'Scales up with a springy overshoot' },
  { id: 'fadeIn',  icon: '✨', label: 'Fade In',     desc: 'Gently fades into view' },
  { id: 'spinIn',  icon: '🌀', label: 'Spin In',     desc: 'Rotates a full turn while scaling up' },
  { id: 'riseUp',  icon: '⬆️', label: 'Rise Up',     desc: 'Slides up from below into place' },
  { id: 'zoomIn',  icon: '💫', label: 'Zoom In',     desc: 'Grows from a tiny point' },
  { id: 'rotate',  icon: '🔄', label: 'Auto-Rotate', desc: 'Keeps slowly spinning in place' },
  { id: 'float',   icon: '🌊', label: 'Float',       desc: 'Gentle continuous up-down bob' },
];

function emptyCard(absoluteNumber) {
  return {
    label: `Target ${absoluteNumber}`, imageFile: null, imagePreviewUrl: null,
    glbFile: null, glbName: '', animationEffect: 'popIn',
  };
}

function isModelFile(file) {
  const name = (file?.name || '').toLowerCase();
  return MODEL_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export default function Model3DSetupScreen({ onStart, onSignOut, isPublic }) {
  const [cards, setCards] = useState(() => [emptyCard(1)]);
  const [startIndex, setStartIndex] = useState(0);
  const [compileState, setCompileState] = useState('idle');
  const [compileProgress, setCompileProgress] = useState(0);
  const [compileError, setCompileError] = useState('');
  const [showValidation, setShowValidation] = useState(false);
  const [celebrateIndex, setCelebrateIndex] = useState(null);
  const { lang } = useLanguage();
  const tr = { ...T.en, ...(T[lang] || {}) };
  const { colors } = useTheme();

  // Offset default labels by existing target count for this visibility type
  useEffect(() => {
    loadTargets().then(({ targets }) => {
      const count = targets ? targets.filter((t) => t.isPublic === isPublic).length : 0;
      setStartIndex(count);
      setCards((prev) => prev.map((card, i) => {
        if (!/^Target \d+$/.test(card.label)) return card;
        return { ...card, label: `Target ${count + i + 1}` };
      }));
    }).catch(() => {});
  }, [isPublic]);

  const isCompiling = ['compiling', 'saving', 'uploading', 'finalizing'].includes(compileState);
  const canStart = cards.length > 0 && cards.every((c) => c.imageFile && c.glbFile);

  const handleImageFile = useCallback(async (index, file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Please upload a JPG, PNG, or WebP image.'); return; }
    if (file.size > 50 * 1024 * 1024) { alert('Image must be under 50 MB.'); return; }
    const quality = await assessMarkerQuality(file);
    if (quality?.isLowDetail && !window.confirm(
      'This photo looks fairly plain or low-contrast — flat logos and plain-color images give the scanner fewer distinctive details to lock onto, and may scan unreliably. Continue with this photo anyway?'
    )) return;
    setCards((prev) => prev.map((card, i) => {
      if (i !== index) return card;
      if (card.imagePreviewUrl) URL.revokeObjectURL(card.imagePreviewUrl);
      return { ...card, imageFile: file, imagePreviewUrl: URL.createObjectURL(file) };
    }));
  }, []);

  const handleGlbFile = useCallback((index, file) => {
    if (!file) return;
    if (!isModelFile(file)) { alert('Please upload a .glb, .gltf, .obj, or .fbx 3D model file.'); return; }
    if (file.size > 100 * 1024 * 1024) { alert('3D model must be under 100 MB.'); return; }
    setCards((prev) => prev.map((card, i) => i === index ? { ...card, glbFile: file, glbName: file.name } : card));
    setCelebrateIndex(index);
  }, []);

  const handleSetAnimation = useCallback((index, effectId) => {
    setCards((prev) => prev.map((card, i) => i === index ? { ...card, animationEffect: effectId } : card));
  }, []);

  const handleAddCard = useCallback(() => {
    setCards((prev) => [...prev, emptyCard(startIndex + prev.length + 1)]);
  }, [startIndex]);

  const handleRemoveCard = useCallback((index) => {
    setCards((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.map((card, i) => {
        if (!/^Target \d+$/.test(card.label)) return card;
        return { ...card, label: `Target ${startIndex + i + 1}` };
      });
    });
  }, [startIndex]);

  const handleStart = useCallback(async () => {
    if (!canStart) { setShowValidation(true); return; }
    setCompileState('compiling'); setCompileProgress(0); setCompileError('');
    try {
      const freshImageUrls = await Promise.all(
        cards.map(async (card) => {
          const buf = await card.imageFile.arrayBuffer();
          const blob = new Blob([buf], { type: card.imageFile.type || 'image/jpeg' });
          return URL.createObjectURL(blob);
        })
      );

      const imageElements = await Promise.all(
        freshImageUrls.map((url, i) => new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error(`Failed to load image: ${cards[i].imageFile.name}`));
          img.src = url;
        }))
      );

      if (!window.MINDAR?.IMAGE?.Compiler) {
        await import(/* @vite-ignore */ COMPILER_URL);
      }
      if (!window.MINDAR?.IMAGE?.Compiler) {
        throw new Error('MindAR Compiler failed to load. Check your internet connection and reload.');
      }
      const compiler = new window.MINDAR.IMAGE.Compiler();

      let lastPainted = -1;
      await compiler.compileImageTargets(imageElements, (progress) => {
        const pct = Math.min(100, Math.round(progress * 100));
        if (pct !== lastPainted) {
          lastPainted = pct;
          setCompileProgress(pct);
          return new Promise((resolve) => setTimeout(resolve, 0));
        }
      });

      freshImageUrls.forEach((url) => URL.revokeObjectURL(url));

      const mindBuffer = await compiler.exportData();
      const targetsMeta = cards.map((card) => ({
        label: card.label,
        planeWidth: 1,
        planeHeight: ASPECT_MAP['16:9'],
        planeOffsetY: 0,
        targetType: 'glb',
        urlLink: '',
        animationEffect: card.animationEffect || 'popIn',
      }));

      setCompileState('uploading'); setCompileProgress(0);

      const freshImageBlobs = await Promise.all(
        cards.map(async (c) => {
          const buf = await c.imageFile.arrayBuffer();
          return new Blob([buf], { type: c.imageFile.type || 'image/jpeg' });
        })
      );

      const glbBlobs = cards.map((c) => {
        const blob = new Blob([c.glbFile], { type: c.glbFile.type || 'application/octet-stream' });
        blob.name = c.glbFile.name;
        return blob;
      });

      await saveTargets(targetsMeta, mindBuffer, null, freshImageBlobs, (pct) => {
        setCompileProgress(pct);
      }, isPublic, glbBlobs);

      setCompileState('finalizing'); setCompileProgress(0);

      // Use locally-compiled data + local model object URLs instead of loadTargets()
      // to avoid index conflicts between public and private target batches.
      const localMindUrl = URL.createObjectURL(new Blob([mindBuffer], { type: 'application/octet-stream' }));
      const arTargets = targetsMeta.map((meta, i) => ({
        label: meta.label,
        targetIndex: i,
        planeWidth: meta.planeWidth,
        planeHeight: meta.planeHeight,
        planeOffsetY: meta.planeOffsetY,
        videoUrl: '',
        targetType: 'glb',
        urlLink: URL.createObjectURL(cards[i].glbFile),
        animationEffect: meta.animationEffect,
      }));
      onStart({ targets: arTargets, mindFileUrl: localMindUrl });

      if (isPublic) rebuildPublicMindInBackground();
    } catch (err) {
      setCompileState('error');
      setCompileError(err.message || 'Upload failed. Please try again.');
    }
  }, [cards, canStart, onStart, isPublic]);

  return (
    <div style={{ ...styles.screen, background: colors.bg }}>
      {isCompiling && <UploadProgressOverlay compileState={compileState} progress={compileProgress} />}
      {celebrateIndex !== null && (
        <ModelUploadCelebration onDone={() => setCelebrateIndex(null)} />
      )}

      <div style={styles.orb1} />
      <div style={styles.orb2} />

      <div style={styles.header}>
        <div style={styles.headerRow}>
          <h1 style={styles.bigTitle}>UPLOAD</h1>
          {onSignOut && (
            <button onClick={onSignOut} style={styles.signOutBtn}>{tr.signOut}</button>
          )}
        </div>
        <div style={styles.visibilityBadge}>
          <span style={styles.visibilityDot} />
          <span style={styles.visibilityText}>{isPublic ? 'PUBLIC — visible to all scanners' : 'PRIVATE — only you can see this'}</span>
        </div>
      </div>

      <div style={styles.cardList}>
        {cards.map((card, index) => (
          <ModelTargetCard
            key={index}
            index={index}
            card={card}
            showValidation={showValidation}
            onImageFile={(f) => handleImageFile(index, f)}
            onGlbFile={(f) => handleGlbFile(index, f)}
            onRemove={() => handleRemoveCard(index)}
            onSetAnimation={(effectId) => handleSetAnimation(index, effectId)}
          />
        ))}
        <button onClick={handleAddCard} disabled={isCompiling}
          style={{ ...styles.addButton, ...(isCompiling ? styles.addButtonDisabled : {}) }}>
          <span style={{ fontSize: 18, lineHeight: 1 }}>+</span>
          Add Another Target
        </button>
      </div>

      <div style={styles.bottomBar}>
        {compileState === 'error' && (
          <div style={styles.errorBox}>
            <span>&#9888; {compileError}</span>
            <button onClick={() => setCompileState('idle')} style={styles.errorDismiss}>Dismiss</button>
          </div>
        )}
        {showValidation && !canStart && compileState === 'idle' && (
          <p style={styles.validationHint}>Each target needs a marker image and a 3D model file.</p>
        )}
        <button onClick={() => { if (!canStart) { setShowValidation(true); return; } handleStart(); }} disabled={isCompiling}
          style={{ ...styles.startButton, ...(isCompiling ? styles.startButtonDisabled : {}) }}>
          Upload &rarr;
        </button>
      </div>
    </div>
  );
}

function ModelTargetCard({ index, card, showValidation, onImageFile, onGlbFile, onRemove, onSetAnimation }) {
  const imageMissing = showValidation && !card.imageFile;
  const glbMissing = showValidation && !card.glbFile;
  const [showPicker, setShowPicker] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const glbInputRef = useRef(null);

  return (
    <div style={card_s.card}>
      <div style={card_s.cardTopAccent} />
      <div style={card_s.cardHeader}>
        <div style={card_s.titleRow}>
          <div style={card_s.badge}>{index + 1}</div>
          <span style={card_s.title}>Target {index + 1}</span>
        </div>
        <button onClick={onRemove} style={card_s.removeBtn}>&times;</button>
      </div>

      <p style={card_s.label}>Marker Image<span style={card_s.hint}> &mdash; the image your camera will detect</span></p>
      {showPicker && (
        <CameraCapture
          onCapture={(file) => { setShowPicker(false); onImageFile(file); }}
          onClose={() => setShowPicker(false)}
        />
      )}
      <div
        style={{ ...card_s.zone, ...(imageMissing ? card_s.zoneError : {}), height: card.imagePreviewUrl ? 'auto' : 80, padding: card.imagePreviewUrl ? 8 : '0 16px' }}
        onClick={() => setShowPicker(true)}
        role="button" tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setShowPicker(true)}>
        {card.imagePreviewUrl ? (
          <div style={card_s.previewRow}>
            <img src={card.imagePreviewUrl} alt="Marker" style={card_s.preview} />
            <div>
              <span style={card_s.fileName}>{card.imageFile?.name}</span>
              <br /><span style={card_s.changeLink}>Tap to change</span>
            </div>
          </div>
        ) : (
          <div style={card_s.zoneContent}>
            <span style={card_s.zoneIcon}>&#128444;</span>
            <span style={card_s.zoneText}>{imageMissing ? 'Image required' : 'Tap to select image'}</span>
          </div>
        )}
      </div>

      <p style={{ ...card_s.label, marginTop: 16 }}>3D Model<span style={card_s.hint}> &mdash; .glb, .gltf, .obj, or .fbx file shown when marker is scanned</span></p>
      <input
        ref={glbInputRef}
        type="file"
        accept="*/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          setShowModelPicker(false);
          const file = e.target.files?.[0] || null;
          e.target.value = '';
          if (file && !/\.(glb|gltf|obj|fbx)$/i.test(file.name)) {
            window.alert('Please select a .glb, .gltf, .obj, or .fbx file.');
            return;
          }
          onGlbFile(file);
        }}
        onClick={(e) => { e.target.value = ''; }}
      />
      {showModelPicker && (
        <>
          <div style={picker_s.backdrop} onClick={() => setShowModelPicker(false)} />
          <div style={picker_s.sheet}>
            <div style={picker_s.handle} />
            <p style={picker_s.title}>Select 3D Model</p>
            <button style={picker_s.optionBtn} onClick={() => glbInputRef.current?.click()}>
              <span style={picker_s.icon}>ðŸ“</span>
              <div>
                <p style={picker_s.label}>Phone Storage / Internal Storage</p>
                <p style={picker_s.hint}>Browse your device storage for a .glb, .gltf, .obj, or .fbx file</p>
              </div>
            </button>
            <button style={picker_s.cancelBtn} onClick={() => setShowModelPicker(false)}>Cancel</button>
          </div>
        </>
      )}
      <div
        style={{ ...card_s.zone, ...(glbMissing ? card_s.zoneError : {}), height: card.glbName ? 'auto' : 80, padding: card.glbName ? 8 : '0 16px' }}
        onClick={() => setShowModelPicker(true)}
        role="button" tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setShowModelPicker(true)}>
        {card.glbName ? (
          <div style={card_s.previewRow}>
            <div style={card_s.modelIconBox}>&#129518;</div>
            <div>
              <span style={card_s.fileName}>{card.glbName}</span>
              <br /><span style={card_s.changeLink}>Tap to change</span>
            </div>
          </div>
        ) : (
          <div style={card_s.zoneContent}>
            <span style={card_s.zoneIcon}>&#129518;</span>
            <span style={card_s.zoneText}>{glbMissing ? '3D model required' : 'Tap to select .glb / .gltf / .obj / .fbx'}</span>
          </div>
        )}
      </div>
      {glbMissing && <p style={card_s.fieldError}>3D model file is required</p>}

      {card.glbName && (
        <>
          <p style={{ ...card_s.label, marginTop: 16 }}>
            Entrance Animation<span style={card_s.hint}> &mdash; how it appears when scanned</span>
          </p>
          <div style={card_s.animGrid}>
            {MODEL_ANIMATIONS.map((a) => (
              <button
                key={a.id}
                onClick={() => onSetAnimation(a.id)}
                title={a.desc}
                style={{
                  ...card_s.animChip,
                  ...(card.animationEffect === a.id ? card_s.animChipActive : {}),
                }}>
                <span style={card_s.animIcon}>{a.icon}</span>
                <span style={card_s.animLabel}>{a.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Celebratory full-screen popup shown the moment a .glb/.gltf/.obj/.fbx upload
// succeeds — a quick, delightful confirmation before the user moves on to
// picking how the model should animate in. Auto-dismisses itself.
function ModelUploadCelebration({ onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1600);
    return () => clearTimeout(t);
  }, [onDone]);

  const particles = Array.from({ length: 10 });

  return (
    <div style={celebrate_s.overlay} onClick={onDone}>
      <style>{`
        @keyframes mc-pop   { 0%{transform:scale(0.3);opacity:0} 60%{transform:scale(1.15);opacity:1} 100%{transform:scale(1);opacity:1} }
        @keyframes mc-ring  { 0%{transform:scale(0.6);opacity:0.8} 100%{transform:scale(2.2);opacity:0} }
        @keyframes mc-burst { 0%{transform:translate(0,0) scale(1);opacity:1} 100%{transform:translate(var(--tx),var(--ty)) scale(0);opacity:0} }
      `}</style>
      <div style={celebrate_s.center}>
        <div style={celebrate_s.ringWrap}>
          <div style={{ ...celebrate_s.ring, animation: 'mc-ring 1s ease-out' }} />
          <div style={{ ...celebrate_s.ring, animation: 'mc-ring 1s ease-out 0.15s' }} />
          <div style={{ ...celebrate_s.badge, animation: 'mc-pop 0.5s cubic-bezier(.34,1.56,.64,1) both' }}>
            🧊
          </div>
          {particles.map((_, i) => {
            const angle = (i / particles.length) * Math.PI * 2;
            const dist = 70 + (i % 3) * 20;
            return (
              <span key={i} style={{
                ...celebrate_s.particle,
                '--tx': `${Math.cos(angle) * dist}px`,
                '--ty': `${Math.sin(angle) * dist}px`,
                animation: `mc-burst ${0.7 + (i % 3) * 0.15}s ease-out both`,
              }}>{['✨', '🎉', '💫'][i % 3]}</span>
            );
          })}
        </div>
        <p style={celebrate_s.text}>3D Model Added!</p>
        <p style={celebrate_s.sub}>Now pick how it animates in ↓</p>
      </div>
    </div>
  );
}

const FONT = '"Outfit", -apple-system, BlinkMacSystemFont, sans-serif';
const TEAL = '#00C9A7';
const CYAN = '#00E5CC';
const BG = '#080C18';
const BORDER = 'rgba(0,201,167,0.28)';

const picker_s = {
  backdrop: { position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',backdropFilter:'blur(4px)',WebkitBackdropFilter:'blur(4px)',zIndex:2000 },
  sheet:    { position:'fixed',bottom:0,left:0,right:0,background:'#0E1628',border:'1px solid rgba(0,201,167,0.2)',borderBottom:'none',borderRadius:'24px 24px 0 0',padding:'12px 20px 48px',zIndex:2001,display:'flex',flexDirection:'column',gap:10 },
  handle:   { width:40,height:4,borderRadius:2,background:'rgba(255,255,255,0.2)',alignSelf:'center',marginBottom:8 },
  title:    { fontSize:15,fontWeight:600,fontFamily:FONT,color:'rgba(255,255,255,0.7)',textAlign:'center',margin:'0 0 8px' },
  optionBtn:{ display:'flex',alignItems:'center',gap:16,background:'rgba(0,201,167,0.06)',border:'1px solid rgba(0,201,167,0.2)',borderRadius:16,padding:'14px 18px',cursor:'pointer',textAlign:'left',width:'100%' },
  icon:     { fontSize:28,flexShrink:0 },
  label:    { fontSize:15,fontWeight:600,fontFamily:FONT,color:'#fff',margin:0 },
  hint:     { fontSize:12,fontFamily:FONT,color:'rgba(255,255,255,0.35)',margin:'2px 0 0' },
  cancelBtn:{ marginTop:4,background:'transparent',border:'1px solid rgba(255,255,255,0.1)',borderRadius:16,padding:14,color:'rgba(255,255,255,0.4)',fontSize:15,fontFamily:FONT,cursor:'pointer',width:'100%' },
};

const styles = {
  screen: {
    position: 'fixed', inset: 0,
    background: `radial-gradient(ellipse at 20% 20%, rgba(0,201,167,0.14) 0%, transparent 60%),
                 radial-gradient(ellipse at 80% 80%, rgba(0,229,204,0.1) 0%, transparent 60%),
                 ${BG}`,
    display: 'flex', flexDirection: 'column',
    overflowY: 'auto', WebkitOverflowScrolling: 'touch',
  },
  orb1: { position: 'fixed', top: -120, left: -80, width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,201,167,0.2) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 },
  orb2: { position: 'fixed', bottom: -100, right: -60, width: 280, height: 280, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,229,204,0.16) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 },
  header: { padding: '52px 24px 20px', flexShrink: 0, position: 'relative', zIndex: 1 },
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  bigTitle: { fontSize: 32, fontWeight: 700, color: '#ffffff', fontFamily: FONT, margin: 0, letterSpacing: '0.06em' },
  signOutBtn: { background: 'rgba(0,201,167,0.08)', border: '1px solid rgba(0,201,167,0.25)', borderRadius: 20, color: 'rgba(255,255,255,0.5)', fontSize: 12, fontFamily: FONT, fontWeight: 500, padding: '7px 14px', cursor: 'pointer' },
  visibilityBadge: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 },
  visibilityDot: { width: 8, height: 8, borderRadius: '50%', background: TEAL, flexShrink: 0 },
  visibilityText: { fontSize: 12, color: 'rgba(255,255,255,0.45)', fontFamily: FONT, letterSpacing: '0.04em' },
  cardList: { flex: 1, padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 140, position: 'relative', zIndex: 1 },
  addButton: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'transparent', border: `1.5px dashed ${BORDER}`, borderRadius: 16, color: 'rgba(255,255,255,0.3)', fontSize: 14, fontWeight: 500, fontFamily: FONT, padding: '16px 24px', cursor: 'pointer' },
  addButtonDisabled: { opacity: 0.3, cursor: 'not-allowed' },
  bottomBar: { position: 'fixed', bottom: 0, left: 0, right: 0, background: `linear-gradient(to top, ${BG} 65%, transparent)`, padding: '16px 16px 36px', display: 'flex', flexDirection: 'column', gap: 10, zIndex: 10 },
  errorBox: { background: 'rgba(255,80,80,0.08)', border: '1px solid rgba(255,80,80,0.3)', borderRadius: 12, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, fontSize: 13, color: '#ff8080', fontFamily: FONT },
  errorDismiss: { background: 'transparent', border: 'none', color: '#ff8080', fontSize: 13, cursor: 'pointer', fontFamily: FONT, textDecoration: 'underline' },
  validationHint: { fontSize: 13, color: '#ff8080', fontFamily: FONT, margin: 0, textAlign: 'center' },
  startButton: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, background: `linear-gradient(135deg, ${TEAL}, ${CYAN})`, border: 'none', borderRadius: 50, color: '#080C18', fontSize: 17, fontWeight: 700, fontFamily: FONT, padding: '16px 24px', cursor: 'pointer', letterSpacing: '0.05em', boxShadow: `0 4px 28px rgba(0,201,167,0.35)` },
  startButtonDisabled: { opacity: 0.6, cursor: 'not-allowed', boxShadow: 'none' },
};

const card_s = {
  card: { background: 'rgba(0,201,167,0.04)', border: `1px solid ${BORDER}`, borderRadius: 18, padding: '0 20px 24px', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' },
  cardTopAccent: { height: 2, background: `linear-gradient(90deg, ${TEAL}, ${CYAN})`, marginLeft: -20, marginRight: -20, marginBottom: 18, borderRadius: '18px 18px 0 0' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  titleRow: { display: 'flex', alignItems: 'center', gap: 10 },
  badge: { width: 26, height: 26, borderRadius: '50%', background: `linear-gradient(135deg, ${TEAL}, ${CYAN})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#080C18', fontFamily: FONT },
  title: { fontSize: 15, fontWeight: 600, color: '#ffffff', fontFamily: FONT },
  removeBtn: { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'rgba(255,255,255,0.4)', fontSize: 13, width: 30, height: 30, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT },
  label: { fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.55)', fontFamily: FONT, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' },
  hint: { fontSize: 11, fontWeight: 400, color: 'rgba(255,255,255,0.28)', fontFamily: FONT, textTransform: 'none', letterSpacing: 0 },
  zone: { border: `1.5px dashed ${BORDER}`, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'rgba(0,201,167,0.02)', minHeight: 80, overflow: 'hidden' },
  zoneError: { borderColor: '#ff6060', background: 'rgba(255,80,80,0.05)' },
  zoneContent: { display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px' },
  zoneIcon: { fontSize: 20 },
  zoneText: { fontSize: 13, color: 'rgba(255,255,255,0.28)', fontFamily: FONT },
  previewRow: { display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '8px 4px' },
  preview: { width: 60, height: 60, objectFit: 'cover', borderRadius: 8, flexShrink: 0, border: `1px solid ${BORDER}` },
  modelIconBox: { width: 60, height: 60, borderRadius: 8, flexShrink: 0, border: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, background: 'rgba(0,201,167,0.06)' },
  fileName: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontFamily: FONT },
  changeLink: { fontSize: 12, color: TEAL, fontFamily: FONT },
  fieldError: { fontSize: 12, color: '#ff8080', fontFamily: FONT, margin: '4px 0 0' },
  animGrid: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  animChip: {
    display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
    background: 'rgba(0,201,167,0.04)', border: `1px solid ${BORDER}`, borderRadius: 20,
    padding: '7px 12px', color: 'rgba(255,255,255,0.6)', fontSize: 12, fontFamily: FONT,
    transition: 'border-color 0.15s, background 0.15s, color 0.15s',
  },
  animChipActive: {
    background: 'rgba(0,201,167,0.16)', border: `1px solid ${TEAL}`, color: TEAL, fontWeight: 600,
  },
  animIcon: { fontSize: 14 },
  animLabel: {},
};

const celebrate_s = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 3000,
    background: 'rgba(4,10,15,0.88)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  center: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
  ringWrap: { position: 'relative', width: 120, height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute', inset: 0, borderRadius: '50%',
    border: `2px solid ${TEAL}`, pointerEvents: 'none',
  },
  badge: {
    width: 84, height: 84, borderRadius: '50%',
    background: `linear-gradient(135deg, ${TEAL}, #00E5CC)`,
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 38,
    boxShadow: `0 8px 30px rgba(0,201,167,0.5)`,
  },
  particle: { position: 'absolute', fontSize: 18, left: '50%', top: '50%' },
  text: { fontSize: 19, fontWeight: 700, color: '#fff', fontFamily: FONT, margin: '18px 0 2px' },
  sub: { fontSize: 13, color: 'rgba(255,255,255,0.5)', fontFamily: FONT, margin: 0 },
};
