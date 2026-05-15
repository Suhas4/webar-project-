import { useState, useEffect, useRef } from 'react';
import { loadTargets, loadPublicTargets } from '../hooks/useArStorage.js';
import { getCachedUserMind, setCachedUserMind } from '../hooks/useMindCache.js';
import { useLanguage } from '../context/LanguageContext.jsx';
import { T } from '../config/translations.js';
import { useTheme } from '../context/ThemeContext.jsx';

// Session-level cache
let _cachedUserMind = null;
export function invalidateUserCache() { _cachedUserMind = null; }

const FONT = "'Outfit', -apple-system, BlinkMacSystemFont, sans-serif";

export default function UserScanScreen({ onReady, onBack }) {
  const [phase, setPhase] = useState('fetching');
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  const cancelledRef = useRef(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const { lang } = useLanguage();
  const tr = T[lang] || T.en;
  const { colors } = useTheme();

  // Open camera immediately
  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) return;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCameraReady(true);
      })
      .catch(() => {});
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  // Compilation pipeline â€” runs while camera is already showing
  useEffect(() => {
    cancelledRef.current = false;
    let mindBlobUrl = null;
    let blobHandedOff = false;

    async function prepare() {
      try {
        setPhase('fetching');

        const [ownResult, publicTargets] = await Promise.all([
          loadTargets(),
          loadPublicTargets(),
        ]);
        if (cancelledRef.current) return;

        // Merge: user's own first, then public from others (dedup by imageUrl)
        const merged = [];
        const seen = new Set();

        if (ownResult.hasData && ownResult.targets) {
          for (const t of ownResult.targets) {
            const imgUrl = t._imagePreviewUrl;
            if (imgUrl && !seen.has(imgUrl)) {
              seen.add(imgUrl);
              merged.push({
                imageUrl: imgUrl,
                videoUrl: t.videoUrl || '',
                targetType: t.targetType || 'video',
                urlLink: t.urlLink || '',
                label: t.label,
                planeWidth: t.planeWidth,
                planeHeight: t.planeHeight,
                planeOffsetY: t.planeOffsetY,
              });
            }
          }
        }
        for (const t of publicTargets) {
          if (t.imageUrl && !seen.has(t.imageUrl)) {
            seen.add(t.imageUrl);
            merged.push(t);
          }
        }

        if (merged.length === 0) {
          setErrorMsg('No AR targets found. Upload your first target using the Upload button!');
          setPhase('error');
          return;
        }

        const fingerprint = merged.map((t) => t.imageUrl).sort().join('|');

        // 1. Session cache
        if (_cachedUserMind?.key === fingerprint) {
          blobHandedOff = true;
          onReady({ targets: _cachedUserMind.arTargets, mindFileUrl: _cachedUserMind.mindBlobUrl });
          return;
        }

        // 2. IndexedDB cache
        const idbHit = await getCachedUserMind(fingerprint);
        if (idbHit && !cancelledRef.current) {
          mindBlobUrl = URL.createObjectURL(
            new Blob([idbHit.mindBuffer], { type: 'application/octet-stream' })
          );
          _cachedUserMind = { key: fingerprint, mindBlobUrl, arTargets: idbHit.arTargets };
          blobHandedOff = true;
          onReady({ targets: idbHit.arTargets, mindFileUrl: mindBlobUrl });
          return;
        }
        if (cancelledRef.current) return;

        setPhase('compiling');

        // 3. Compile from scratch
        const imageElements = await Promise.all(
          merged.map((t, i) => new Promise((resolve, reject) => {
            if (!t.imageUrl) { reject(new Error('Target ' + (i + 1) + ' missing image')); return; }
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Failed to load marker image ' + (i + 1)));
            img.src = t.imageUrl;
          }))
        );
        if (cancelledRef.current) return;

        if (!window.MINDAR?.IMAGE?.Compiler) {
          await import('https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image.prod.js');
        }
        if (!window.MINDAR?.IMAGE?.Compiler) throw new Error('MindAR Compiler failed to load.');

        const compiler = new window.MINDAR.IMAGE.Compiler();
        let lastPct = -1;
        await compiler.compileImageTargets(imageElements, (p) => {
          const pct = Math.min(100, Math.round(p * 100));
          if (pct !== lastPct) {
            lastPct = pct;
            setProgress(pct);
            return new Promise((resolve) => setTimeout(resolve, 0));
          }
        });
        if (cancelledRef.current) return;

        const mindBuffer = await compiler.exportData();
        mindBlobUrl = URL.createObjectURL(
          new Blob([mindBuffer], { type: 'application/octet-stream' })
        );
        const arTargets = merged.map((t, i) => ({
          targetIndex: i,
          label: t.label,
          planeWidth: t.planeWidth,
          planeHeight: t.planeHeight,
          planeOffsetY: t.planeOffsetY,
          videoUrl: t.videoUrl || '',
          targetType: t.targetType || 'video',
          urlLink: t.urlLink || '',
        }));

        // Save to IndexedDB for next session
        setCachedUserMind(fingerprint, mindBuffer, arTargets).catch(() => {});
        _cachedUserMind = { key: fingerprint, mindBlobUrl, arTargets };
        blobHandedOff = true;
        onReady({ targets: arTargets, mindFileUrl: mindBlobUrl });
      } catch (err) {
        if (cancelledRef.current) return;
        console.error('[UserScanScreen]', err);
        setErrorMsg(err.message || 'Failed to prepare scan. Please try again.');
        setPhase('error');
      }
    }

    prepare();
    return () => {
      cancelledRef.current = true;
      if (mindBlobUrl && !blobHandedOff) URL.revokeObjectURL(mindBlobUrl);
    };
  }, [onReady]);

  // Error state
  if (phase === 'error') {
    return (
      <div style={{ ...s.screen, background: colors.bg }}>
        <button onClick={onBack} style={{ ...s.backBtn, color: colors.textMuted }}>&#8592;</button>
        <div style={s.center}>
          <div style={s.errorIcon}>!</div>
          <p style={s.errorText}>{errorMsg}</p>
          <button onClick={onBack} style={s.retryBtn}>{tr.back}</button>
        </div>
      </div>
    );
  }

  // Camera-first view
  if (cameraReady) {
    const progressPct = phase === 'fetching' ? 10 : progress;
    const statusLabel =
      phase === 'fetching'
        ? tr.loadingTargets
        : tr.compilingScanner + ' ' + progress + '%';
    return (
      <div style={s.screen}>
        <video ref={videoRef} autoPlay playsInline muted style={s.cameraVideo} />
        <div style={s.vignette} />
        <button onClick={onBack} style={s.backBtnCamera}>&#8592;</button>
        <div style={s.viewfinderWrap}>
          <ViewfinderBrackets />
        </div>
        <div style={s.bottomBar}>
          <p style={s.bottomLabel}>{statusLabel}</p>
          <div style={s.progressTrack}>
            <div style={{ ...s.progressFill, width: progressPct + '%' }} />
          </div>
        </div>
      </div>
    );
  }

  // Fallback: camera permission denied
  return (
    <div style={{ ...s.screen, background: colors.bg }}>
      <div style={s.watermark}>
        <img src="/logo.png" alt="" style={s.watermarkImg} />
      </div>
      <button onClick={onBack} style={{ ...s.backBtn, color: colors.textMuted }}>&#8592;</button>
      <div style={s.center}>
        <ScannerIcon />
        <p style={{ ...s.scanLabel, color: colors.textMuted }}>PREPARING SCANNER</p>
        <p style={{ ...s.statusText, color: colors.textMuted }}>
          {phase === 'fetching' ? tr.loadingTargets : tr.compilingScanner + ' ' + progress + '%'}
        </p>
        <div style={s.progressBar}>
          <div style={{ ...s.progressFill, width: phase === 'fetching' ? '10%' : progress + '%' }} />
        </div>
      </div>
    </div>
  );
}

function ViewfinderBrackets() {
  const L = 36;
  const TH = 4;
  const C = '#00C9A7';
  const corners = [
    `M0,${L} L0,0 L${L},0`,
    `M${100 - L},0 L100,0 L100,${L}`,
    `M100,${100 - L} L100,100 L${100 - L},100`,
    `M${L},100 L0,100 L0,${100 - L}`,
  ];
  return (
    <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', overflow: 'visible' }} fill="none">
      {corners.map((d, i) => (
        <path key={i} d={d} stroke={C} strokeWidth={TH} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}

function ScannerIcon() {
  return (
    <svg width="120" height="120" viewBox="0 0 130 130" fill="none">
      <path d="M8 42 L8 8 L42 8" stroke="white" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M88 8 L122 8 L122 42" stroke="white" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M122 88 L122 122 L88 122" stroke="white" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M42 122 L8 122 L8 88" stroke="white" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="24" y1="65" x2="106" y2="65" stroke="#00C9A7" strokeWidth="3" strokeLinecap="round" opacity="0.8" />
    </svg>
  );
}

const s = {
  screen: { position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', fontFamily: FONT, overflow: 'hidden', background: '#000' },
  cameraVideo: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' },
  vignette: { position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.55) 100%)', pointerEvents: 'none' },
  backBtnCamera: { position: 'absolute', top: 20, left: 20, zIndex: 10, background: 'rgba(0,0,0,0.35)', border: 'none', borderRadius: '50%', color: '#fff', fontSize: 22, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' },
  viewfinderWrap: { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -58%)', width: '65vw', height: '65vw', maxWidth: 280, maxHeight: 280 },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: '20px 28px 36px', background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%)', zIndex: 10 },
  bottomLabel: { margin: '0 0 10px', fontSize: 13, color: 'rgba(255,255,255,0.85)', fontFamily: FONT, letterSpacing: '0.04em', textAlign: 'center' },
  progressTrack: { width: '100%', height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.15)', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2, background: 'linear-gradient(90deg, #00C9A7, #00E5CC)', transition: 'width 0.3s ease' },
  watermark: { position: 'absolute', right: -60, top: '5%', width: '80vw', maxWidth: 360, opacity: 0.07, pointerEvents: 'none' },
  watermarkImg: { width: '100%', filter: 'brightness(0) invert(1)' },
  backBtn: { position: 'absolute', top: 20, left: 20, background: 'transparent', border: 'none', fontSize: 26, cursor: 'pointer', padding: '6px 10px', zIndex: 2 },
  center: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px 40px' },
  scanLabel: { fontSize: 13, letterSpacing: '0.2em', fontFamily: FONT, margin: '20px 0 8px' },
  statusText: { fontSize: 13, fontFamily: FONT, margin: '0 0 20px', textAlign: 'center' },
  progressBar: { width: '100%', maxWidth: 240, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' },
  errorIcon: { width: 64, height: 64, borderRadius: '50%', background: 'rgba(255,80,80,0.15)', border: '2px solid rgba(255,80,80,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, color: '#ff8080', marginBottom: 16 },
  errorText: { fontSize: 15, color: 'rgba(255,255,255,0.7)', fontFamily: FONT, textAlign: 'center', marginBottom: 24 },
  retryBtn: { background: 'transparent', border: '1.5px solid rgba(255,255,255,0.35)', borderRadius: 50, color: '#ffffff', fontSize: 15, fontFamily: FONT, padding: '14px 32px', cursor: 'pointer' },
};

