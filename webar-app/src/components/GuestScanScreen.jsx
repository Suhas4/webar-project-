import { useState, useEffect, useRef, useCallback } from "react";
import { fetchPublicTargets, loadTargets, uploadPublicCombinedMind } from "../hooks/useArStorage.js";
import { getCachedPublicMind, setCachedPublicMind } from "../hooks/useMindCache.js";
import { R2_PUBLIC_URL } from "../config/api.js";
import { useLanguage } from "../context/LanguageContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { takeWarmStream, markCameraConfirmed } from "../hooks/cameraWarmup.js";
import { loadMindARCompiler } from "../hooks/loadMindARCompiler.js";
import { fetchImageForAR } from "../hooks/fetchImageForAR.js";
import {
  waitForBackgroundPublicResult,
  consumeBackgroundPublicResult,
} from "../hooks/backgroundCompilePublic.js";
import { buildCameraErrorMessage } from "../utils/inAppBrowser.js";

// Session-level cache — stores raw buffer so every scan creates a fresh blob URL
// (reusing a blob URL across launchAR calls causes it to be revoked mid-flight)
let _cachedPublicMind = null; // { key, mindBuffer, arTargets }
export function invalidateGuestCache() { _cachedPublicMind = null; }

// arTargets gained `imageUrl` (needed by the experimental jsfeat/capture scan
// engines) and later `id` (needed so the Like/Save buttons on a scanned video
// know which DB row to toggle) fields after this cache shape already existed.
// Reject entries cached before either change so they fall through to a fresh
// compile instead of looking like a real cache hit with silently-broken buttons.
function hasImageUrls(arTargets) {
  return Array.isArray(arTargets) && arTargets.length > 0 &&
    arTargets.every((t) => !!t.imageUrl && t.id != null);
}

const FONT = "'Outfit', -apple-system, BlinkMacSystemFont, sans-serif";

const SCAN_STYLE = `
  @keyframes scanDotPulse {
    0%,100% { opacity:0.4; transform:scale(0.7); }
    50%     { opacity:1;   transform:scale(1.2); }
  }
  @keyframes bracketPulse {
    0%,100% { opacity:0.7; }
    50%     { opacity:1; }
  }
  @keyframes scanLineMove {
    0%   { transform:translateY(-130px); opacity:0; }
    10%  { opacity:0.8; }
    90%  { opacity:0.6; }
    100% { transform:translateY(130px); opacity:0; }
  }
`;

export default function GuestScanScreen({ onReady, onBack, onCreateAccount, onError, prefetchedTargets, silent = false, includeOwnTargets = false }) {
  const { lang, tr: trFromContext } = useLanguage();
  const tr = trFromContext;
  const { colors, theme } = useTheme();
  const isDark = theme !== 'light';
  const [phase, setPhase] = useState("fetching");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [torchOn, setTorchOn] = useState(false);
  const [zoom, setZoom] = useState(1);
  const cancelledRef  = useRef(false);
  const videoRef      = useRef(null);
  const streamRef     = useRef(null);
  const torchRef      = useRef(false);
  const handedOffRef  = useRef(false);

  const applyZoom = useCallback((level) => {
    const track = streamRef.current?.getVideoTracks?.()?.[0];
    if (!track) return;
    const caps = track.getCapabilities?.() || {};
    const min = caps.zoom?.min ?? 1;
    const max = caps.zoom?.max ?? 4;
    const clamped = Math.min(max, Math.max(min, level));
    track.applyConstraints({ advanced: [{ zoom: clamped }] }).catch(() => {});
    setZoom(Math.round(clamped * 10) / 10);
  }, []);

  const applyTorch = useCallback((on) => {
    const track = streamRef.current?.getVideoTracks?.()?.[0];
    if (!track) return;
    track.applyConstraints({ advanced: [{ torch: on }] }).catch(() => {});
    torchRef.current = on;
    setTorchOn(on);
  }, []);

  // Use pre-warmed stream if available, otherwise open camera.
  // Silent mode skips this entirely — no viewfinder is rendered and the camera
  // must stay free for ar-scanner.html to acquire it after compilation finishes.
  useEffect(() => {
    if (silent) return;

    const warm = takeWarmStream();
    if (warm) {
      markCameraConfirmed();
      streamRef.current = warm;
      setCameraReady(true);
      return () => {
        if (!handedOffRef.current && streamRef.current) {
          streamRef.current.getVideoTracks().forEach((track) => {
            try { track.applyConstraints({ advanced: [{ torch: false }] }).catch(() => {}); } catch (_) {}
          });
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
      };
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera not supported on this device or browser.");
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280, max: 1920 }, height: { ideal: 720, max: 1080 } }, audio: false })
      .then((stream) => {
        markCameraConfirmed();
        streamRef.current = stream;
        setCameraReady(true);
      })
      .catch((err) => {
        setCameraError(buildCameraErrorMessage(err));
      });
    return () => {
      if (!handedOffRef.current && streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [silent]);

  // Attach stream to video element once it mounts
  useEffect(() => {
    if (cameraReady && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [cameraReady]);

  // Auto-torch brightness detection
  useEffect(() => {
    if (!cameraReady) return;
    const autoEnabled =
      localStorage.getItem("memoera_auto_flash") === "true" ||
      localStorage.getItem("memoera_dark_flash") === "true";
    if (!autoEnabled) return;
    const canvas = document.createElement("canvas");
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext("2d");
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

  // Compilation pipeline — runs while camera is already showing
  useEffect(() => {
    cancelledRef.current = false;
    let mindBlobUrl = null;
    let blobHandedOff = false;

    function releaseCamera() {
      handedOffRef.current = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    }

    // Give Android time to physically release the camera before MindAR opens it.
    // track.stop() does NOT always release the camera2 HAL session synchronously
    // on Android — earlier attempts with shorter delays caused intermittent camera
    // failures in the AR scanner (getUserMedia failing as "busy"). Increased to 500ms
    // for better stability on older/slower devices — but only when a stream was
    // actually active; nothing to wait for otherwise.
    async function releaseAndReady(targets, mindFileUrlArg) {
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
        setPhase("fetching");
        let publicTargets;
        if (prefetchedTargets && prefetchedTargets.length > 0) {
          publicTargets = prefetchedTargets;
        } else {
          try {
            publicTargets = await fetchPublicTargets();
          } catch {
            // Server unreachable — say so, rather than claiming there's no
            // content to scan. Those need different actions from the user.
            if (cancelledRef.current) return;
            setErrorMsg("Couldn't reach Memoera just now. Check your connection and tap Scan again.");
            setPhase("error");
            return;
          }
        }
        if (cancelledRef.current) return;

        // Signed-in Home scan: a user's own private targets are never part of
        // the shared public feed, so without this they could never scan their
        // own uploads (only ones they'd separately marked Public). Merge them
        // in — de-duped by id against anything already public — so "point the
        // camera at what I just uploaded" works regardless of visibility.
        // hasPrivateMix (NOT includeOwnTargets) is what actually gates the R2
        // shared-cache read/write below — a signed-in user whose own targets
        // are all already public (or has none) produces the exact same list
        // as a pure guest, so it must still get to use/heal the shared cache;
        // only skip that when private content is genuinely mixed in.
        let hasPrivateMix = false;
        if (includeOwnTargets) {
          try {
            const { targets: ownTargets } = await loadTargets();
            if (ownTargets && ownTargets.length) {
              const publicIds = new Set(publicTargets.map((t) => t.id).filter(Boolean));
              const ownExtra = ownTargets
                .filter((t) => !t.id || !publicIds.has(t.id))
                .map((t) => ({ ...t, imageUrl: t.imageUrl || t._imagePreviewUrl }))
                .filter((t) => !!t.imageUrl);
              if (ownExtra.length) {
                hasPrivateMix = true;
                publicTargets = [...publicTargets, ...ownExtra];
              }
            }
          } catch { /* best-effort — public targets alone still work */ }
        }
        if (cancelledRef.current) return;

        if (!publicTargets || publicTargets.length === 0) {
          // Signed-in users already have an account — telling them to create
          // one is the wrong next step.
          setErrorMsg(includeOwnTargets
            ? "Nothing to scan yet. Upload a photo and attach a video to it first."
            : "No public AR targets yet. Create an account to upload your own!");
          setPhase("error");
          return;
        }

        // Order-sensitive (must match rebuildPublicMind.js): a stale combined.mind
        // whose baked-in target order has drifted from the freshly-fetched
        // publicTargets order would otherwise map targetIndex -> wrong video/label.
        const fingerprint = publicTargets.map((t) => t.imageUrl).join("|");

        const buildArTargets = (targets) =>
          targets.map((t, i) => ({
            id: t.id, // lets the AR scanner's Report button flag the right DB row
            targetIndex: i,
            label: t.label,
            planeWidth: t.planeWidth,
            planeHeight: t.planeHeight,
            planeOffsetY: t.planeOffsetY,
            videoUrl: t.videoUrl,
            targetType: t.targetType || "video",
            urlLink: t.urlLink || "",
            animationEffect: t.animationEffect || "popIn",
            imageUrl: t.imageUrl || "", // needed by the experimental jsfeat engine
          }));

        // 1. Session cache — instant, zero async work
        // Always create a fresh blob URL so the previous one can be safely revoked by launchAR
        if (_cachedPublicMind?.key === fingerprint && hasImageUrls(_cachedPublicMind.arTargets)) {
          mindBlobUrl = URL.createObjectURL(new Blob([_cachedPublicMind.mindBuffer], { type: 'application/octet-stream' }));
          await releaseAndReady(_cachedPublicMind.arTargets, mindBlobUrl);
          return;
        }

        // 1b. Background pre-fetch/compile kicked off on the Hello screen —
        // wait for it even if still in-flight, but bounded. Abandoning an
        // already-running compile and starting a second, fully redundant one
        // (the old "only use it if already finished" gate) competes for the
        // same CPU and roughly doubles the wait — exactly the 20+ second
        // first-scan delay reported. The timeout exists so a genuinely stuck
        // background fetch (bad network, etc.) can't hang this screen
        // forever — past 10s we give up waiting and fall through to this
        // screen's own independent attempt below.
        const bgResult = await Promise.race([
          waitForBackgroundPublicResult(),
          new Promise((resolve) => setTimeout(() => resolve(null), 10000)),
        ]);
        if (bgResult && bgResult.key === fingerprint && !cancelledRef.current && hasImageUrls(bgResult.arTargets)) {
          _cachedPublicMind = { key: bgResult.key, mindBuffer: bgResult.mindBuffer, arTargets: bgResult.arTargets };
          consumeBackgroundPublicResult();
          mindBlobUrl = URL.createObjectURL(new Blob([bgResult.mindBuffer], { type: 'application/octet-stream' }));
          await releaseAndReady(bgResult.arTargets, mindBlobUrl);
          return;
        }
        if (cancelledRef.current) return;

        // 2. IndexedDB cache — survives page refreshes
        const idbHit = await getCachedPublicMind(fingerprint);
        if (idbHit && !cancelledRef.current && hasImageUrls(idbHit.arTargets)) {
          mindBlobUrl = URL.createObjectURL(new Blob([idbHit.mindBuffer], { type: "application/octet-stream" }));
          _cachedPublicMind = { key: fingerprint, mindBuffer: idbHit.mindBuffer, arTargets: idbHit.arTargets };
          await releaseAndReady(idbHit.arTargets, mindBlobUrl);
          return;
        }
        if (cancelledRef.current) return;

        setPhase("compiling");

        // 3. Pre-built .mind in R2 — no compilation needed, just download.
        // Skipped when private targets are mixed in: that combined.mind is a
        // shared public artifact keyed to a public-only fingerprint, so a
        // merged fingerprint is guaranteed not to match — not worth the round trip.
        try {
          if (hasPrivateMix) throw new Error("skip — private targets mixed in");
          const fpRes = await fetch(`${R2_PUBLIC_URL}/public/combined-fingerprint.txt`, { cache: "no-cache" });
          if (fpRes.ok) {
            const storedFp = (await fpRes.text()).trim();
            if (storedFp === fingerprint) {
              const mindRes = await fetch(`${R2_PUBLIC_URL}/public/combined.mind`);
              if (mindRes.ok && !cancelledRef.current) {
                const mindBuffer = await mindRes.arrayBuffer();
                if (!cancelledRef.current) {
                  const arTargets = buildArTargets(publicTargets);
                  mindBlobUrl = URL.createObjectURL(new Blob([mindBuffer], { type: "application/octet-stream" }));
                  setCachedPublicMind(fingerprint, mindBuffer, arTargets).catch(() => {});
                  _cachedPublicMind = { key: fingerprint, mindBuffer, arTargets };
                  await releaseAndReady(arTargets, mindBlobUrl);
                  return;
                }
              }
            }
          }
        } catch {
          // Pre-built not available — fall through to compile
        }
        if (cancelledRef.current) return;

        // 4. Compile from scratch (first-time or stale pre-built)
        const rawResults = await Promise.allSettled(
          publicTargets.map((t, i) => {
            if (!t.imageUrl) return Promise.reject(new Error('missing image'));
            return fetchImageForAR(t.imageUrl, t.label || ('Target ' + (i + 1)));
          })
        );
        const imageElements = [];
        const validPublicTargets = [];
        rawResults.forEach((r, i) => {
          if (r.status === 'fulfilled') { imageElements.push(r.value); validPublicTargets.push(publicTargets[i]); }
        });
        if (!imageElements.length) {
          setErrorMsg('No AR targets are currently available. Check back later!');
          setPhase('error');
          return;
        }
        const lostCount = rawResults.length - imageElements.length;
        if (cancelledRef.current) return;

        await loadMindARCompiler();

        const compiler = new window.MINDAR.IMAGE.Compiler();
        let lastPct = -1;
        await compiler.compileImageTargets(imageElements, (p) => {
          const pct = Math.min(100, Math.round(p * 100));
          if (pct !== lastPct) {
            lastPct = pct;
            if (!cancelledRef.current) setProgress(pct);
            return new Promise((resolve) => setTimeout(resolve, 0));
          }
        });

        const mindBuffer = await compiler.exportData();
        const arTargets = buildArTargets(validPublicTargets);

        setCachedPublicMind(fingerprint, mindBuffer, arTargets).catch(() => {});
        _cachedPublicMind = { key: fingerprint, mindBuffer, arTargets };
        // Self-healing: this device just paid the full from-scratch compile
        // cost because the pre-built R2 copy was stale (fingerprint mismatch,
        // e.g. more public targets uploaded since it was last built). Push
        // this fresh result back so the NEXT scan — on any device — gets the
        // instant pre-built path instead of repeating this same slow compile.
        // Best-effort and silent: requires the viewer to be signed in
        // (uploadPublicCombinedMind no-ops without a token) and never blocks
        // handing this scan's own result to the user.
        // Deliberately NOT gated on cancelledRef — if the user gave up and hit
        // back before this finished, the compile still ran to completion in
        // the background, and skipping the upload here would waste that work
        // and leave the stale R2 copy in place for the next person too.
        // Skipped only when this compile actually includes the viewer's own
        // private targets (hasPrivateMix) — pushing that back would leak
        // private content into the shared public cache for every other
        // viewer. A signed-in viewer with no private targets (or none beyond
        // what's already public) still heals the cache like a guest would.
        if (!hasPrivateMix) {
          uploadPublicCombinedMind(mindBuffer, fingerprint).catch(() => {});
        }
        if (cancelledRef.current) return;

        mindBlobUrl = URL.createObjectURL(
          new Blob([mindBuffer], { type: "application/octet-stream" })
        );
        await releaseAndReady(arTargets, mindBlobUrl);
      } catch (err) {
        if (cancelledRef.current) return;
        setErrorMsg(err.message || "Failed to prepare scan. Please try again.");
        setPhase("error");
      }
    }

    prepare();
    return () => {
      cancelledRef.current = true;
      if (mindBlobUrl && !blobHandedOff) URL.revokeObjectURL(mindBlobUrl);
    };
  }, [onReady]);

  // In silent mode, don't overlay HelloScreen with a full error screen — but
  // still surface the failure via onError so the tap doesn't look like it did
  // nothing at all (previously this bounced back with zero feedback).
  useEffect(() => {
    if (silent && (phase === 'error' || cameraError)) {
      onError?.(cameraError || errorMsg);
      onBack();
    }
  }, [silent, phase, cameraError, errorMsg, onBack, onError]);

  // Error state
  if (phase === "error" || cameraError) {
    if (silent) return null;
    return (
      <div style={{ ...s.screen, background: colors.bg }}>
        <button onClick={onBack} style={{ ...s.backBtn, color: colors.textMuted }}>&larr;</button>
        <div style={s.center}>
          <div style={s.errorIcon}>⚠️</div>
          <p style={{ ...s.errorText, color: colors.text }}>{cameraError || errorMsg}</p>
          <button onClick={onBack} style={{ ...s.retryBtn, border: `1.5px solid ${colors.textMuted}`, color: colors.text }}>{tr.back}</button>
        </div>
      </div>
    );
  }

  // Silent mode: data loads while the previous screen (Hello) stays visible —
  // no loading screen of our own, so the transition feels instantaneous.
  if (silent) return null;

  // The camera warm-stream (see the effect above) was being held open but
  // never actually shown — add a live preview so tapping Scan feels instant
  // immediately, same treatment as the logged-in scan screen.
  return (
    <div style={{ ...s.screen, background: colors.bg }}>
      <video
        ref={videoRef} autoPlay playsInline muted
        style={{ ...s.liveVideo, opacity: cameraReady ? 1 : 0 }}
      />
      <div style={s.prepOverlay} />
      <div style={s.watermark}>
        <img src="/logo.png" alt="" style={{ ...s.watermarkImg, filter: isDark ? 'brightness(0) invert(1)' : 'brightness(0.3)' }} />
      </div>
      <button onClick={onBack} style={{ ...s.backBtn, color: colors.textMuted }}>&larr;</button>
      <div style={s.center}>
        <ScannerIcon />
        <p style={{ ...s.scanLabel, color: colors.textMuted }}>{tr.scanAsGuest}</p>
        <p style={{ ...s.statusText, color: colors.textMuted }}>
          {phase === "fetching" ? tr.findingTargets : tr.preparingScanner + " " + progress + "%"}
        </p>
        <div style={{ ...s.progressBar, background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.12)' }}>
          <div style={{ ...s.progressFill, width: phase === "fetching" ? "15%" : progress + "%", background: colors.accent }} />
        </div>
        {phase === "compiling" && (
          <p style={{ ...s.statusText, marginTop: 10, fontSize: 12, opacity: 0.75 }}>
            First-time setup can take up to a minute — please keep this open.
          </p>
        )}
      </div>
    </div>
  );
}

function ViewfinderBrackets() {
  const L = 36;
  const TH = 4;
  const C = "rgba(255,255,255,0.85)";
  const corners = [
    `M0,${L} L0,0 L${L},0`,
    `M${100 - L},0 L100,0 L100,${L}`,
    `M100,${100 - L} L100,100 L${100 - L},100`,
    `M${L},100 L0,100 L0,${100 - L}`,
  ];
  return (
    <svg viewBox="0 0 100 100" style={{ width: "100%", height: "100%", overflow: "visible" }} fill="none">
      {corners.map((d, i) => (
        <path key={i} d={d} stroke={C} strokeWidth={TH} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}

function TorchIcon({ on }) {
  const color = on ? "#00C9A7" : "rgba(255,255,255,0.85)";
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2h8l2 6H6L8 2z" fill={on ? "rgba(0,201,167,0.35)" : "none"} />
      <path d="M6 8l1.5 12a1 1 0 001 .9h7a1 1 0 001-.9L18 8" />
      <line x1="12" y1="12" x2="12" y2="17" />
      {on && <circle cx="12" cy="20" r="1.5" fill="#00C9A7" stroke="none" />}
    </svg>
  );
}

function ScannerIcon() {
  return (
    <svg width="140" height="140" viewBox="0 0 140 140" fill="none">
      <defs>
        <linearGradient id="guestScannerCornerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00C9A7" />
          <stop offset="100%" stopColor="#C9A84C" />
        </linearGradient>
      </defs>
      <path d="M10 45 L10 10 L45 10" stroke="url(#guestScannerCornerGrad)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M95 10 L130 10 L130 45" stroke="url(#guestScannerCornerGrad)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M130 95 L130 130 L95 130" stroke="url(#guestScannerCornerGrad)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M45 130 L10 130 L10 95" stroke="url(#guestScannerCornerGrad)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="28" y1="70" x2="112" y2="70" stroke="#00C9A7" strokeWidth="4" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}

const s = {
  screen: { position: "fixed", inset: 0, display: "flex", flexDirection: "column", fontFamily: FONT, overflow: "hidden", background: "#000" },
  cameraVideo: { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" },
  liveVideo: { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", transition: "opacity 0.4s ease", pointerEvents: "none" },
  prepOverlay: { position: "absolute", inset: 0, background: "rgba(4,13,11,0.62)", backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)", pointerEvents: "none" },
  backBtnCamera: { position: "absolute", top: 20, left: 20, zIndex: 10, background: "rgba(0,0,0,0.35)", border: "none", borderRadius: 8, color: "#fff", fontSize: 15, fontFamily: FONT, fontWeight: 600, padding: "8px 16px", cursor: "pointer" },
  viewfinderWrap: { position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -55%)", width: "72vw", height: "72vw", maxWidth: 300, maxHeight: 300 },
  scanLine: { position: "absolute", left: "5%", right: "5%", height: 2, background: "linear-gradient(90deg, transparent, rgba(0,201,167,0.9) 50%, transparent)", animation: "scanLineMove 2s ease-in-out infinite", pointerEvents: "none", zIndex: 5 },
  torchBottomBtn: { display: "flex", alignItems: "center", gap: 7, border: "1px solid", borderRadius: 24, padding: "10px 22px", cursor: "pointer", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", transition: "background 0.2s, border-color 0.2s" },
  hintText:       { position: "absolute", top: "calc(50% + 165px)", left: "50%", transform: "translateX(-50%)", fontSize: 12, color: "rgba(255,255,255,0.55)", fontFamily: FONT, letterSpacing: "0.04em", whiteSpace: "nowrap", pointerEvents: "none", zIndex: 5 },
  bottomBar:      { position: "absolute", bottom: 28, left: 0, right: 0, zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 14, padding: "0 24px" },
  zoomRow:        { display: "flex", alignItems: "center", gap: 8, background: "rgba(0,0,0,0.45)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 14, padding: "8px 14px", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" },
  zoomBtn:        { background: "transparent", border: "none", color: "#fff", fontSize: 18, fontFamily: FONT, cursor: "pointer", padding: "0 4px", lineHeight: 1 },
  zoomLevel:      { fontSize: 13, color: "rgba(255,255,255,0.85)", fontFamily: FONT, minWidth: 34, textAlign: "center" },
  createAccBtn:   { position: "absolute", top: 56, right: 16, zIndex: 12, background: "rgba(0,201,167,0.18)", border: "1px solid rgba(0,201,167,0.5)", borderRadius: 20, color: "#00C9A7", fontSize: 12, fontWeight: 700, fontFamily: FONT, padding: "7px 14px", cursor: "pointer", backdropFilter: "blur(8px)", letterSpacing: "0.04em" },
  progressFill: { height: "100%", borderRadius: 2, background: "rgba(255,255,255,0.7)", transition: "width 0.3s ease" },
  watermark: { position: "absolute", right: -60, top: "5%", width: "80vw", maxWidth: 360, opacity: 0.07, pointerEvents: "none" },
  watermarkImg: { width: "100%", filter: "brightness(0) invert(1)" },
  backBtn: { position: "absolute", top: 20, left: 20, background: "transparent", border: "none", fontSize: 26, cursor: "pointer", padding: "6px 10px", zIndex: 2 },
  center: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "20px 40px" },
  scanLabel: { fontSize: 14, letterSpacing: "0.2em", fontFamily: FONT, margin: "20px 0 8px" },
  statusText: { fontSize: 13, fontFamily: FONT, margin: "0 0 20px", textAlign: "center" },
  progressBar: { width: "100%", maxWidth: 240, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.1)", overflow: "hidden" },
  errorIcon: { fontSize: 40, marginBottom: 12 },
  errorText: { fontSize: 15, color: "rgba(255,255,255,0.7)", fontFamily: FONT, textAlign: "center", marginBottom: 24 },
  retryBtn: { background: "transparent", border: "1.5px solid rgba(255,255,255,0.35)", borderRadius: 50, color: "#ffffff", fontSize: 15, fontFamily: FONT, padding: "14px 32px", cursor: "pointer" },
};
