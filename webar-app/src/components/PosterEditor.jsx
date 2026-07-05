import { useState, useRef, useEffect, useCallback } from 'react';
import { API_BASE } from '../config/api.js';

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const TEAL = "#00C9A7";
const GOLD = "#C9A84C";

const TEXT_COLORS = ['#ffffff', TEAL, GOLD, '#FF6B6B', '#111111'];
const LOGO_CORNERS = [
  { id: 'tl', label: '↖' }, { id: 'tr', label: '↗' },
  { id: 'bl', label: '↙' }, { id: 'br', label: '↘' },
];
const LOGO_SIZES = { small: 0.14, medium: 0.22, large: 0.32 };

// Samples the generated artwork itself to pick a sensible default text color (white
// on a dark poster, near-black on a light one) and a matching accent swatch pulled
// from the image's own most vivid color — so the overlay reads well and feels like
// part of the poster instead of a generic fixed palette, no matter what AI style/
// occasion the image ends up being. Soft-fails (returns null) on tainted-canvas
// cases (e.g. a cross-origin history image without CORS) — callers keep the
// existing sensible defaults in that case.
function extractThemeColors(img) {
  try {
    const w = 64, h = 64; // downsample for a fast, resolution-independent sample
    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    const ctx = off.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;

    let rSum = 0, gSum = 0, bSum = 0, count = 0;
    let bestSat = -1, domR = 255, domG = 255, domB = 255;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      rSum += r; gSum += g; bSum += b; count++;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const sat = max === 0 ? 0 : (max - min) / max;
      // Prefer vivid, reasonably bright pixels so we don't land on near-black shadow noise
      if (sat > bestSat && max > 90) { bestSat = sat; domR = r; domG = g; domB = b; }
    }
    const luminance = (0.2126 * (rSum / count) + 0.7152 * (gSum / count) + 0.0722 * (bSum / count)) / 255;
    const toHex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
    return {
      isLight: luminance > 0.55,
      accent: `#${toHex(domR)}${toHex(domG)}${toHex(domB)}`,
    };
  } catch {
    return null;
  }
}

// Full-screen viewer + light editor shown immediately after a poster image is
// generated: lets the user tweak the overlaid title/name text and color, drop in
// a logo or photo, then download the flattened PNG or save it to their history.
export default function PosterEditor({ poster, onClose, onSaved }) {
  const canvasRef  = useRef(null);
  const baseImgRef = useRef(null);
  const logoImgRef = useRef(null);

  const [ready, setReady]         = useState(false);
  const [title, setTitle]         = useState(poster.title || '');
  const [name, setName]           = useState(poster.name || '');
  const [textColor, setTextColor] = useState('#ffffff');
  const [themeAccent, setThemeAccent] = useState(null); // color pulled from the artwork itself
  const [textPos, setTextPos]     = useState('bottom'); // 'top' | 'center' | 'bottom'
  const [logoCorner, setLogoCorner] = useState('br');
  const [logoSize, setLogoSize]     = useState('medium');
  const [editingText, setEditingText] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  // Load the base poster image once, then sample it to pick a text color that
  // actually suits this specific poster (light background vs dark) instead of
  // always defaulting to white.
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      baseImgRef.current = img;
      setReady(true);
      const theme = extractThemeColors(img);
      if (theme) {
        setTextColor(theme.isLight ? '#111111' : '#ffffff');
        setThemeAccent(theme.accent);
      }
    };
    img.src = poster.imageBase64 || poster.imageUrl;
  }, [poster.imageBase64, poster.imageUrl]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const base = baseImgRef.current;
    if (!canvas || !base) return;
    canvas.width = base.naturalWidth;
    canvas.height = base.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(base, 0, 0);

    const hasText = title.trim() || name.trim();
    if (hasText) {
      const w = canvas.width, h = canvas.height;
      const bandH = h * 0.34;
      const bandY = textPos === 'top' ? 0 : textPos === 'center' ? (h - bandH) / 2 : h - bandH;
      const grad = ctx.createLinearGradient(0, bandY, 0, bandY + bandH);
      if (textPos === 'center') {
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(0.5, 'rgba(0,0,0,0.55)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
      } else if (textPos === 'top') {
        grad.addColorStop(0, 'rgba(0,0,0,0.65)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
      } else {
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(0,0,0,0.7)');
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, bandY, w, bandH);

      ctx.textAlign = 'center';
      ctx.fillStyle = textColor;
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = w * 0.01;

      const cx = w / 2;
      const titleSize = Math.round(w * 0.075);
      const nameSize  = Math.round(w * 0.045);
      let ty = textPos === 'top' ? bandY + titleSize * 1.3 : bandY + bandH / 2 - nameSize;

      if (title.trim()) {
        ctx.font = `800 ${titleSize}px ${FONT}`;
        wrapText(ctx, title.trim(), cx, ty, w * 0.86, titleSize * 1.15);
        ty += titleSize * 1.4;
      }
      if (name.trim()) {
        ctx.font = `700 ${nameSize}px ${FONT}`;
        ctx.fillStyle = textColor === '#ffffff' ? GOLD : textColor;
        wrapText(ctx, name.trim(), cx, ty, w * 0.8, nameSize * 1.2);
      }
      ctx.shadowBlur = 0;
    }

    const logo = logoImgRef.current;
    if (logo) {
      const w = canvas.width, h = canvas.height;
      const pad = w * 0.04;
      const logoW = w * LOGO_SIZES[logoSize];
      const logoH = logoW * (logo.naturalHeight / logo.naturalWidth);
      const x = logoCorner.includes('l') ? pad : w - logoW - pad;
      const y = logoCorner.includes('t') ? pad : h - logoH - pad;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = w * 0.015;
      ctx.drawImage(logo, x, y, logoW, logoH);
      ctx.restore();
    }
  }, [title, name, textColor, textPos, logoCorner, logoSize]);

  useEffect(() => { if (ready) draw(); }, [ready, draw]);

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => { logoImgRef.current = img; draw(); };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const removeLogo = () => { logoImgRef.current = null; draw(); };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `memoera-poster-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  const handleSave = async () => {
    const token = localStorage.getItem('memoera_token');
    if (!token) { setSaveMsg('Please sign in to save to My Posters.'); return; }
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaving(true); setSaveMsg('');
    try {
      const imageBase64 = canvas.toDataURL('image/png');
      const res = await fetch(`${API_BASE}/api/poster/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({
          title: title.trim() || poster.title || 'Poster',
          name: name.trim(),
          colors: { primary: textColor },
          imageBase64,
        }),
      });
      if (!res.ok) { setSaveMsg('Failed to save. Please try again.'); return; }
      setSaveMsg('✓ Saved to My Posters!');
      onSaved?.();
    } catch {
      setSaveMsg('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={st.overlay}>
      <div style={st.canvasWrap}>
        {!ready && <div style={st.loadingText}>Loading…</div>}
        <canvas ref={canvasRef} style={{ ...st.canvas, opacity: ready ? 1 : 0 }} />
      </div>

      <button onClick={onClose} style={st.closeBtn}>✕</button>

      <div style={st.panel}>
        {editingText ? (
          <div style={st.editRow}>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title"
              style={st.textInput} maxLength={40} />
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Name"
              style={st.textInput} maxLength={30} />
          </div>
        ) : null}

        <div style={st.controlsRow}>
          <button onClick={() => setEditingText(v => !v)} style={st.chipBtn}>✏️ Text</button>

          <label style={st.chipBtn}>
            🖼 Logo/Photo
            <input type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} />
          </label>
          {logoImgRef.current && (
            <button onClick={removeLogo} style={{ ...st.chipBtn, color: '#FF6B6B' }}>✕ Logo</button>
          )}
        </div>

        {editingText && (
          <div style={st.controlsRow}>
            <span style={st.miniLabel}>Position:</span>
            {['top', 'center', 'bottom'].map(p => (
              <button key={p} onClick={() => setTextPos(p)}
                style={{ ...st.miniBtn, ...(textPos === p ? st.miniBtnActive : {}) }}>{p}</button>
            ))}
          </div>
        )}

        {editingText && (
          <div style={st.controlsRow}>
            <span style={st.miniLabel}>Color:</span>
            {themeAccent && (
              <button onClick={() => setTextColor(themeAccent)} title="Matched from your poster's own colors" style={{
                width: 24, height: 24, borderRadius: '50%', background: themeAccent, cursor: 'pointer',
                border: textColor === themeAccent ? `2px solid ${TEAL}` : '2px solid #fff',
                boxShadow: '0 0 0 1px rgba(0,0,0,0.3)',
              }} />
            )}
            {TEXT_COLORS.map(c => (
              <button key={c} onClick={() => setTextColor(c)} style={{
                width: 24, height: 24, borderRadius: '50%', background: c, cursor: 'pointer',
                border: textColor === c ? `2px solid ${TEAL}` : '1px solid rgba(255,255,255,0.3)',
              }} />
            ))}
            {themeAccent && <span style={{ ...st.miniLabel, fontSize: 10 }}>← from your poster</span>}
          </div>
        )}

        {logoImgRef.current && (
          <div style={st.controlsRow}>
            <span style={st.miniLabel}>Corner:</span>
            {LOGO_CORNERS.map(c => (
              <button key={c.id} onClick={() => setLogoCorner(c.id)}
                style={{ ...st.miniBtn, ...(logoCorner === c.id ? st.miniBtnActive : {}) }}>{c.label}</button>
            ))}
            <span style={{ ...st.miniLabel, marginLeft: 8 }}>Size:</span>
            {Object.keys(LOGO_SIZES).map(sz => (
              <button key={sz} onClick={() => setLogoSize(sz)}
                style={{ ...st.miniBtn, ...(logoSize === sz ? st.miniBtnActive : {}) }}>{sz[0].toUpperCase()}</button>
            ))}
          </div>
        )}

        {saveMsg && <p style={st.saveMsg}>{saveMsg}</p>}

        <div style={st.actionRow}>
          <button onClick={handleDownload} style={st.downloadBtn}>⬇ Download</button>
          <button onClick={handleSave} disabled={saving} style={{ ...st.saveBtn, opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : '💾 Save to My Posters'}
          </button>
        </div>
      </div>
    </div>
  );
}

function wrapText(ctx, text, cx, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  const lines = [];
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  const startY = y - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((l, i) => ctx.fillText(l, cx, startY + i * lineHeight));
}

const st = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 9999, background: '#000',
    display: 'flex', flexDirection: 'column',
  },
  canvasWrap: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', position: 'relative', minHeight: 0,
  },
  canvas: { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', transition: 'opacity 0.2s ease' },
  loadingText: { position: 'absolute', color: 'rgba(255,255,255,0.6)', fontFamily: FONT, fontSize: 13 },
  closeBtn: {
    position: 'absolute', top: 16, right: 16, zIndex: 2,
    width: 36, height: 36, borderRadius: '50%', border: 'none',
    background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 16, cursor: 'pointer',
  },
  panel: {
    flexShrink: 0, background: 'rgba(10,10,14,0.96)', borderTop: `1px solid ${TEAL}33`,
    padding: '12px 16px calc(16px + env(safe-area-inset-bottom))',
    display: 'flex', flexDirection: 'column', gap: 10,
  },
  editRow: { display: 'flex', gap: 8 },
  textInput: {
    flex: 1, border: `1px solid ${TEAL}44`, borderRadius: 10, background: 'rgba(255,255,255,0.06)',
    color: '#fff', fontSize: 13, fontFamily: FONT, padding: '9px 12px', outline: 'none',
  },
  controlsRow: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  miniLabel: { fontSize: 11, color: 'rgba(255,255,255,0.5)', fontFamily: FONT },
  chipBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer',
    background: 'rgba(0,201,167,0.12)', border: `1px solid ${TEAL}55`, borderRadius: 20,
    color: TEAL, fontSize: 12, fontFamily: FONT, padding: '7px 13px',
  },
  miniBtn: {
    border: `1px solid rgba(255,255,255,0.2)`, borderRadius: 16, background: 'transparent',
    color: 'rgba(255,255,255,0.7)', fontSize: 11, fontFamily: FONT, padding: '5px 10px', cursor: 'pointer',
    textTransform: 'capitalize',
  },
  miniBtnActive: { border: `1px solid ${TEAL}`, color: TEAL, background: 'rgba(0,201,167,0.12)' },
  saveMsg: { fontSize: 12, color: TEAL, fontFamily: FONT, margin: 0, textAlign: 'center' },
  actionRow: { display: 'flex', gap: 10 },
  downloadBtn: {
    flex: 1, background: 'transparent', border: `1.5px solid ${TEAL}`, borderRadius: 50,
    color: TEAL, fontSize: 13, fontWeight: 700, fontFamily: FONT, padding: '12px', cursor: 'pointer',
  },
  saveBtn: {
    flex: 1, background: `linear-gradient(135deg,${TEAL},#00E5CC)`, border: 'none', borderRadius: 50,
    color: '#040D0B', fontSize: 13, fontWeight: 700, fontFamily: FONT, padding: '12px', cursor: 'pointer',
  },
};
