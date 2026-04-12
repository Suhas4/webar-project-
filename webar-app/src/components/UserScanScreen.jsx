import { useState, useEffect, useRef } from 'react';
import { loadTargets, loadPublicTargets } from '../hooks/useArStorage.js';

const FONT = "'Outfit', -apple-system, BlinkMacSystemFont, sans-serif";
const BG = 'linear-gradient(160deg, #061A1F 0%, #0A2229 50%, #061820 100%)';

/**
 * UserScanScreen — logged-in scan.
 * Combines the user's own targets (private + public) with all other public targets,
 * compiles one .mind file, then launches AR.
 */
export default function UserScanScreen({ onReady, onBack }) {
  const [phase, setPhase] = useState('fetching');
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const cancelledRef = useRef(false);

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

        setPhase('compiling');

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
        const mindBlob = new Blob([mindBuffer], { type: 'application/octet-stream' });
        mindBlobUrl = URL.createObjectURL(mindBlob);

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

  return (
    <div style={s.screen}>
      <div style={s.watermark}>
        <img src="/logo.png" alt="" style={s.watermarkImg} />
      </div>
      <button onClick={onBack} style={s.backBtn}>&#8592;</button>
      <div style={s.center}>
        {phase === 'error' ? (
          <>
            <div style={s.errorIcon}>!</div>
            <p style={s.errorText}>{errorMsg}</p>
            <button onClick={onBack} style={s.retryBtn}>Go Back</button>
          </>
        ) : (
          <>
            <ScannerIcon />
            <p style={s.scanLabel}>PREPARING SCANNER</p>
            <p style={s.statusText}>
              {phase === 'fetching'
                ? 'Loading your targets...'
                : 'Compiling scanner... ' + progress + '%'}
            </p>
            <div style={s.progressBar}>
              <div style={{ ...s.progressFill, width: phase === 'fetching' ? '10%' : progress + '%' }} />
            </div>
          </>
        )}
      </div>
    </div>
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
  screen: { position: 'fixed', inset: 0, background: BG, display: 'flex', flexDirection: 'column', fontFamily: FONT, overflow: 'hidden' },
  watermark: { position: 'absolute', right: -60, top: '5%', width: '80vw', maxWidth: 360, opacity: 0.07, pointerEvents: 'none' },
  watermarkImg: { width: '100%', filter: 'brightness(0) invert(1)' },
  backBtn: { position: 'absolute', top: 20, left: 20, background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: 26, cursor: 'pointer', padding: '6px 10px', zIndex: 2 },
  center: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px 40px' },
  scanLabel: { fontSize: 13, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.7)', fontFamily: FONT, margin: '20px 0 8px' },
  statusText: { fontSize: 13, color: 'rgba(255,255,255,0.45)', fontFamily: FONT, margin: '0 0 20px', textAlign: 'center' },
  progressBar: { width: '100%', maxWidth: 240, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' },
  progressFill: { height: '100%', background: 'linear-gradient(90deg, #00C9A7, #00E5CC)', borderRadius: 2, transition: 'width 0.3s ease' },
  errorIcon: { width: 64, height: 64, borderRadius: '50%', background: 'rgba(255,80,80,0.15)', border: '2px solid rgba(255,80,80,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, color: '#ff8080', marginBottom: 16 },
  errorText: { fontSize: 15, color: 'rgba(255,255,255,0.7)', fontFamily: FONT, textAlign: 'center', marginBottom: 24 },
  retryBtn: { background: 'transparent', border: '1.5px solid rgba(255,255,255,0.35)', borderRadius: 50, color: '#ffffff', fontSize: 15, fontFamily: FONT, padding: '14px 32px', cursor: 'pointer' },
};
