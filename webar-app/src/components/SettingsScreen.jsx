import { useState, useEffect } from 'react';
import { API_BASE } from '../config/api.js';
import { useTheme } from '../context/ThemeContext.jsx';

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const GOLD = "#C9A84C";
const TEAL = "#00C9A7";
const LIMIT = 500 * 1024 * 1024;

function fmtMB(bytes) { return (bytes / (1024 * 1024)).toFixed(1) + ' MB'; }

export default function SettingsScreen({ onBack, onProfile }) {
  const { colors } = useTheme();
  const [storage, setStorage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('memoera_token') || '';
    fetch(API_BASE + '/api/storage', { headers: { Authorization: 'Bearer ' + token } })
      .then(r => r.json())
      .then(d => { setStorage(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const privatePct = storage ? Math.min(100, (storage.privateBytes / LIMIT) * 100) : 0;
  const publicPct  = storage ? Math.min(100, (storage.publicBytes  / LIMIT) * 100) : 0;

  return (
    <div style={{ ...s.screen, background: colors.bg }}>
      <div style={s.header}>
        <button onClick={onBack} style={{ ...s.backBtn, color: colors.textMuted }}>Back</button>
        <h2 style={{ ...s.title, color: colors.text }}>Settings</h2>
      </div>
      <div style={s.content}>
        {/* Profile row */}
        <div style={{ ...s.card, background: colors.surface, border: '1px solid ' + colors.border }}>
          <button style={{ ...s.rowBtn, color: colors.text }} onClick={onProfile}>
            <span>Profile</span>
            <span style={{ fontSize: 14, color: colors.textMuted }}>›</span>
          </button>
        </div>

        {/* Storage accordion */}
        <div style={{ ...s.card, background: colors.surface, border: '1px solid ' + colors.border }}>
          <button style={{ ...s.rowBtn, color: colors.text }} onClick={() => setOpen(o => !o)}>
            <span>Storage</span>
            <span style={{ fontSize: 11, color: colors.textMuted }}>{open ? '▲' : '▼'}</span>
          </button>
          {open && (
            <div style={s.storageBody}>
              {loading ? (
                <p style={{ ...s.hint, color: colors.textMuted }}>Loading…</p>
              ) : !storage ? (
                <p style={{ ...s.hint, color: colors.textMuted }}>Could not load storage info.</p>
              ) : (
                <>
                  <StorageBar label="Private" used={storage.privateBytes} pct={privatePct} colors={colors} color={GOLD} />
                  <StorageBar label="Public"  used={storage.publicBytes}  pct={publicPct}  colors={colors} color={TEAL} />
                  <p style={{ ...s.hint, color: colors.textMuted }}>Limit: 500 MB per type</p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StorageBar({ label, used, pct, colors, color }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 13, color: colors.text, fontFamily: FONT }}>{label}</span>
        <span style={{ fontSize: 12, color: colors.textMuted, fontFamily: FONT }}>{fmtMB(used)} / 500 MB</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: 'rgba(128,128,128,0.2)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: pct + '%', background: color, borderRadius: 4, transition: 'width 0.4s ease' }} />
      </div>
    </div>
  );
}

const s = {
  screen: { position: "fixed", inset: 0, display: "flex", flexDirection: "column", fontFamily: FONT },
  header: { display: "flex", alignItems: "center", gap: 12, padding: "48px 20px 16px" },
  backBtn: { background: "transparent", border: "none", fontSize: 14, fontFamily: FONT, cursor: "pointer" },
  title: { fontSize: 22, fontWeight: 700, margin: 0 },
  content: { flex: 1, padding: "0 20px", overflowY: "auto" },
  card: { borderRadius: 16, padding: "0 18px", marginTop: 8, overflow: 'hidden' },
  rowBtn: { width: '100%', background: 'transparent', border: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', fontSize: 15, fontWeight: 600, fontFamily: FONT, cursor: 'pointer' },
  storageBody: { paddingBottom: 16 },
  hint: { fontSize: 12, fontFamily: FONT, margin: '4px 0 0', textAlign: 'center' },
};
