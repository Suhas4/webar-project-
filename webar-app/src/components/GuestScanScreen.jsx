import { useState, useEffect, useRef } from "react";
import { loadPublicTargets } from "../hooks/useArStorage.js";
import { useLanguage } from "../context/LanguageContext.jsx";
import { T } from "../config/translations.js";
import { useTheme } from "../context/ThemeContext.jsx";

// Session-level cache: skip recompiling if public targets haven't changed
let _cachedPublicMind = null; // { key: string, mindBlobUrl: string, arTargets: array }
export function invalidateGuestCache() { _cachedPublicMind = null; }

const FONT = "'Outfit', -apple-system, BlinkMacSystemFont, sans-serif";
const BG = "linear-gradient(160deg, #061A1F 0%, #0A2229 50%, #061820 100%)";

export default function GuestScanScreen({ onReady, onBack, prefetchedTargets }) {
  const { lang } = useLanguage();
  const tr = T[lang] || T.en;
  const { colors } = useTheme();
  const [phase, setPhase] = useState("fetching"); // fetching | compiling | error
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    let mindBlobUrl = null;
    // Track whether the blob was handed off to the AR system.
    // If it was, we must NOT revoke it here — App.jsx's activeBlobUrlsRef handles cleanup.
    let blobHandedOff = false;

    async function prepare() {
      try {
        setPhase("fetching");
        const publicTargets = prefetchedTargets && prefetchedTargets.length > 0
          ? prefetchedTargets
          : await loadPublicTargets();
        if (cancelledRef.current) return;

        if (!publicTargets || publicTargets.length === 0) {
          setErrorMsg("No public AR targets available yet. Check back later!");
          setPhase("error");
          return;
        }

        // Build a cache key from the image URLs — if unchanged, skip recompiling
        const cacheKey = publicTargets.map(t => t.imageUrl).sort().join('|');
        if (_cachedPublicMind && _cachedPublicMind.key === cacheKey) {
          blobHandedOff = true;
          onReady({ targets: _cachedPublicMind.arTargets, mindFileUrl: _cachedPublicMind.mindBlobUrl });
          return;
        }

        setPhase("compiling");

        // Download all marker images as HTMLImageElement
        const imageElements = await Promise.all(
          publicTargets.map((t, i) => new Promise((resolve, reject) => {
            if (!t.imageUrl) { reject(new Error()); return; }
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error());
            img.src = t.imageUrl;
          }))
        );
        if (cancelledRef.current) return;

        // Load MindAR compiler
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
        const mindBlob = new Blob([mindBuffer], { type: "application/octet-stream" });
        mindBlobUrl = URL.createObjectURL(mindBlob);

        // Build targets array (re-indexed 0..n-1 to match compiled order)
        const arTargets = publicTargets.map((t, i) => ({
          targetIndex: i,
          label: t.label,
          planeWidth: t.planeWidth,
          planeHeight: t.planeHeight,
          planeOffsetY: t.planeOffsetY,
          videoUrl: t.videoUrl,
          targetType: t.targetType || "video",
          urlLink: t.urlLink || "",
        }));

        // Store in session cache so next scan is instant
        _cachedPublicMind = { key: cacheKey, mindBlobUrl, arTargets };

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
      // Only revoke if the blob was NOT handed to the AR system.
      // If it was handed off, App.jsx's activeBlobUrlsRef owns the cleanup.
      if (mindBlobUrl && !blobHandedOff) URL.revokeObjectURL(mindBlobUrl);
    };
  }, [onReady]);

  return (
    <div style={{ ...s.screen, background: colors.bg }}>
      <div style={s.watermark}>
        <img src="/logo.png" alt="" style={s.watermarkImg} />
      </div>

      <button onClick={onBack} style={{ ...s.backBtn, color: colors.textMuted }}>&larr;</button>

      <div style={s.center}>
        {phase === "error" ? (
          <>
            <div style={s.errorIcon}>!</div>
            <p style={s.errorText}>{errorMsg}</p>
            <button onClick={onBack} style={s.retryBtn}>{tr.back}</button>
          </>
        ) : (
          <>
            <ScannerIcon />
            <p style={{ ...s.scanLabel, color: colors.textMuted }}>{tr.scanAsGuest}</p>
            <p style={{ ...s.statusText, color: colors.textMuted }}>
              {phase === "fetching" ? tr.findingTargets : tr.preparingScanner + " " + progress + "%"}
            </p>
            <div style={s.progressBar}>
              <div style={{ ...s.progressFill, width: phase === "fetching" ? "15%" : progress + "%" }} />
            </div>
          </>
        )}
      </div>
    </div>
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
  screen: { position: "fixed", inset: 0, background: BG, display: "flex", flexDirection: "column", fontFamily: FONT, overflow: "hidden" },
  watermark: { position: "absolute", right: -60, top: "5%", width: "80vw", maxWidth: 360, opacity: 0.07, pointerEvents: "none" },
  watermarkImg: { width: "100%", filter: "brightness(0) invert(1)" },
  backBtn: { position: "absolute", top: 20, left: 20, background: "transparent", border: "none", color: "rgba(255,255,255,0.6)", fontSize: 26, cursor: "pointer", padding: "6px 10px", zIndex: 2 },
  center: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "20px 40px" },
  scanLabel: { fontSize: 14, letterSpacing: "0.2em", color: "rgba(255,255,255,0.7)", fontFamily: FONT, margin: "20px 0 8px" },
  statusText: { fontSize: 13, color: "rgba(255,255,255,0.45)", fontFamily: FONT, margin: "0 0 20px", textAlign: "center" },
  progressBar: { width: "100%", maxWidth: 240, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.1)", overflow: "hidden" },
  progressFill: { height: "100%", background: "linear-gradient(90deg, #00C9A7, #00E5CC)", borderRadius: 2, transition: "width 0.3s ease" },
  errorIcon: { width: 64, height: 64, borderRadius: "50%", background: "rgba(255,80,80,0.15)", border: "2px solid rgba(255,80,80,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, color: "#ff8080", marginBottom: 16 },
  errorText: { fontSize: 15, color: "rgba(255,255,255,0.7)", fontFamily: FONT, textAlign: "center", marginBottom: 24 },
  retryBtn: { background: "transparent", border: "1.5px solid rgba(255,255,255,0.35)", borderRadius: 50, color: "#ffffff", fontSize: 15, fontFamily: FONT, padding: "14px 32px", cursor: "pointer" },
  langSelect: { marginTop: 20, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 20, color: "rgba(255,255,255,0.6)", fontSize: 13, fontFamily: FONT, padding: "6px 14px", cursor: "pointer", outline: "none" },
};
