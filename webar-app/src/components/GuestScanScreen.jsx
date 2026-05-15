import { useState, useEffect, useRef } from "react";
import { loadPublicTargets } from "../hooks/useArStorage.js";
import { getCachedPublicMind, setCachedPublicMind } from "../hooks/useMindCache.js";
import { R2_PUBLIC_URL } from "../config/api.js";
import { useLanguage } from "../context/LanguageContext.jsx";
import { T } from "../config/translations.js";
import { useTheme } from "../context/ThemeContext.jsx";

// Session-level cache: skip all async work if targets haven't changed this session
let _cachedPublicMind = null;
export function invalidateGuestCache() { _cachedPublicMind = null; }

const FONT = "'Outfit', -apple-system, BlinkMacSystemFont, sans-serif";

export default function GuestScanScreen({ onReady, onBack, prefetchedTargets }) {
  const { lang } = useLanguage();
  const tr = T[lang] || T.en;
  const { colors } = useTheme();
  const [phase, setPhase] = useState("fetching");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const cancelledRef = useRef(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  // Open camera immediately — don't wait for compilation
  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) return;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: false })
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

  // Compilation pipeline — runs while camera is already showing
  useEffect(() => {
    cancelledRef.current = false;
    let mindBlobUrl = null;
    let blobHandedOff = false;

    async function prepare() {
      try {
        setPhase("fetching");
        const publicTargets =
          prefetchedTargets && prefetchedTargets.length > 0
            ? prefetchedTargets
            : await loadPublicTargets();
        if (cancelledRef.current) return;

        if (!publicTargets || publicTargets.length === 0) {
          setErrorMsg("No public AR targets available yet. Check back later!");
          setPhase("error");
          return;
        }

        const fingerprint = publicTargets.map((t) => t.imageUrl).sort().join("|");

        const buildArTargets = (targets) =>
          targets.map((t, i) => ({
            targetIndex: i,
            label: t.label,
            planeWidth: t.planeWidth,
            planeHeight: t.planeHeight,
            planeOffsetY: t.planeOffsetY,
            videoUrl: t.videoUrl,
            targetType: t.targetType || "video",
            urlLink: t.urlLink || "",
          }));

        // 1. Session cache — instant, zero async work
        if (_cachedPublicMind?.key === fingerprint) {
          blobHandedOff = true;
          onReady({ targets: _cachedPublicMind.arTargets, mindFileUrl: _cachedPublicMind.mindBlobUrl });
          return;
        }

        // 2. IndexedDB cache — survives page refreshes
        const idbHit = await getCachedPublicMind(fingerprint);
        if (idbHit && !cancelledRef.current) {
          mindBlobUrl = URL.createObjectURL(
            new Blob([idbHit.mindBuffer], { type: "application/octet-stream" })
          );
          _cachedPublicMind = { key: fingerprint, mindBlobUrl, arTargets: idbHit.arTargets };
          blobHandedOff = true;
          onReady({ targets: idbHit.arTargets, mindFileUrl: mindBlobUrl });
          return;
        }
        if (cancelledRef.current) return;

        setPhase("compiling");

        // 3. Pre-built .mind in R2 — no compilation needed, just download
        try {
          const fpRes = await fetch(`${R2_PUBLIC_URL}/public/combined-fingerprint.txt`, { cache: "no-cache" });
          if (fpRes.ok) {
            const storedFp = (await fpRes.text()).trim();
            if (storedFp === fingerprint) {
              const mindRes = await fetch(`${R2_PUBLIC_URL}/public/combined.mind`);
              if (mindRes.ok && !cancelledRef.current) {
                const mindBuffer = await mindRes.arrayBuffer();
                if (!cancelledRef.current) {
                  mindBlobUrl = URL.createObjectURL(
                    new Blob([mindBuffer], { type: "application/octet-stream" })
                  );
                  const arTargets = buildArTargets(publicTargets);
                  setCachedPublicMind(fingerprint, mindBuffer, arTargets).catch(() => {});
                  _cachedPublicMind = { key: fingerprint, mindBlobUrl, arTargets };
                  blobHandedOff = true;
                  onReady({ targets: arTargets, mindFileUrl: mindBlobUrl });
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
        const imageElements = await Promise.all(
          publicTargets.map(
            (t) =>
              new Promise((resolve, reject) => {
                if (!t.imageUrl) { reject(new Error()); return; }
                const img = new Image();
                img.crossOrigin = "anonymous";
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error());
                img.src = t.imageUrl;
              })
          )
        );
        if (cancelledRef.current) return;

        if (!window.MINDAR?.IMAGE?.Compiler) {
          await import("https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image.prod.js");
        }
        if (!window.MINDAR?.IMAGE?.Compiler) {
          throw new Error("MindAR Compiler failed to load. Check internet connection.");
        }

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
          new Blob([mindBuffer], { type: "application/octet-stream" })
        );
        const arTargets = buildArTargets(publicTargets);

        setCachedPublicMind(fingerprint, mindBuffer, arTargets).catch(() => {});
        _cachedPublicMind = { key: fingerprint, mindBlobUrl, arTargets };
        blobHandedOff = true;
        onReady({ targets: arTargets, mindFileUrl: mindBlobUrl });
      } catch (err) {
        if (cancelledRef.current) return;
        console.error("[GuestScanScreen]", err);
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

  // Error state
  if (phase === "error") {
    return (
      <div style={{ ...s.screen, background: colors.bg }}>
        <button onClick={onBack} style={{ ...s.backBtn, color: colors.textMuted }}>&larr;</button>
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
    const progressPct = phase === "fetching" ? 15 : progress;
    const statusLabel =
      phase === "fetching"
        ? "Finding targets…"
        : `Preparing scanner… ${progress}%`;

    return (
      <div style={s.screen}>
        <video ref={videoRef} autoPlay playsInline muted style={s.cameraVideo} />
        <div style={s.vignette} />
        <button onClick={onBack} style={s.backBtnCamera}>&larr;</button>
        <div style={s.viewfinderWrap}>
          <ViewfinderBrackets />
        </div>
        <div style={s.bottomBar}>
          <p style={s.bottomLabel}>{statusLabel}</p>
          <div style={s.progressTrack}>
            <div style={{ ...s.progressFill, width: progressPct + "%" }} />
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
      <button onClick={onBack} style={{ ...s.backBtn, color: colors.textMuted }}>&larr;</button>
      <div style={s.center}>
        <ScannerIcon />
        <p style={{ ...s.scanLabel, color: colors.textMuted }}>{tr.scanAsGuest}</p>
        <p style={{ ...s.statusText, color: colors.textMuted }}>
          {phase === "fetching" ? tr.findingTargets : tr.preparingScanner + " " + progress + "%"}
        </p>
        <div style={s.progressBar}>
          <div style={{ ...s.progressFill, width: phase === "fetching" ? "15%" : progress + "%" }} />
        </div>
      </div>
    </div>
  );
}

function ViewfinderBrackets() {
  const L = 36;
  const TH = 4;
  const C = "#00C9A7";
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

function ScannerIcon() {
  return (
    <svg width="140" height="140" viewBox="0 0 140 140" fill="none">
      <path d="M10 45 L10 10 L45 10" stroke="white" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M95 10 L130 10 L130 45" stroke="white" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M130 95 L130 130 L95 130" stroke="white" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M45 130 L10 130 L10 95" stroke="white" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="28" y1="70" x2="112" y2="70" stroke="white" strokeWidth="4" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}

const s = {
  screen: { position: "fixed", inset: 0, display: "flex", flexDirection: "column", fontFamily: FONT, overflow: "hidden", background: "#000" },
  cameraVideo: { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" },
  vignette: { position: "absolute", inset: 0, background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.55) 100%)", pointerEvents: "none" },
  backBtnCamera: { position: "absolute", top: 20, left: 20, zIndex: 10, background: "rgba(0,0,0,0.35)", border: "none", borderRadius: "50%", color: "#fff", fontSize: 22, width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" },
  viewfinderWrap: { position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -58%)", width: "65vw", height: "65vw", maxWidth: 280, maxHeight: 280 },
  bottomBar: { position: "absolute", bottom: 0, left: 0, right: 0, padding: "20px 28px 36px", background: "linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%)", zIndex: 10 },
  bottomLabel: { margin: "0 0 10px", fontSize: 13, color: "rgba(255,255,255,0.85)", fontFamily: FONT, letterSpacing: "0.04em", textAlign: "center" },
  progressTrack: { width: "100%", height: 3, borderRadius: 2, background: "rgba(255,255,255,0.15)", overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 2, background: "linear-gradient(90deg, #00C9A7, #00E5CC)", transition: "width 0.3s ease" },
  watermark: { position: "absolute", right: -60, top: "5%", width: "80vw", maxWidth: 360, opacity: 0.07, pointerEvents: "none" },
  watermarkImg: { width: "100%", filter: "brightness(0) invert(1)" },
  backBtn: { position: "absolute", top: 20, left: 20, background: "transparent", border: "none", fontSize: 26, cursor: "pointer", padding: "6px 10px", zIndex: 2 },
  center: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "20px 40px" },
  scanLabel: { fontSize: 14, letterSpacing: "0.2em", fontFamily: FONT, margin: "20px 0 8px" },
  statusText: { fontSize: 13, fontFamily: FONT, margin: "0 0 20px", textAlign: "center" },
  progressBar: { width: "100%", maxWidth: 240, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.1)", overflow: "hidden" },
  errorIcon: { width: 64, height: 64, borderRadius: "50%", background: "rgba(255,80,80,0.15)", border: "2px solid rgba(255,80,80,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, color: "#ff8080", marginBottom: 16 },
  errorText: { fontSize: 15, color: "rgba(255,255,255,0.7)", fontFamily: FONT, textAlign: "center", marginBottom: 24 },
  retryBtn: { background: "transparent", border: "1.5px solid rgba(255,255,255,0.35)", borderRadius: 50, color: "#ffffff", fontSize: 15, fontFamily: FONT, padding: "14px 32px", cursor: "pointer" },
};
