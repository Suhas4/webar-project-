import { useState, useEffect } from "react";
import { loadTargets, clearTargets, saveTargets } from "../hooks/useArStorage.js";
import { loadAnimationById, deleteAnimation } from "../hooks/usePhotoAnimations.js";
import { loadMindARCompiler } from "../hooks/loadMindARCompiler.js";
import { rebuildPublicMindInBackground } from "../utils/rebuildPublicMind.js";
import { invalidateGuestCache } from "./GuestScanScreen.jsx";
import { invalidateBackgroundPublicCompile } from "../hooks/backgroundCompilePublic.js";
import ARGlbScreen from "./ARGlbScreen.jsx";
import UserAnimationViewer from "./UserAnimationViewer.jsx";
import { useLanguage } from "../context/LanguageContext.jsx";
import { T } from "../config/translations.js";
import { useTheme } from "../context/ThemeContext.jsx";

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const TEAL = "#00C9A7";
const GOLD = "#C9A84C";

function formatUploadDate(iso) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    const date = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    const time = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
    return `${date}  ${time}`;
  } catch { return null; }
}

export default function GalleryScreen({ onBack, onCollection }) {
  const [targets, setTargets]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [deleting, setDeleting]     = useState(false);
  const [fixing, setFixing]         = useState(false);
  const [fixStatus, setFixStatus]   = useState('');
  const [playingVideo, setPlayingVideo] = useState(null);
  const [playingImage, setPlayingImage] = useState(null);
  const [viewing3D, setViewing3D]   = useState(null);
  const [viewingAnim, setViewingAnim] = useState(null);
  const [animLoading, setAnimLoading] = useState(null); // target index being loaded
  const { lang }   = useLanguage();
  const tr         = { ...T.en, ...(T[lang] || {}) };
  const { colors } = useTheme();

  useEffect(() => {
    loadTargets().then(({ targets: t }) => {
      setTargets(t || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleDeleteAll = async () => {
    if (!window.confirm(`Delete all ${targets.length} target${targets.length !== 1 ? 's' : ''}? This cannot be undone.`)) return;
    setDeleting(true);
    try { await clearTargets(); setTargets([]); } catch {}
    setDeleting(false);
  };

  // Removes targets with no saved photo (which can never scan) by rebuilding
  // everything else fresh. Safety order: fetch + verify every working
  // target's existing assets and successfully recompile a new .mind file
  // BEFORE touching the server at all. Only once that's fully proven to work
  // do we delete-all and immediately re-upload the good ones — if anything
  // fails before that point, nothing on the server is touched.
  const handleAutoFixBroken = async () => {
    const broken = targets.filter((t) => !t._imagePreviewUrl);
    const good   = targets.filter((t) => !!t._imagePreviewUrl);
    if (!broken.length) return;

    if (!window.confirm(
      `This will remove ${broken.length} broken target${broken.length !== 1 ? 's' : ''} with no saved photo, and automatically re-create your other ${good.length} working target${good.length !== 1 ? 's' : ''} from their existing photos/videos.\n\n` +
      `Nothing is deleted until every working target's data is re-fetched and verified successfully. Continue?`
    )) return;

    setFixing(true);
    try {
      setFixStatus('Fetching your existing photos & videos…');
      const groups = { video: [], glbOrDoc: [], url: [], animation: [] };
      for (const t of good) {
        if (t.targetType === 'glb' || t.targetType === 'document') groups.glbOrDoc.push(t);
        else if (t.targetType === 'url') groups.url.push(t);
        else if (t.targetType === 'animation') groups.animation.push(t);
        else groups.video.push(t);
      }

      async function fetchBlob(url, label) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to fetch existing file for "${label}" (HTTP ${res.status})`);
        return res.blob();
      }

      // Animation frames live only in this device's IndexedDB (never on the
      // server) — clearTargets() doesn't touch that storage at all, so the
      // existing animation data survives untouched. Just verify it's still
      // actually there before trusting it, same "prove it first" rule as
      // every other type.
      for (const t of groups.animation) {
        const anim = await loadAnimationById(t.urlLink).catch(() => null);
        if (!anim?.frames?.length) {
          throw new Error(`Could not find the saved animation frames for "${t.label}" on this device — it may have been created on a different device/browser. Auto-fix can't rebuild this one; remove it manually instead.`);
        }
      }

      // Phase 1: fetch + compile everything. Throws (aborts, touches nothing
      // on the server) if any single fetch or compile step fails.
      await loadMindARCompiler();
      const prepared = []; // { isPublic, targetsMeta, mindBuffer, videoBlobs, imageBlobs, glbBlobs }

      for (const [kind, list] of Object.entries(groups)) {
        if (!list.length) continue;
        // Group further by public/private — saveTargets() saves one visibility at a time.
        const byVisibility = { public: list.filter((t) => t.isPublic), private: list.filter((t) => !t.isPublic) };
        for (const [visKey, items] of Object.entries(byVisibility)) {
          if (!items.length) continue;
          const isPublic = visKey === 'public';

          const imageBlobs = [];
          const videoBlobs = kind === 'video' ? [] : null;
          const glbBlobs    = kind === 'glbOrDoc' ? [] : null;

          for (const t of items) {
            imageBlobs.push(await fetchBlob(t._imagePreviewUrl, t.label));
            if (kind === 'video') {
              videoBlobs.push(await fetchBlob(t.videoUrl, t.label));
            } else if (kind === 'glbOrDoc') {
              const blob = await fetchBlob(t.urlLink, t.label);
              const ext = (t.urlLink.split('?')[0].split('.').pop() || 'glb').toLowerCase();
              blob.name = `${t.label || 'target'}.${ext}`;
              glbBlobs.push(blob);
            }
          }

          setFixStatus('Recompiling AR data…');
          const imageElements = await Promise.all(imageBlobs.map((blob) => new Promise((resolve, reject) => {
            const url = URL.createObjectURL(blob);
            const img = new Image();
            img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to decode a re-fetched image')); };
            img.src = url;
          })));
          const compiler = new window.MINDAR.IMAGE.Compiler();
          await compiler.compileImageTargets(imageElements, null);
          const mindBuffer = await compiler.exportData();

          const targetsMeta = items.map((t) => ({
            label: t.label,
            planeWidth: t.planeWidth,
            planeHeight: t.planeHeight,
            planeOffsetY: t.planeOffsetY,
            targetType: t.targetType || 'video',
            urlLink: (kind === 'url' || kind === 'animation') ? (t.urlLink || '') : '',
          }));

          prepared.push({ isPublic, targetsMeta, mindBuffer, videoBlobs, imageBlobs, glbBlobs });
        }
      }

      // Phase 2: everything above succeeded — now, and only now, touch the server.
      setFixStatus('Removing broken targets…');
      await clearTargets();

      setFixStatus('Re-uploading your working targets…');
      for (const group of prepared) {
        await saveTargets(group.targetsMeta, group.mindBuffer, group.videoBlobs, group.imageBlobs, () => {}, group.isPublic, group.glbBlobs);
        if (group.isPublic) rebuildPublicMindInBackground();
      }

      invalidateGuestCache();
      invalidateBackgroundPublicCompile();

      const { targets: fresh } = await loadTargets();
      setTargets(fresh || []);
      setFixStatus('');
      window.alert(`Done — removed ${broken.length} broken target${broken.length !== 1 ? 's' : ''}, your other ${good.length} target${good.length !== 1 ? 's' : ''} ${good.length !== 1 ? 'are' : 'is'} working again.`);
    } catch (err) {
      setFixStatus('');
      window.alert('Could not auto-fix safely — nothing was changed. ' + (err.message || 'Please try again.'));
    } finally {
      setFixing(false);
    }
  };

  if (viewing3D) return <ARGlbScreen glbUrl={viewing3D} onBack={() => setViewing3D(null)} />;

  if (viewingAnim) {
    return (
      <UserAnimationViewer
        title={viewingAnim.name}
        frames={viewingAnim.frames}
        onBack={() => setViewingAnim(null)}
        onDelete={async () => {
          await deleteAnimation(viewingAnim.id).catch(() => {});
          setViewingAnim(null);
        }}
      />
    );
  }

  if (playingVideo) {
    return (
      <div style={s.videoScreen}>
        <button onClick={() => setPlayingVideo(null)} style={s.closeBtn}>← Back</button>
        <video src={playingVideo} autoPlay controls playsInline style={s.fullVideo} />
      </div>
    );
  }

  if (playingImage) {
    return (
      <div style={s.imageScreen}>
        <button onClick={() => setPlayingImage(null)} style={s.closeBtn}>← Back</button>
        <div style={s.imageZoomWrap}>
          <img src={playingImage} alt="Target" style={s.fullImage} />
        </div>
        <p style={s.imageCaption}>Target Image — Point your camera at this to trigger AR</p>
      </div>
    );
  }

  return (
    <div style={{ ...s.screen, background: colors.bg }}>
      {/* Header */}
      <div style={s.header}>
        <button onClick={onBack} style={{ ...s.backBtn, color: colors.textMuted }}>← Back</button>
        <h2 style={{ ...s.title, color: colors.text }}>{tr.galleryTitle || "Gallery"}</h2>
        <span style={{ ...s.count, color: colors.textMuted }}>
          {loading ? "" : `${targets.length} target${targets.length !== 1 ? "s" : ""}`}
        </span>
        {!loading && targets.length > 0 && (
          <button onClick={handleDeleteAll} disabled={deleting}
            style={{ ...s.deleteAllBtn, opacity: deleting ? 0.6 : 1 }}>
            {deleting ? "Deleting..." : "Delete All"}
          </button>
        )}
      </div>

      {!loading && targets.some((t) => !t._imagePreviewUrl) && (
        <div style={{ margin: "0 16px 12px", padding: "10px 14px", borderRadius: 12,
          background: "rgba(255,128,128,0.08)", border: "1px solid rgba(255,128,128,0.3)",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "#FF6B6B", fontFamily: FONT, fontWeight: 600 }}>
            {fixing ? (fixStatus || "Fixing…") : "⚠️ Some targets have no saved photo and won't scan"}
          </span>
          {!fixing && (
            <button onClick={handleAutoFixBroken}
              style={{ background: "#FF6B6B", border: "none", borderRadius: 50, color: "#1a0000",
                fontSize: 11, fontWeight: 700, fontFamily: FONT, padding: "6px 14px", cursor: "pointer" }}>
              🔧 Auto-Fix Now
            </button>
          )}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div style={{ ...s.empty, color: colors.textMuted }}>Loading...</div>
      ) : targets.length === 0 ? (
        <div style={{ ...s.empty, color: colors.textMuted, flexDirection: "column", gap: 10 }}>
          <span style={{ fontSize: 40 }}>📭</span>
          <span>{tr.noTargets || "No targets uploaded yet."}</span>
        </div>
      ) : (
        <div style={s.list}>
          {targets.map((t, i) => {
            const uploadDate = formatUploadDate(t.createdAt);
            return (
              <div key={i} style={{ ...s.card, background: colors.cardBg || colors.surface, border: `1px solid ${colors.border}` }}>

                {/* Photo thumbnail — tap to view fullscreen */}
                {t._imagePreviewUrl ? (
                  <div style={s.thumbWrap} onClick={() => setPlayingImage(t._imagePreviewUrl)}>
                    <img src={t._imagePreviewUrl} style={s.thumb} alt={t.label} loading="lazy" decoding="async" />
                    <div style={s.thumbOverlay}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                      </svg>
                    </div>
                  </div>
                ) : (
                  <div style={{ ...s.thumbPlaceholder, background: colors.surface }}>
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
                      <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                    </svg>
                  </div>
                )}

                {/* Info */}
                <div style={s.info}>
                  <div style={s.labelRow}>
                    <span style={s.numBadge}>Target {i + 1}</span>
                    {t.label && t.label !== `Target ${i + 1}` && (
                      <span style={{ ...s.label, color: colors.text }}>{t.label}</span>
                    )}
                  </div>
                  <div style={s.pillRow}>
                    <span style={{
                      ...s.pill,
                      background: t.targetType === "url" || t.targetType === "document" ? "rgba(201,168,76,0.15)" : "rgba(0,201,167,0.12)",
                      color: t.targetType === "url" || t.targetType === "document" ? GOLD : TEAL,
                      borderColor: t.targetType === "url" || t.targetType === "document" ? GOLD + "55" : TEAL + "55",
                    }}>
                      {t.targetType === "url" ? "URL Link" : t.targetType === "glb" ? "3D Model" : t.targetType === "animation" ? "Animation" : t.targetType === "document" ? "Document" : "Video"}
                    </span>
                    {t.isPublic && (
                      <span style={{ ...s.pill, background: "rgba(255,255,255,0.07)", color: colors.textMuted, borderColor: colors.border }}>
                        Public
                      </span>
                    )}
                  </div>
                  {!t._imagePreviewUrl && (
                    <div style={{ fontSize: 10.5, fontFamily: FONT, color: "#FF6B6B", marginTop: 5, fontWeight: 600, maxWidth: 220 }}>
                      ⚠️ No photo saved — delete and re-upload this target, it won't scan
                    </div>
                  )}
                  {uploadDate && (
                    <span style={{ fontSize: 11, fontFamily: FONT, color: TEAL, marginTop: 4, display: "block", fontWeight: 500 }}>
                      {uploadDate}
                    </span>
                  )}
                </div>

                {/* Action button */}
                <div style={s.actionCol}>
                  {t.targetType === "glb" && t.urlLink && (
                    <button style={s.actionBtn} onClick={() => setViewing3D(t.urlLink)}>🧊</button>
                  )}
                  {t.videoUrl && t.targetType !== "glb" && t.targetType !== "animation" && t.targetType !== "document" && (
                    <button style={s.actionBtn} onClick={() => setPlayingVideo(t.videoUrl)}>▶</button>
                  )}
                  {t.targetType === "url" && t.urlLink && (
                    <button style={{ ...s.actionBtn, background: "rgba(201,168,76,0.12)", borderColor: GOLD + "55", color: GOLD }}
                      onClick={() => window.open(t.urlLink, "_blank")}>🔗</button>
                  )}
                  {t.targetType === "document" && t.urlLink && (
                    <button style={{ ...s.actionBtn, background: "rgba(201,168,76,0.12)", borderColor: GOLD + "55", color: GOLD }}
                      onClick={() => window.open(t.urlLink, "_blank", "noopener")}>📄</button>
                  )}
                  {t.targetType === "animation" && t.urlLink && (
                    <button
                      style={{ ...s.actionBtn, background: "rgba(0,201,167,0.13)", borderColor: TEAL + "66",
                        color: TEAL, fontSize: 22, opacity: animLoading === i ? 0.5 : 1 }}
                      disabled={animLoading === i}
                      onClick={async () => {
                        setAnimLoading(i);
                        const anim = await loadAnimationById(t.urlLink).catch(() => null);
                        setAnimLoading(null);
                        if (anim) setViewingAnim(anim);
                        else alert('Animation not found. It may have been created on a different device or browser.');
                      }}>
                      {animLoading === i ? "⏳" : "🎞️"}
                    </button>
                  )}
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* Ad Banner */}
      <div style={{ flexShrink: 0, borderTop: `1px solid ${colors.border}`, padding: "10px 16px",
        display: "flex", alignItems: "center", gap: 12, background: colors.cardBg || colors.surface }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: colors.textMuted,
          fontFamily: FONT, background: colors.surface, borderRadius: 4, padding: "2px 6px", flexShrink: 0, border: `1px solid ${colors.border}` }}>AD</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: colors.text, fontFamily: FONT, lineHeight: 1.3 }}>
            Memoera Premium — Unlock 2 GB Storage
          </div>
          <div style={{ fontSize: 11, color: colors.textMuted, fontFamily: FONT, marginTop: 1 }}>
            No ads · Priority AR processing · From ₹99/month
          </div>
        </div>
        <button style={{ background: `linear-gradient(135deg,${TEAL},#00E5CC)`, border: "none", borderRadius: 20,
          color: "#040D0B", fontSize: 11, fontWeight: 700, fontFamily: FONT, padding: "7px 14px",
          cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" }}>Upgrade</button>
      </div>

      {/* Photo Animation — floating shortcut, bottom-right */}
      {onCollection && (
        <button onClick={onCollection} title="Photo Animation" style={{
          position: "fixed", right: 18, bottom: 86, zIndex: 30,
          width: 56, height: 56, borderRadius: "50%", border: "none",
          background: `linear-gradient(135deg,${TEAL} 0%,#00E5CC 100%)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 6px 20px rgba(0,201,167,0.45)", cursor: "pointer",
        }}>
          <FilmIcon size={24} color="#fff" />
        </button>
      )}
    </div>
  );
}

function FilmIcon({ size = 22, color = '#fff' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="2.18"/>
      <line x1="7" y1="2" x2="7" y2="22"/>
      <line x1="17" y1="2" x2="17" y2="22"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
      <line x1="2" y1="7" x2="7" y2="7"/>
      <line x1="2" y1="17" x2="7" y2="17"/>
      <line x1="17" y1="17" x2="22" y2="17"/>
      <line x1="17" y1="7" x2="22" y2="7"/>
    </svg>
  );
}

const s = {
  screen:   { position: "fixed", inset: 0, display: "flex", flexDirection: "column", fontFamily: FONT, overflow: "hidden" },
  header:   { display: "flex", alignItems: "center", gap: 10, padding: "48px 20px 14px", flexShrink: 0 },
  backBtn:  { background: "transparent", border: "none", fontSize: 14, fontWeight: 600, fontFamily: FONT, cursor: "pointer", padding: "4px 0" },
  title:    { fontSize: 22, fontWeight: 700, margin: 0, flex: 1 },
  count:    { fontSize: 13, fontFamily: FONT },
  deleteAllBtn: { background: "rgba(220,50,50,0.12)", border: "1px solid rgba(220,50,50,0.35)", borderRadius: 20, color: "#FF6B6B", fontSize: 12, fontWeight: 600, fontFamily: FONT, padding: "6px 14px", cursor: "pointer" },
  empty:    { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontFamily: FONT, padding: 40 },
  list:     { flex: 1, overflowY: "auto", padding: "0 16px 20px", display: "flex", flexDirection: "column", gap: 12 },

  card:     { borderRadius: 18, overflow: "hidden", display: "flex", alignItems: "center", gap: 12, padding: "14px 16px",
              boxShadow: "0 2px 10px rgba(0,0,0,0.10)" },

  thumbWrap:       { position: "relative", width: 72, height: 72, flexShrink: 0, cursor: "pointer", borderRadius: 12, overflow: "hidden" },
  thumb:           { width: 72, height: 72, objectFit: "cover", display: "block" },
  thumbOverlay:    { position: "absolute", inset: 0, background: "rgba(0,0,0,0.28)", display: "flex", alignItems: "center", justifyContent: "center" },
  thumbPlaceholder:{ width: 72, height: 72, borderRadius: 12, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" },

  info:     { flex: 1, display: "flex", flexDirection: "column", gap: 5, minWidth: 0 },
  labelRow: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" },
  numBadge: { fontSize: 9, fontWeight: 700, letterSpacing: "0.07em", background: "rgba(0,201,167,0.18)", color: TEAL, borderRadius: 6, padding: "2px 7px", fontFamily: FONT, flexShrink: 0 },
  label:    { fontSize: 14, fontWeight: 700, fontFamily: FONT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  pillRow:  { display: "flex", gap: 6, flexWrap: "wrap" },
  pill:     { fontSize: 10, fontFamily: FONT, fontWeight: 600, borderRadius: 20, padding: "2px 9px", border: "1px solid" },

  actionCol:{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 },
  actionBtn:{ background: "rgba(0,201,167,0.15)", border: `1px solid ${TEAL}66`, borderRadius: 10,
              color: TEAL, fontSize: 20, fontFamily: FONT, padding: "10px 14px", cursor: "pointer" },

  videoScreen:  { position: "fixed", inset: 0, background: "#000", display: "flex", flexDirection: "column", zIndex: 1000 },
  imageScreen:  { position: "fixed", inset: 0, background: "#000", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 1000 },
  closeBtn:     { position: "absolute", top: 20, left: 20, zIndex: 10, background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 20, color: "#fff", fontSize: 14, fontFamily: FONT, padding: "8px 18px", cursor: "pointer" },
  fullVideo:    { width: "100%", height: "100%", objectFit: "contain" },
  imageZoomWrap:{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, boxSizing: "border-box" },
  fullImage:    { maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 12 },
  imageCaption: { position: "absolute", bottom: 32, left: 0, right: 0, textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.4)", fontFamily: FONT, padding: "0 24px" },
};
