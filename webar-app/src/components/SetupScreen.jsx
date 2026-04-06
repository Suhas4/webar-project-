import { useState, useCallback } from 'react';
import TargetCard from './TargetCard.jsx';
import UploadProgressOverlay from './UploadProgressOverlay.jsx';
import { saveTargets } from '../hooks/useArStorage.js';

const ASPECT_MAP = { '16:9': 0.5625, '4:3': 0.75, '1:1': 1.0, '9:16': 1.7778 };

function emptyCard(index) {
  return { label: `Target ${index + 1}`, imageFile: null, imagePreviewUrl: null,
    videoFile: null, videoName: null, videoSize: null, aspectRatio: '16:9' };
}

export default function SetupScreen({ onStart, initialCards, onSignOut, user }) {
  const [cards, setCards] = useState(() => initialCards?.length ? initialCards : [emptyCard(0)]);
  const [compileState, setCompileState] = useState('idle');
  const [compileProgress, setCompileProgress] = useState(0);
  const [compileError, setCompileError] = useState('');
  const [showValidation, setShowValidation] = useState(false);

  const isCompiling = compileState === 'compiling' || compileState === 'saving';
  const canStart = cards.length > 0 && cards.every((c) => c.imageFile && c.videoFile);

  const handleCardChange = useCallback((index, patch) => {
    setCards((prev) => prev.map((card, i) => (i === index ? { ...card, ...patch } : card)));
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
      // Bug 1 fix: Re-read each image file into a fresh blob URL right before use.
      // Stored File references can become unreadable after time (permission expiry).
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

      // Bug 3 fix: MindAR progress callback gives 0–1, multiply by 100 (not *100 again)
      await compiler.compileImageTargets(imageElements, (progress) => {
        setCompileProgress(Math.min(100, Math.round(progress * 100)));
      });

      // Revoke fresh image URLs now that compilation is done
      freshImageUrls.forEach((url) => URL.revokeObjectURL(url));

      const mindBuffer = await compiler.exportData();
      const targetsMeta = cards.map((card) => ({
        label: card.label, planeWidth: 1,
        planeHeight: ASPECT_MAP[card.aspectRatio] ?? 0.5625, planeOffsetY: 0,
      }));
      setCompileState('saving');

      // Bug 7 fix: Re-read video files into fresh blobs before saving to IndexedDB
      // so that multi-target File references don't go stale
      const freshVideoBlobs = await Promise.all(
        cards.map(async (c) => {
          const buf = await c.videoFile.arrayBuffer();
          return new Blob([buf], { type: c.videoFile.type || 'video/mp4' });
        })
      );
      const freshImageBlobs = await Promise.all(
        cards.map(async (c) => {
          const buf = await c.imageFile.arrayBuffer();
          return new Blob([buf], { type: c.imageFile.type || 'image/jpeg' });
        })
      );

      await saveTargets(targetsMeta, mindBuffer, freshVideoBlobs, freshImageBlobs);

      const mindBlob = new Blob([mindBuffer], { type: 'application/octet-stream' });
      const mindFileUrl = URL.createObjectURL(mindBlob);

      // Bug 7 fix: create video blob URLs from fresh blobs (not stale File refs)
      const targets = cards.map((card, i) => ({
        ...targetsMeta[i], targetIndex: i,
        videoUrl: URL.createObjectURL(freshVideoBlobs[i]),
      }));
      onStart({ targets, mindFileUrl });
    } catch (err) {
      console.error('[SetupScreen] Compilation failed:', err);
      setCompileState('error');
      setCompileError(err.message || 'Compilation failed. Please try again.');
    }
  }, [cards, canStart, onStart]);

  return (
    <div style={styles.screen}>
      {isCompiling && <UploadProgressOverlay compileState={compileState} progress={compileProgress} />}

      <div style={styles.orb1} />
      <div style={styles.orb2} />

      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerRow}>
          <div>
              <img src="/logo.png" alt="Memoera" style={{ width: 130, objectFit: 'contain' }} />
            </div>
          {onSignOut && (
            <button onClick={onSignOut} style={styles.signOutBtn}>Sign Out</button>
          )}
        </div>
        <div style={styles.divider} />
        <h1 style={styles.title}>Upload Your Files</h1>
        <p style={styles.subtitle}>Upload a marker image and a video for each AR target</p>
      </div>

      {/* Cards */}
      <div style={styles.cardList}>
        {cards.map((card, index) => (
          <TargetCard key={index} index={index} data={card}
            onChange={(patch) => handleCardChange(index, patch)}
            onRemove={() => handleRemoveCard(index)}
            showValidation={showValidation} />
        ))}
        <button onClick={handleAddCard} disabled={isCompiling}
          style={{ ...styles.addButton, ...(isCompiling ? styles.addButtonDisabled : {}) }}>
          <span style={{ fontSize: 18, lineHeight: 1 }}>+</span>
          Add Target
        </button>
      </div>

      {/* Bottom bar */}
      <div style={styles.bottomBar}>
        {compileState === 'error' && (
          <div style={styles.errorBox}>
            <span>⚠️ {compileError}</span>
            <button onClick={() => setCompileState('idle')} style={styles.errorDismiss}>Dismiss</button>
          </div>
        )}
        {showValidation && !canStart && compileState === 'idle' && (
          <p style={styles.validationHint}>Each target needs both a marker image and a video.</p>
        )}
        <button onClick={handleStart} disabled={isCompiling}
          style={{ ...styles.startButton, ...(isCompiling ? styles.startButtonDisabled : {}) }}>
          Upload →
        </button>
      </div>
    </div>
  );
}

const FONT   = '"Outfit", -apple-system, BlinkMacSystemFont, sans-serif';
const TEAL   = '#00C9A7';
const CYAN   = '#00E5CC';
const BG     = '#080C18';
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
  orb1: {
    position: 'fixed', top: -120, left: -80, width: 320, height: 320,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(0,201,167,0.2) 0%, transparent 70%)',
    pointerEvents: 'none', zIndex: 0,
  },
  orb2: {
    position: 'fixed', bottom: -100, right: -60, width: 280, height: 280,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(0,229,204,0.16) 0%, transparent 70%)',
    pointerEvents: 'none', zIndex: 0,
  },
  header: { padding: '52px 24px 20px', flexShrink: 0, position: 'relative', zIndex: 1 },
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2 },
  logoRow: { display: 'flex', alignItems: 'baseline' },
  logoText: { fontSize: 26, fontWeight: 700, fontFamily: FONT, color: '#ffffff', letterSpacing: '-0.5px' },
  logoAccent: { fontSize: 26, fontWeight: 300, fontFamily: FONT, color: TEAL, letterSpacing: '-0.5px', fontStyle: 'italic' },
  logoTagline: { fontSize: 10, fontFamily: FONT, color: 'rgba(255,255,255,0.35)', letterSpacing: '2px', textTransform: 'uppercase' },
  signOutBtn: {
    background: 'rgba(0,201,167,0.08)', border: '1px solid rgba(0,201,167,0.25)',
    borderRadius: 20, color: 'rgba(255,255,255,0.5)', fontSize: 12,
    fontFamily: FONT, fontWeight: 500, padding: '7px 14px', cursor: 'pointer',
    letterSpacing: '0.03em', marginTop: 4,
  },
  divider: {
    height: 1,
    background: `linear-gradient(90deg, ${TEAL}, ${CYAN}, transparent)`,
    margin: '16px 0', opacity: 0.4,
  },
  title: { fontSize: 24, fontWeight: 700, color: '#ffffff', fontFamily: FONT, margin: '0 0 6px', letterSpacing: '-0.3px' },
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.4)', fontFamily: FONT, margin: 0, lineHeight: 1.5 },
  cardList: {
    flex: 1, padding: '0 16px', display: 'flex', flexDirection: 'column',
    gap: 14, paddingBottom: 160, position: 'relative', zIndex: 1,
  },
  addButton: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    background: 'transparent', border: `1.5px dashed ${BORDER}`,
    borderRadius: 16, color: 'rgba(255,255,255,0.3)', fontSize: 14,
    fontWeight: 500, fontFamily: FONT, padding: '16px 24px', cursor: 'pointer',
  },
  addButtonDisabled: { opacity: 0.3, cursor: 'not-allowed' },
  bottomBar: {
    position: 'fixed', bottom: 0, left: 0, right: 0,
    background: `linear-gradient(to top, ${BG} 65%, transparent)`,
    padding: '16px 16px 36px', display: 'flex', flexDirection: 'column', gap: 10, zIndex: 10,
  },
  errorBox: {
    background: 'rgba(255,80,80,0.08)', border: '1px solid rgba(255,80,80,0.3)',
    borderRadius: 12, padding: '12px 16px', display: 'flex',
    justifyContent: 'space-between', alignItems: 'center', gap: 12,
    fontSize: 13, color: '#ff8080', fontFamily: FONT,
  },
  errorDismiss: {
    background: 'transparent', border: 'none', color: '#ff8080',
    fontSize: 13, cursor: 'pointer', fontFamily: FONT, flexShrink: 0, textDecoration: 'underline',
  },
  validationHint: { fontSize: 13, color: '#ff8080', fontFamily: FONT, margin: 0, textAlign: 'center' },
  startButton: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
    background: `linear-gradient(135deg, ${TEAL}, ${CYAN})`,
    border: 'none', borderRadius: 50, color: '#080C18',
    fontSize: 17, fontWeight: 700, fontFamily: FONT, padding: '16px 24px',
    cursor: 'pointer', letterSpacing: '0.05em',
    boxShadow: `0 4px 28px rgba(0,201,167,0.35)`, transition: 'opacity 0.15s',
  },
  startButtonDisabled: { opacity: 0.6, cursor: 'not-allowed', boxShadow: 'none' },
};
