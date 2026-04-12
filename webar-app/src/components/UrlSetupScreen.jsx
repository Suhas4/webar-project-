import { useState, useCallback } from 'react';
import UploadProgressOverlay from './UploadProgressOverlay.jsx';
import { saveTargets } from '../hooks/useArStorage.js';

const ASPECT_MAP = { '16:9': 0.5625, '4:3': 0.75, '1:1': 1.0, '9:16': 1.7778 };

function emptyCard(index) {
  return { label: `Target ${index + 1}`, imageFile: null, imagePreviewUrl: null, urlLink: '' };
}

export default function UrlSetupScreen({ onStart, onSignOut, isPublic }) {
  const [cards, setCards] = useState(() => [emptyCard(0)]);
  const [compileState, setCompileState] = useState('idle');
  const [compileProgress, setCompileProgress] = useState(0);
  const [compileError, setCompileError] = useState('');
  const [showValidation, setShowValidation] = useState(false);

  const isCompiling = ['compiling', 'saving', 'uploading', 'finalizing'].includes(compileState);
  const canStart = cards.length > 0 && cards.every((c) => c.imageFile && c.urlLink.trim());

  const handleImageFile = useCallback((index, file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Please upload a JPG, PNG, or WebP image.'); return; }
    if (file.size > 50 * 1024 * 1024) { alert('Image must be under 50 MB.'); return; }
    setCards((prev) => prev.map((card, i) => {
      if (i !== index) return card;
      if (card.imagePreviewUrl) URL.revokeObjectURL(card.imagePreviewUrl);
      return { ...card, imageFile: file, imagePreviewUrl: URL.createObjectURL(file) };
    }));
  }, []);

  const handleUrlChange = useCallback((index, value) => {
    setCards((prev) => prev.map((card, i) => i === index ? { ...card, urlLink: value } : card));
  }, []);

  const handleAddCard = useCallback(() => {
    setCards((prev) => [...prev, emptyCard(prev.length)]);
  }, []);

  const handleRemoveCard = useCallback((index) => {
    setCards((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.map((card, i) => ({ ...card, label: `Target ${i + 1}` }));
    });
  }, []);

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
        await import('https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image.prod.js');
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
    } catch (err) {
      console.error('[UrlSetupScreen] failed:', err);
      setCompileState('error');
      setCompileError(err.message || 'Upload failed. Please try again.');
    }
  }, [cards, canStart, onStart, isPublic]);

  return (
    <div style={styles.screen}>
      {isCompiling && <UploadProgressOverlay compileState={compileState} progress={compileProgress} />}

      <div style={styles.orb1} />
      <div style={styles.orb2} />

      <div style={styles.header}>
        <div style={styles.headerRow}>
          <h1 style={styles.bigTitle}>UPLOAD</h1>
          {onSignOut && (
            <button onClick={onSignOut} style={styles.signOutBtn}>Sign Out</button>
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
        <button onClick={handleStart} disabled={isCompiling}
          style={{ ...styles.startButton, ...(isCompiling ? styles.startButtonDisabled : {}) }}>
          Upload &rarr;
        </button>
      </div>
    </div>
  );
}

function UrlTargetCard({ index, card, showValidation, onImageFile, onUrlChange, onRemove }) {
  const imageMissing = showValidation && !card.imageFile;
  const urlMissing = showValidation && !card.urlLink.trim();

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
      <div
        style={{ ...card_s.zone, ...(imageMissing ? card_s.zoneError : {}), height: card.imagePreviewUrl ? 'auto' : 80, padding: card.imagePreviewUrl ? 8 : '0 16px' }}
        onClick={() => document.getElementById(`url-img-${index}`)?.click()}
        role="button" tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && document.getElementById(`url-img-${index}`)?.click()}>
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
      <input
        id={`url-img-${index}`}
        type="file" accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={(e) => onImageFile(e.target.files[0])}
        onClick={(e) => { e.target.value = ''; }}
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
    </div>
  );
}

const FONT = '"Outfit", -apple-system, BlinkMacSystemFont, sans-serif';
const TEAL = '#00C9A7';
const CYAN = '#00E5CC';
const BG = '#080C18';
const BORDER = 'rgba(0,201,167,0.28)';

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
  fileName: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontFamily: FONT },
  changeLink: { fontSize: 12, color: TEAL, fontFamily: FONT },
  urlInput: { width: '100%', boxSizing: 'border-box', background: 'rgba(0,201,167,0.05)', border: `1.5px solid ${BORDER}`, borderRadius: 12, color: '#ffffff', fontSize: 14, fontFamily: FONT, padding: '14px 16px', outline: 'none' },
  urlInputError: { borderColor: '#ff6060', background: 'rgba(255,80,80,0.05)' },
  fieldError: { fontSize: 12, color: '#ff8080', fontFamily: FONT, margin: '4px 0 0' },
};
