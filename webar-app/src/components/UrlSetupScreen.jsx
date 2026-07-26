import { useState, useCallback, useEffect, useRef } from 'react';
import { COMPILER_URL } from '../hooks/loadMindARCompiler.js';
import CameraCapture from './CameraCapture.jsx';
import UploadProgressOverlay from './UploadProgressOverlay.jsx';
import UploadDropZone from './UploadDropZone.jsx';
import { saveTargets, loadTargets } from '../hooks/useArStorage.js';
import { rebuildPublicMindInBackground } from '../utils/rebuildPublicMind.js';
import { assessMarkerQuality } from '../utils/assessMarkerQuality.js';
import { useLanguage } from '../context/LanguageContext.jsx';
import { T } from '../config/translations.js';
import { useTheme } from '../context/ThemeContext.jsx';

const ASPECT_MAP = { '16:9': 0.5625, '4:3': 0.75, '1:1': 1.0, '9:16': 1.7778 };

function emptyCard(absoluteNumber, imageFile = null, imagePreviewUrl = null) {
  return { label: `Target ${absoluteNumber}`, imageFile, imagePreviewUrl, urlLink: '' };
}

export default function UrlSetupScreen({ onStart, onBack, onSignOut, isPublic, sharedImageFile, sharedImagePreviewUrl, sharedLabel }) {
  const [cards, setCards] = useState(() => {
    const card = emptyCard(1, sharedImageFile, sharedImagePreviewUrl);
    if (sharedLabel) card.label = sharedLabel;
    return [card];
  });
  const [startIndex, setStartIndex] = useState(0);
  const [compileState, setCompileState] = useState('idle');
  const [compileProgress, setCompileProgress] = useState(0);
  const [compileError, setCompileError] = useState('');
  const [showValidation, setShowValidation] = useState(false);
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
  const canStart = cards.length > 0 && cards.every((c) => c.imageFile && c.urlLink.trim());

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

  const handleUrlChange = useCallback((index, value) => {
    setCards((prev) => prev.map((card, i) => i === index ? { ...card, urlLink: value } : card));
  }, []);

  const handleLabelChange = useCallback((index, value) => {
    setCards((prev) => prev.map((card, i) => i === index ? { ...card, label: value.trim() ? value : `Target ${startIndex + i + 1}` } : card));
  }, [startIndex]);

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
        targetType: 'url',
        urlLink: card.urlLink.trim(),
      }));

      setCompileState('uploading'); setCompileProgress(0);

      const freshImageBlobs = await Promise.all(
        cards.map(async (c) => {
          const buf = await c.imageFile.arrayBuffer();
          return new Blob([buf], { type: c.imageFile.type || 'image/jpeg' });
        })
      );

      await saveTargets(targetsMeta, mindBuffer, null, freshImageBlobs, (pct) => {
        setCompileProgress(pct);
      }, isPublic);

      setCompileState('finalizing'); setCompileProgress(0);

      // Use locally-compiled data instead of loadTargets() to avoid index conflicts
      // between public and private target batches.
      const localMindUrl = URL.createObjectURL(new Blob([mindBuffer], { type: 'application/octet-stream' }));
      const arTargets = targetsMeta.map((meta, i) => ({
        label: meta.label,
        targetIndex: i,
        planeWidth: meta.planeWidth,
        planeHeight: meta.planeHeight,
        planeOffsetY: meta.planeOffsetY,
        videoUrl: '',
        targetType: 'url',
        urlLink: meta.urlLink,
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


      <div style={styles.orb1} />
      <div style={styles.orb2} />

      {onBack && <button onClick={onBack} style={styles.backBtn}>← Back</button>}

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
          <UrlTargetCard
            key={index}
            index={index}
            card={card}
            showValidation={showValidation}
            onImageFile={(f) => handleImageFile(index, f)}
            onUrlChange={(v) => handleUrlChange(index, v)}
            onLabelChange={(v) => handleLabelChange(index, v)}
            onRemove={() => handleRemoveCard(index)}
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
          <p style={styles.validationHint}>Each target needs a marker image and a URL.</p>
        )}
        <button onClick={() => { if (!canStart) { setShowValidation(true); return; } handleStart(); }} disabled={isCompiling}
          style={{ ...styles.startButton, ...(isCompiling ? styles.startButtonDisabled : {}) }}>
          Upload &rarr;
        </button>
      </div>
    </div>
  );
}

function UrlTargetCard({ index, card, showValidation, onImageFile, onUrlChange, onLabelChange, onRemove }) {
  const imageMissing = showValidation && !card.imageFile;
  const urlMissing = showValidation && !card.urlLink.trim();
  const [showPicker, setShowPicker] = useState(false);

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
      <UploadDropZone
        title="Tap to upload"
        hint="JPG, PNG (Max 50MB)"
        error={imageMissing ? 'Image required' : ''}
        preview={card.imagePreviewUrl}
        fileName={card.imageFile?.name}
        onClick={() => setShowPicker(true)}
      />
      <p style={{ ...card_s.label, marginTop: 16 }}>URL / Link<span style={card_s.hint}> &mdash; opens when marker is scanned</span></p>
      <input
        type="url"
        placeholder="https://example.com"
        value={card.urlLink}
        onChange={(e) => onUrlChange(e.target.value)}
        style={{ ...card_s.urlInput, ...(urlMissing ? card_s.urlInputError : {}) }}
      />
      {urlMissing && <p style={card_s.fieldError}>URL is required</p>}

      <p style={{ ...card_s.label, marginTop: 16 }}>Title</p>
      <input
        value={/^Target \d+$/.test(card.label) ? '' : card.label}
        onChange={(e) => onLabelChange(e.target.value)}
        placeholder={`Target ${index + 1}`}
        maxLength={60}
        style={card_s.urlInput}
      />
    </div>
  );
}

const FONT = '"Outfit", -apple-system, BlinkMacSystemFont, sans-serif';
const TEAL = '#00C9A7';
const CYAN = '#00E5CC';
const BG = '#080C18';
const BORDER = 'rgba(0,201,167,0.28)';

const picker = {
  backdrop: { position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',backdropFilter:'blur(4px)',WebkitBackdropFilter:'blur(4px)',zIndex:1000 },
  sheet: { position:'fixed',bottom:0,left:0,right:0,background:'#0E1628',border:'1px solid rgba(0,201,167,0.2)',borderBottom:'none',borderRadius:'24px 24px 0 0',padding:'12px 20px 40px',zIndex:1001,display:'flex',flexDirection:'column',gap:10 },
  handle: { width:40,height:4,borderRadius:2,background:'rgba(255,255,255,0.2)',alignSelf:'center',marginBottom:8 },
  title: { fontSize:15,fontWeight:600,fontFamily:FONT,color:'rgba(255,255,255,0.7)',textAlign:'center',margin:'0 0 8px' },
  optionBtn: { display:'flex',alignItems:'center',gap:16,background:'rgba(0,201,167,0.06)',border:'1px solid rgba(0,201,167,0.2)',borderRadius:16,padding:'14px 18px',cursor:'pointer',textAlign:'left',width:'100%' },
  optionIcon: { fontSize:28,flexShrink:0 },
  optionLabel: { fontSize:15,fontWeight:600,fontFamily:FONT,color:'#fff',margin:0 },
  optionHint: { fontSize:12,fontFamily:FONT,color:'rgba(255,255,255,0.35)',margin:'2px 0 0' },
  cancelBtn: { marginTop:4,background:'transparent',border:'1px solid rgba(255,255,255,0.1)',borderRadius:16,padding:14,color:'rgba(255,255,255,0.4)',fontSize:15,fontFamily:FONT,cursor:'pointer',width:'100%' },
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
  backBtn: { position: 'absolute', top: 48, left: 16, zIndex: 2, background: 'rgba(0,201,167,0.08)', border: '1px solid rgba(0,201,167,0.25)', borderRadius: 20, color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 600, fontFamily: FONT, padding: '7px 16px', cursor: 'pointer' },
  header: { padding: '92px 24px 20px', flexShrink: 0, position: 'relative', zIndex: 1 },
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
  errorBox: { background: 'rgba(255,80,80,0.08)', border: '1px solid rgba(255,80,80,0.3)', borderRadius: 12, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, fontSize: 13, color: '#FF6B6B', fontFamily: FONT },
  errorDismiss: { background: 'transparent', border: 'none', color: '#FF6B6B', fontSize: 13, cursor: 'pointer', fontFamily: FONT, textDecoration: 'underline' },
  validationHint: { fontSize: 13, color: '#FF6B6B', fontFamily: FONT, margin: 0, textAlign: 'center' },
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
  zoneError: { borderColor: '#FF6B6B', background: 'rgba(255,80,80,0.05)' },
  zoneContent: { display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px' },
  zoneIcon: { fontSize: 20 },
  zoneText: { fontSize: 13, color: 'rgba(255,255,255,0.28)', fontFamily: FONT },
  previewRow: { display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '8px 4px' },
  preview: { width: 60, height: 60, objectFit: 'cover', borderRadius: 8, flexShrink: 0, border: `1px solid ${BORDER}` },
  fileName: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontFamily: FONT },
  changeLink: { fontSize: 12, color: TEAL, fontFamily: FONT },
  urlInput: { width: '100%', boxSizing: 'border-box', background: 'rgba(0,201,167,0.05)', border: `1.5px solid ${BORDER}`, borderRadius: 12, color: '#ffffff', fontSize: 14, fontFamily: FONT, padding: '14px 16px', outline: 'none' },
  urlInputError: { borderColor: '#FF6B6B', background: 'rgba(255,80,80,0.05)' },
  fieldError: { fontSize: 12, color: '#FF6B6B', fontFamily: FONT, margin: '4px 0 0' },
};
