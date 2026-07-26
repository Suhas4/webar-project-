import { useState, useCallback, useEffect } from 'react';
import { COMPILER_URL } from '../hooks/loadMindARCompiler.js';
import TargetCard from './TargetCard.jsx';
import UploadProgressOverlay from './UploadProgressOverlay.jsx';
import { saveTargets, loadTargets } from '../hooks/useArStorage.js';
import { rebuildPublicMindInBackground } from '../utils/rebuildPublicMind.js';
import { useLanguage } from '../context/LanguageContext.jsx';
import { T } from '../config/translations.js';
import { useTheme } from '../context/ThemeContext.jsx';
import { isImageOwnedByAnotherUser, checkImageModeration, extractVideoThumbnail } from '../utils/contentSafety.js';
import { assessMarkerQuality } from '../utils/assessMarkerQuality.js';
import { pingStreak } from '../utils/streak.js';


function emptyCard(absoluteNumber, imageFile = null, imagePreviewUrl = null) {
  return { label: `Target ${absoluteNumber}`, imageFile, imagePreviewUrl,
    videoFile: null, videoName: null, videoSize: null };
}

export default function SetupScreen({ onStart, onLaunchSaved, initialCards, onBack, onSignOut, user, isPublic = false, sharedImageFile, sharedImagePreviewUrl, sharedLabel }) {
  const [cards, setCards] = useState(() => {
    if (initialCards?.length) return initialCards;
    const card = emptyCard(1, sharedImageFile, sharedImagePreviewUrl);
    if (sharedLabel) card.label = sharedLabel;
    return [card];
  });
  const [startIndex, setStartIndex] = useState(0);
  const [compileState, setCompileState] = useState('idle');
  const [compileProgress, setCompileProgress] = useState(0);
  const [compileError, setCompileError] = useState('');
  const [showValidation, setShowValidation] = useState(false);
  const [moderationWarning, setModerationWarning] = useState(null); // { categories, resolve }
  const [qualityWarning, setQualityWarning] = useState(null); // { label, resolve }
  const { lang } = useLanguage();
  const tr = { ...T.en, ...(T[lang] || {}) };
  const { colors } = useTheme();

  // Fetch existing count to offset default labels (e.g. already have 3 → next is "Target 4")
  useEffect(() => {
    if (initialCards?.length) return;
    loadTargets().then(({ targets }) => {
      const count = targets ? targets.filter((t) => t.isPublic === isPublic).length : 0;
      setStartIndex(count);
      setCards((prev) => prev.map((card, i) => {
        if (!/^Target \d+$/.test(card.label)) return card;
        return { ...card, label: `Target ${count + i + 1}` };
      }));
    }).catch(() => {});
  }, [isPublic, initialCards]);

  const isCompiling = compileState === 'checking' || compileState === 'compiling' || compileState === 'saving' || compileState === 'uploading' || compileState === 'finalizing' || compileState === 'done';
  const canStart = cards.length > 0 && cards.every((c) => c.imageFile && c.videoFile);

  const handleCardChange = useCallback((index, patch) => {
    setCards((prev) => prev.map((card, i) => (i === index ? { ...card, ...patch } : card)));
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

  // Shows the "Are you sure?" dialog and resolves true/false based on the user's choice.
  const confirmIfFlagged = useCallback((categories) => {
    return new Promise((resolve) => setModerationWarning({ categories, resolve }));
  }, []);

  const confirmIfLowDetail = useCallback((label) => {
    return new Promise((resolve) => setQualityWarning({ label, resolve }));
  }, []);

  const handleStart = useCallback(async () => {
    if (!canStart) { setShowValidation(true); return; }
    setCompileState('checking'); setCompileProgress(0); setCompileError('');

    const userId = user?.email;
    for (const card of cards) {
      // Rule: one photo can only ever be paired with content from the account
      // that first uploaded it — block if another account already claimed it.
      if (await isImageOwnedByAnotherUser(card.imageFile, userId)) {
        setCompileState('error');
        setCompileError(`"${card.label}" photo is already registered to another account. Please sign in with the original account to add more content to this image, or choose a different photo.`);
        return;
      }

      // Rule: flag 18+/explicit/illegal content — ask for explicit confirmation.
      const imageCheck = await checkImageModeration(card.imageFile);
      if (imageCheck.flagged && !(await confirmIfFlagged(imageCheck.categories))) {
        setCompileState('idle');
        return;
      }

      // Flat/plain-color marker photos have too few distinctive features for
      // either scanning engine to recognize reliably — warn before committing
      // to a full compile + upload, but don't hard-block (the heuristic is a
      // cheap proxy, not the real corner-detection the engines actually use).
      const quality = await assessMarkerQuality(card.imageFile);
      if (quality?.isLowDetail && !(await confirmIfLowDetail(card.label))) {
        setCompileState('idle');
        return;
      }
      if (card.videoFile) {
        try {
          const thumb = await extractVideoThumbnail(card.videoFile);
          const videoCheck = await checkImageModeration(thumb);
          if (videoCheck.flagged && !(await confirmIfFlagged(videoCheck.categories))) {
            setCompileState('idle');
            return;
          }
        } catch { /* couldn't grab a thumbnail — skip moderation for this video rather than block the upload */ }
      }
    }

    setCompileState('compiling'); setCompileProgress(0);
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
        await import(/* @vite-ignore */ COMPILER_URL);
      }
      if (!window.MINDAR?.IMAGE?.Compiler) {
        throw new Error('MindAR Compiler failed to load. Check your internet connection and reload.');
      }
      const compiler = new window.MINDAR.IMAGE.Compiler();

      // Live progress fix: MindAR's compile callback runs synchronously on the
      // main thread, blocking React from painting. We yield to the browser on
      // each update using a Promise + setTimeout(0) so the ring actually animates.
      let lastPainted = -1;
      await compiler.compileImageTargets(imageElements, (progress) => {
        const pct = Math.min(100, Math.round(progress * 100));
        if (pct !== lastPainted) {
          lastPainted = pct;
          setCompileProgress(pct);
          // Yield to browser so it can paint the updated progress ring
          return new Promise((resolve) => setTimeout(resolve, 0));
        }
      });

      // Revoke fresh image URLs now that compilation is done
      freshImageUrls.forEach((url) => URL.revokeObjectURL(url));

      const mindBuffer = await compiler.exportData();
      const targetsMeta = cards.map((card) => ({
        label: card.label, planeWidth: 1,
        planeHeight: 0.5625, planeOffsetY: 0,
      }));
      setCompileState('uploading'); setCompileProgress(0);

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

      await saveTargets(targetsMeta, mindBuffer, freshVideoBlobs, freshImageBlobs, (pct) => {
        setCompileProgress(pct);
      }, isPublic);

      setCompileState('finalizing'); setCompileProgress(0);

      // Use locally-compiled data to launch AR immediately.
      // Calling loadTargets() here would return a mix of all public + private targets
      // from different upload sessions, causing index conflicts. Instead we use the
      // mind file we just compiled and the video blobs we already have in memory.
      const localMindUrl = URL.createObjectURL(new Blob([mindBuffer], { type: 'application/octet-stream' }));
      const arTargets = targetsMeta.map((meta, i) => ({
        label: meta.label,
        targetIndex: i,
        planeWidth: meta.planeWidth,
        planeHeight: meta.planeHeight,
        planeOffsetY: meta.planeOffsetY,
        videoUrl: URL.createObjectURL(freshVideoBlobs[i]),
        targetType: 'video',
        urlLink: '',
      }));
      // Brief "File Uploaded!" success animation before handing off to AR.
      setCompileState('done');
      pingStreak();
      await new Promise((resolve) => setTimeout(resolve, 1100));

      onStart({ targets: arTargets, mindFileUrl: localMindUrl });

      // After a public upload, rebuild the shared combined .mind in R2 so
      // future guest scans download one file instead of recompiling from scratch.
      if (isPublic) rebuildPublicMindInBackground();
    } catch (err) {
      setCompileState('error');
      const isNetworkFailure = err instanceof TypeError && /fetch/i.test(err.message || '');
      setCompileError(isNetworkFailure
        ? 'Could not reach the server — it may be waking up from sleep. Please wait a few seconds and tap Upload again.'
        : (err.message || 'Compilation failed. Please try again.'));
    }
  }, [cards, canStart, onStart, isPublic, user, confirmIfFlagged]);

  return (
    <div style={{ ...styles.screen, background: colors.bg }}>
      {isCompiling && <UploadProgressOverlay compileState={compileState} progress={compileProgress} />}

      {moderationWarning && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: '#0E1628', border: '1px solid rgba(220,50,50,0.4)', borderRadius: 18,
            padding: '28px 24px', maxWidth: 340, textAlign: 'center' }}>
            <div style={{ fontSize: 38, marginBottom: 10 }}>⚠️</div>
            <h3 style={{ color: '#fff', fontSize: 16, fontWeight: 700, margin: '0 0 10px' }}>Are you sure?</h3>
            <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, lineHeight: 1.6, margin: '0 0 20px' }}>
              This content may contain explicit, adult, or illegal material and could violate our
              platform guidelines. Uploading content like this may result in account suspension.
              Do you want to continue anyway?
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { moderationWarning.resolve(false); setModerationWarning(null); }}
                style={{ flex: 1, background: 'transparent', border: '1.5px solid rgba(255,255,255,0.25)',
                  borderRadius: 50, color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: 600,
                  padding: '11px 0', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={() => { moderationWarning.resolve(true); setModerationWarning(null); }}
                style={{ flex: 1, background: '#FF6B6B', border: 'none', borderRadius: 50,
                  color: '#fff', fontSize: 13, fontWeight: 700, padding: '11px 0', cursor: 'pointer' }}>
                Yes, Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {qualityWarning && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: '#0E1628', border: '1px solid rgba(201,168,76,0.4)', borderRadius: 18,
            padding: '28px 24px', maxWidth: 340, textAlign: 'center' }}>
            <div style={{ fontSize: 38, marginBottom: 10 }}>🖼️</div>
            <h3 style={{ color: '#fff', fontSize: 16, fontWeight: 700, margin: '0 0 10px' }}>This photo may scan unreliably</h3>
            <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, lineHeight: 1.6, margin: '0 0 20px' }}>
              "{qualityWarning.label}" looks fairly plain or low-contrast — flat logos and
              plain-color images give the scanner fewer distinctive details to lock onto.
              A busier photo with more texture, edges, or contrast usually scans more reliably.
              Continue with this photo anyway?
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { qualityWarning.resolve(false); setQualityWarning(null); }}
                style={{ flex: 1, background: 'transparent', border: '1.5px solid rgba(255,255,255,0.25)',
                  borderRadius: 50, color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: 600,
                  padding: '11px 0', cursor: 'pointer' }}>
                Choose Different Photo
              </button>
              <button onClick={() => { qualityWarning.resolve(true); setQualityWarning(null); }}
                style={{ flex: 1, background: '#C9A84C', border: 'none', borderRadius: 50,
                  color: '#040D0B', fontSize: 13, fontWeight: 700, padding: '11px 0', cursor: 'pointer' }}>
                Continue Anyway
              </button>
            </div>
          </div>
        </div>
      )}


      <div style={styles.orb1} />
      <div style={styles.orb2} />

      {onBack && <button onClick={onBack} style={styles.backBtn}>← Back</button>}

      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerRow}>
          <div>
              <img src="/logo.png" alt="Memoera" style={{ width: 130, objectFit: 'contain' }} />
            </div>
          {onSignOut && (
            <button onClick={onSignOut} style={styles.signOutBtn}>{tr.signOut}</button>
          )}
        </div>
        <div style={styles.divider} />
        <h1 style={{ ...styles.title, color: colors.text }}>{tr.uploadTitle}</h1>
        <p style={styles.subtitle}>
          {isPublic
            ? 'PUBLIC — your AR targets will be visible to all guests when they scan'
            : 'PRIVATE — only you can see these AR targets when you scan'}
        </p>
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
        {onLaunchSaved && compileState === 'idle' && (
          <button onClick={onLaunchSaved} style={styles.launchSavedButton}>
            Launch AR with saved files →
          </button>
        )}
        <button onClick={() => { if (!canStart) { setShowValidation(true); return; } handleStart(); }} disabled={isCompiling}
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
  backBtn: { position: 'absolute', top: 48, left: 16, zIndex: 2, background: 'rgba(0,201,167,0.08)', border: '1px solid rgba(0,201,167,0.25)', borderRadius: 20, color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 600, fontFamily: FONT, padding: '7px 16px', cursor: 'pointer' },
  header: { padding: '92px 24px 20px', flexShrink: 0, position: 'relative', zIndex: 1 },
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
    fontSize: 13, color: '#FF6B6B', fontFamily: FONT,
  },
  errorDismiss: {
    background: 'transparent', border: 'none', color: '#FF6B6B',
    fontSize: 13, cursor: 'pointer', fontFamily: FONT, flexShrink: 0, textDecoration: 'underline',
  },
  validationHint: { fontSize: 13, color: '#FF6B6B', fontFamily: FONT, margin: 0, textAlign: 'center' },
  startButton: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
    background: `linear-gradient(135deg, ${TEAL}, ${CYAN})`,
    border: 'none', borderRadius: 50, color: '#080C18',
    fontSize: 17, fontWeight: 700, fontFamily: FONT, padding: '16px 24px',
    cursor: 'pointer', letterSpacing: '0.05em',
    boxShadow: `0 4px 28px rgba(0,201,167,0.35)`, transition: 'opacity 0.15s',
  },
  startButtonDisabled: { opacity: 0.6, cursor: 'not-allowed', boxShadow: 'none' },
  launchSavedButton: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(0,201,167,0.1)', border: '1.5px solid rgba(0,201,167,0.4)',
    borderRadius: 50, color: '#00C9A7',
    fontSize: 15, fontWeight: 600, fontFamily: FONT, padding: '13px 24px',
    cursor: 'pointer', letterSpacing: '0.02em',
  },
};

const confirmStyles = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  box: { background: '#0E1628', border: '1px solid rgba(0,201,167,0.3)', borderRadius: 20, padding: '28px 24px', maxWidth: 320, width: '90%', display: 'flex', flexDirection: 'column', gap: 20 },
  text: { fontSize: 16, color: '#fff', fontFamily: FONT, textAlign: 'center', margin: 0 },
  btns: { display: 'flex', gap: 12 },
  cancel: { flex: 1, background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 50, color: 'rgba(255,255,255,0.6)', fontSize: 15, fontFamily: FONT, padding: '12px 0', cursor: 'pointer' },
  confirm: { flex: 1, background: `linear-gradient(135deg, ${TEAL}, ${CYAN})`, border: 'none', borderRadius: 50, color: BG, fontSize: 15, fontWeight: 700, fontFamily: FONT, padding: '12px 0', cursor: 'pointer' },
};
