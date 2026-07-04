import { useState, useEffect, useRef, useCallback } from 'react';
import { loadTargets } from '../hooks/useArStorage.js';
import { getCachedUserMind, setCachedUserMind, clearCachedUserMind } from '../hooks/useMindCache.js';
import { invalidateBackgroundCompile } from '../hooks/backgroundCompile.js';
import { useLanguage } from '../context/LanguageContext.jsx';
import { T } from '../config/translations.js';
import { useTheme } from '../context/ThemeContext.jsx';
import { takeWarmStream } from '../hooks/cameraWarmup.js';
import {
  waitForBackgroundResult,
  consumeBackgroundResult,
} from '../hooks/backgroundCompile.js';

import { loadMindARCompiler } from '../hooks/loadMindARCompiler.js';
import { fetchImageForAR } from '../hooks/fetchImageForAR.js';
import { buildCameraErrorMessage } from '../utils/inAppBrowser.js';

// Session-level cache — stores raw buffer so every scan creates a fresh blob URL
// (reusing a blob URL across launchAR calls causes it to be revoked mid-flight)
let _cachedUserMind = null; // { key, mindBuffer, arTargets }
export function invalidateUserCache() { _cachedUserMind = null; }

// arTargets gained an `imageUrl` field (needed by the experimental jsfeat/
// capture scan engines) after this cache shape already existed. Any entry
// cached before that change — in memory for this tab, or persisted in
// IndexedDB — would silently lack it forever, since a cache hit skips the
// code that would populate it. Treat such entries as stale so they always
// fall through to a fresh compile instead of looking like a real cache hit.
function hasImageUrls(arTargets) {
  return Array.isArray(arTargets) && arTargets.length > 0 &&
    arTargets.every((t) => !!t.imageUrl);
}

const FONT = "'Outfit', -apple-system, BlinkMacSystemFont, sans-serif";

export default function UserScanScreen({ onReady, onBack }) {
  const [phase, setPhase]         = useState('fetching');
  const [progress, setProgress]   = useState(0);
  const [errorMsg, setErrorMsg]   = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [torchOn, setTorchOn]     = useState(false);
  const cancelledRef  = useRef(false);
  const videoRef      = useRef(null);
  const streamRef     = useRef(null);
  const torchRef      = useRef(false);
  const handedOffRef  = useRef(false);
  const { lang }     = useLanguage();
  const tr           = { ...T.en, ...(T[lang] || {}) };
  const { colors, theme } = useTheme();
  const isDark = theme !== 'light';

  // Clear IndexedDB cache + session cache, then retry from scratch
  const handleClearAndRetry = useCallback(async () => {
    _cachedUserMind = null;
    await clearCachedUserMind();
    invalidateBackgroundCompile();
    setPhase('fetching');
    setProgress(0);
    setErrorMsg('');
  }, []);

  // Torch toggle
  const applyTorch = useCallback((on) => {
    const track = streamRef.current?.getVideoTracks?.()?.[0];
    if (!track) return;
    track.applyConstraints({ advanced: [{ torch: on }] }).catch(() => {});
    torchRef.current = on;
    setTorchOn(on);
  }, []);

  // Use pre-warmed stream or open camera
  useEffect(() => {
    const warm = takeWarmStream();
    if (warm) {
      streamRef.current = warm;
      setCameraReady(true);
    } else if (navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280, max: 1920 }, height: { ideal: 720, max: 1080 } }, audio: false })
        .then((stream) => {
          streamRef.current = stream;
          setCameraReady(true);
        })
        .catch((err) => {
          setCameraError(buildCameraErrorMessage(err));
        });
    } else {
      setCameraError('Camera not supported on this device or browser.');
    }
    return () => {
      if (!handedOffRef.current && streamRef.current) {
        // Turn torch off before stopping the track so it doesn't stay lit
        streamRef.current.getVideoTracks().forEach((track) => {
          try { track.applyConstraints({ advanced: [{ torch: false }] }).catch(() => {}); } catch (_) {}
        });
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  // Attach stream to video element once it mounts
  useEffect(() => {
    if (cameraReady && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [cameraReady]);

  // Auto-torch: sample brightness every 2 s when preference is enabled
  useEffect(() => {
    if (!cameraReady) return;
    const autoEnabled =
      localStorage.getItem('memoera_auto_flash') === 'true' ||
      localStorage.getItem('memoera_dark_flash') === 'true';
    if (!autoEnabled) return;
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const id = setInterval(() => {
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;
      try {
        ctx.drawImage(video, 0, 0, 64, 64);
        const d = ctx.getImageData(0, 0, 64, 64).data;
        let sum = 0;
        for (let i = 0; i < d.length; i += 4) sum += (d[i] + d[i + 1] + d[i + 2]) / 3;
        const avg = sum / (d.length / 4);
        if (avg < 50 && !torchRef.current) applyTorch(true);
        else if (avg > 80 && torchRef.current) applyTorch(false);
      } catch {}
    }, 4000); // Reduced from 2000ms to lower CPU usage
    return () => clearInterval(id);
  }, [cameraReady, applyTorch]);

  // â”€â”€ Compilation pipeline â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    cancelledRef.current = false;
    let mindBlobUrl    = null;
    let blobHandedOff  = false;

    function releaseCamera() {
      handedOffRef.current = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    }

    async function releaseAndReady(targets, mindFileUrlArg) {
      // Only wait if a camera stream was actually held and is being torn down —
      // getUserMedia track.stop() does NOT always release the camera hardware
      // synchronously on Android, so the AR scanner's own getUserMedia call can
      // fail as "busy" without this gap. If no stream was active, there's
      // nothing to wait for — skip the delay entirely for a faster handoff.
      // Increased to 500ms for better stability on older/slower devices.
      const hadActiveStream = !!streamRef.current;
      releaseCamera();
      blobHandedOff = true;
      if (hadActiveStream) {
        await new Promise((r) => setTimeout(r, 500));
      }
      if (!cancelledRef.current) onReady({ targets, mindFileUrl: mindFileUrlArg });
    }

    async function prepare() {
      try {
        setPhase('fetching');

        // â”€â”€ 1. Session cache (instant, zero work) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (_cachedUserMind && hasImageUrls(_cachedUserMind.arTargets)) {
          // Always create a fresh blob URL so the previous one can be safely revoked by launchAR
          mindBlobUrl = URL.createObjectURL(new Blob([_cachedUserMind.mindBuffer], { type: 'application/octet-stream' }));
          await releaseAndReady(_cachedUserMind.arTargets, mindBlobUrl);
          return;
        }
        if (_cachedUserMind) _cachedUserMind = null; // stale shape — force a fresh compile below

        // â”€â”€ 2. Background pre-compile â”€â”€ wait for it even if still in-flight,
        // but bounded — a background compile already doing the exact same
        // work is never slower to wait for than starting a second, fully
        // redundant one that competes with it for the same CPU (the old
        // "only use it if already finished" gate caused exactly that
        // double-compile on first scans). The timeout exists so a genuinely
        // stuck background fetch (bad network, etc.) can't hang this screen
        // forever — past 10s we give up waiting and fall through to this
        // screen's own independent attempt below, same safety net as before.
        const bgResult = await Promise.race([
          waitForBackgroundResult(),
          new Promise((resolve) => setTimeout(() => resolve(null), 10000)),
        ]);
        if (bgResult && !cancelledRef.current && hasImageUrls(bgResult.arTargets)) {
          _cachedUserMind = { key: bgResult.key, mindBuffer: bgResult.mindBuffer, arTargets: bgResult.arTargets };
          consumeBackgroundResult();
          mindBlobUrl = URL.createObjectURL(new Blob([bgResult.mindBuffer], { type: 'application/octet-stream' }));
          await releaseAndReady(bgResult.arTargets, mindBlobUrl);
          return;
        }
        if (cancelledRef.current) return;

        // â”€â”€ 3. Fetch OWN targets only â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        //       (public targets are for guest scanning; merging them here only
        //        slows compilation and risks index mismatches with videos)
        const ownResult = await loadTargets();
        if (cancelledRef.current) return;

        const merged = [];
        const seen   = new Set();
        if (ownResult.hasData && ownResult.targets) {
          for (const t of ownResult.targets) {
            const imgUrl = t._imagePreviewUrl;
            if (imgUrl && !seen.has(imgUrl)) {
              seen.add(imgUrl);
              merged.push({
                imageUrl: imgUrl, videoUrl: t.videoUrl || '',
                targetType: t.targetType || 'video', urlLink: t.urlLink || '',
                label: t.label, planeWidth: t.planeWidth,
                planeHeight: t.planeHeight, planeOffsetY: t.planeOffsetY,
              });
            }
          }
        }

        if (!merged.length) {
          setErrorMsg('No AR targets found. Upload your first target using the Upload button!');
          setPhase('error');
          return;
        }

        const fingerprint = merged.map((t) => t.imageUrl).sort().join('|');

        // â”€â”€ 4. IndexedDB cache â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const idbHit = await getCachedUserMind(fingerprint);
        if (idbHit && !cancelledRef.current && hasImageUrls(idbHit.arTargets)) {
          mindBlobUrl = URL.createObjectURL(new Blob([idbHit.mindBuffer], { type: 'application/octet-stream' }));
          _cachedUserMind = { key: fingerprint, mindBuffer: idbHit.mindBuffer, arTargets: idbHit.arTargets };
          await releaseAndReady(idbHit.arTargets, mindBlobUrl);
          return;
        }
        if (cancelledRef.current) return;

        setPhase('compiling');
        setProgress(0);

        // â”€â”€ 5. Compile from scratch â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        //       allSettled so one unavailable image doesn't abort the whole job
        const rawResults = await Promise.allSettled(
          merged.map((t, i) => {
            if (!t.imageUrl) return Promise.reject(new Error('missing image'));
            return fetchImageForAR(t.imageUrl, t.label || ('Target ' + (i + 1)));
          })
        );
        const imageElements = [];
        const validTargets  = [];
        rawResults.forEach((r, i) => {
          if (r.status === 'fulfilled') {
            imageElements.push(r.value);
            validTargets.push(merged[i]);
          }
        });
        if (!imageElements.length) {
          setErrorMsg('All target images are unavailable. Please re-upload your targets.');
          setPhase('error');
          return;
        }
        if (cancelledRef.current) return;

        await loadMindARCompiler();
        if (cancelledRef.current) return;

        // Compile with live progress updates so the user can see it working
        const compiler = new window.MINDAR.IMAGE.Compiler();
        let lastPct = -1;
        await compiler.compileImageTargets(imageElements, (p) => {
          const pct = Math.min(100, Math.round(p * 100));
          if (pct !== lastPct) {
            lastPct = pct;
            setProgress(pct);
            // Yield to the event loop so the UI can re-render the percentage
            return new Promise((resolve) => setTimeout(resolve, 0));
          }
        });
        if (cancelledRef.current) return;

        const mindBuffer = await compiler.exportData();
        mindBlobUrl = URL.createObjectURL(
          new Blob([mindBuffer], { type: 'application/octet-stream' })
        );
        const arTargets = validTargets.map((t, i) => ({
          targetIndex: i, label: t.label,
          planeWidth: t.planeWidth, planeHeight: t.planeHeight,
          planeOffsetY: t.planeOffsetY, videoUrl: t.videoUrl || '',
          targetType: t.targetType || 'video', urlLink: t.urlLink || '',
          imageUrl: t.imageUrl || '', // needed by the experimental jsfeat engine
        }));

        setCachedUserMind(fingerprint, mindBuffer, arTargets).catch(() => {});
        _cachedUserMind = { key: fingerprint, mindBuffer, arTargets };
        await releaseAndReady(arTargets, mindBlobUrl);
      } catch (err) {
        if (cancelledRef.current) return;
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

  // â”€â”€ Error state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (phase === 'error' || cameraError) {
    return (
      <div style={{ ...s.screen, background: colors.bg }}>
        <button onClick={onBack} style={{ ...s.backBtn, color: colors.textMuted }}>&#8592;</button>
        <div style={s.center}>
          <div style={s.errorIcon}>⚠️</div>
          <p style={{ ...s.errorText, color: colors.text }}>{cameraError || errorMsg}</p>
          <button
            onClick={onBack}
            style={{ ...s.retryBtn, border: `1.5px solid ${colors.textMuted}`, color: colors.text }}
          >
            {tr.back}
          </button>
        </div>
      </div>
    );
  }

  // â”€â”€ Preparing scanner: the camera is already warmed/open at this point
  //    (see the warm-stream effect above) — show it live immediately instead
  //    of hiding it behind a static loading icon, so tapping Scan *feels*
  //    instant even while target data is still loading/compiling behind a
  //    translucent overlay. Falls back to the plain background until the
  //    stream actually attaches, so there's no black flash.
  return (
    <div style={{ ...s.screen, background: colors.bg }}>
      <video
        ref={videoRef} autoPlay playsInline muted
        style={{ ...s.liveVideo, opacity: cameraReady ? 1 : 0 }}
      />
      <div style={s.prepOverlay} />
      <div style={s.watermark}>
        <img
          src="/logo.png" alt=""
          style={{ ...s.watermarkImg, filter: isDark ? 'brightness(0) invert(1)' : 'brightness(0.3)' }}
        />
      </div>
      <button onClick={onBack} style={{ ...s.backBtn, color: colors.textMuted }}>&#8592;</button>
      <div style={s.center}>
        <ScannerIcon />
        <p style={{ ...s.scanLabel, color: colors.textMuted }}>PREPARING SCANNER</p>
        <p style={{ ...s.statusText, color: colors.textMuted }}>
          {phase === 'compiling' ? `Setting up... ${progress > 0 ? progress + '%' : ''}` : tr.loadingTargets}
        </p>
        {phase === 'compiling' && progress > 0 && (
          <div style={{ ...s.progressBar, maxWidth: 220, marginTop: 8 }}>
            <div style={{ ...s.progressFill, width: progress + '%' }} />
          </div>
        )}
      </div>
    </div>
  );
}

function ScannerIcon() {
  return (
    <svg width="120" height="120" viewBox="0 0 130 130" fill="none">
      <defs>
        <linearGradient id="scannerCornerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00C9A7" />
          <stop offset="100%" stopColor="#C9A84C" />
        </linearGradient>
      </defs>
      <path d="M8 42 L8 8 L42 8"         stroke="url(#scannerCornerGrad)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M88 8 L122 8 L122 42"     stroke="url(#scannerCornerGrad)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M122 88 L122 122 L88 122" stroke="url(#scannerCornerGrad)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M42 122 L8 122 L8 88"     stroke="url(#scannerCornerGrad)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="24" y1="65" x2="106" y2="65" stroke="#00C9A7" strokeWidth="3" strokeLinecap="round" strokeOpacity="0.5" />
    </svg>
  );
}

const s = {
  screen:        { position:'fixed', inset:0, display:'flex', flexDirection:'column', fontFamily:FONT, overflow:'hidden', background:'#000' },
  hiddenVideo:   { position:'absolute', width:1, height:1, opacity:0, pointerEvents:'none' },
  liveVideo:     { position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', transition:'opacity 0.4s ease', pointerEvents:'none' },
  prepOverlay:   { position:'absolute', inset:0, background:'rgba(4,13,11,0.62)', backdropFilter:'blur(2px)', WebkitBackdropFilter:'blur(2px)', pointerEvents:'none' },
  progressBar:   { width:'100%', height:3, borderRadius:2, background:'rgba(255,255,255,0.18)', overflow:'hidden' },
  progressFill:  { height:'100%', borderRadius:2, background:'#00C9A7', transition:'width 0.3s ease' },
  watermark:     { position:'absolute', right:-60, top:'5%', width:'80vw', maxWidth:360, opacity:0.07, pointerEvents:'none' },
  watermarkImg:  { width:'100%', filter:'brightness(0) invert(1)' },
  backBtn:       { position:'absolute', top:20, left:20, background:'transparent', border:'none', fontSize:26, cursor:'pointer', padding:'6px 10px', zIndex:2 },
  center:        { flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'20px 40px' },
  scanLabel:     { fontSize:13, letterSpacing:'0.2em', fontFamily:FONT, margin:'20px 0 8px' },
  statusText:    { fontSize:13, fontFamily:FONT, margin:'0 0 4px', textAlign:'center' },
  errorIcon:     { fontSize:40, marginBottom:12 },
  errorText:     { fontSize:15, color:'rgba(255,255,255,0.7)', fontFamily:FONT, textAlign:'center', marginBottom:24 },
  retryBtn:      { background:'transparent', border:'1.5px solid rgba(255,255,255,0.35)', borderRadius:50, color:'#fff', fontSize:15, fontFamily:FONT, padding:'14px 32px', cursor:'pointer' },
};
