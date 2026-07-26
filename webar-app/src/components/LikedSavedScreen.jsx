import { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { API_BASE } from '../config/api.js';

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const TEAL = '#00C9A7';

// Shared list screen for both "Liked" and "Saved" scanned AR content —
// identical layout, just a different `kind` fed into the same backend
// endpoint (GET /api/targets/interactions?kind=like|save).
export default function LikedSavedScreen({ kind, onBack }) {
  const { colors } = useTheme();
  const [items, setItems] = useState(null); // null = loading
  const [playing, setPlaying] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('memoera_token') || '';
    fetch(`${API_BASE}/api/targets/interactions?kind=${kind}`, {
      headers: { Authorization: 'Bearer ' + token },
    })
      .then((r) => r.json())
      .then((d) => setItems(d.targets || []))
      .catch(() => setItems([]));
  }, [kind]);

  const title    = kind === 'like' ? 'Liked' : 'Saved';
  const icon     = kind === 'like' ? '♥' : '🔖';
  const emptyMsg = kind === 'like'
    ? "Nothing liked yet — tap the heart on a scanned memory's video to like it."
    : "Nothing saved yet — tap the bookmark on a scanned memory's video to save it.";

  function handleOpen(t) {
    if (t.targetType === 'video' && t.videoUrl) { setPlaying(t); return; }
    if (t.urlLink) { window.open(t.urlLink, '_blank', 'noopener'); return; }
  }

  return (
    <div style={{ ...s.screen, background: colors.bg }}>
      <button onClick={onBack} style={{ ...s.backBtn, color: colors.textMuted }}>← Back</button>

      <div style={s.header}>
        <h1 style={{ ...s.title, color: colors.text }}>{icon} {title}</h1>
      </div>

      <div style={s.list}>
        {items === null ? (
          <p style={{ ...s.hint, color: colors.textMuted }}>Loading…</p>
        ) : items.length === 0 ? (
          <div style={s.emptyWrap}>
            <div style={{ fontSize: 34, marginBottom: 10 }}>{icon}</div>
            <p style={{ ...s.hint, color: colors.textMuted, margin: 0 }}>{emptyMsg}</p>
          </div>
        ) : (
          <div style={s.grid}>
            {items.map((t) => (
              <button key={t.id} onClick={() => handleOpen(t)} style={{ ...s.card, background: colors.surface, border: `1px solid ${colors.border}` }}>
                <div style={s.thumbWrap}>
                  {t.imageUrl
                    ? <img src={t.imageUrl} alt="" style={s.thumb} />
                    : <div style={{ ...s.thumb, ...s.thumbFallback }}>🖼️</div>}
                  {t.targetType === 'video' && <span style={s.playBadge}>▶</span>}
                </div>
                <div style={{ ...s.cardLabel, color: colors.text }}>{t.label}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {playing && (
        <div style={s.playerOverlay} onClick={() => setPlaying(null)}>
          <button onClick={() => setPlaying(null)} style={s.playerClose}>✕ Close</button>
          <video
            src={playing.videoUrl}
            autoPlay loop controls playsInline
            onClick={(e) => e.stopPropagation()}
            style={s.playerVideo}
          />
        </div>
      )}
    </div>
  );
}

const s = {
  screen: { position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', fontFamily: FONT, overflow: 'hidden' },
  backBtn: { position: 'fixed', top: 48, left: 16, background: 'transparent', border: 'none', fontSize: 14, fontWeight: 600, fontFamily: FONT, cursor: 'pointer', padding: '6px 4px', zIndex: 2 },
  header: { padding: '96px 20px 8px', flexShrink: 0 },
  title: { fontSize: 22, fontWeight: 700, fontFamily: FONT, margin: 0 },
  list: { flex: 1, overflowY: 'auto', padding: '8px 16px 40px' },
  hint: { fontSize: 13, fontFamily: FONT, textAlign: 'center', marginTop: 40 },
  emptyWrap: { textAlign: 'center', padding: '48px 24px' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  card: { display: 'flex', flexDirection: 'column', borderRadius: 16, overflow: 'hidden', cursor: 'pointer', padding: 0, textAlign: 'left' },
  thumbWrap: { position: 'relative', width: '100%', aspectRatio: '1 / 1' },
  thumb: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  thumbFallback: { display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, background: 'rgba(128,128,128,0.15)' },
  playBadge: { position: 'absolute', bottom: 8, right: 8, width: 26, height: 26, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 },
  cardLabel: { fontSize: 12.5, fontWeight: 600, fontFamily: FONT, padding: '8px 10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  playerOverlay: { position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  playerClose: { position: 'fixed', top: 48, left: 16, zIndex: 10000, background: 'rgba(0,0,0,0.6)', border: `1px solid ${TEAL}55`, borderRadius: 20, color: '#fff', fontSize: 13, fontWeight: 600, fontFamily: FONT, padding: '8px 16px', cursor: 'pointer' },
  playerVideo: { maxWidth: '92%', maxHeight: '80%', objectFit: 'contain', borderRadius: 12 },
};
