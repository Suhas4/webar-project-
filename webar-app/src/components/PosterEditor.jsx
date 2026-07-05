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

// Stylized fonts for the title/name overlay — loaded via Google Fonts link in
// index.html. `weight` matches the boldest cut available so the poster text
// reads as a real display face, not a thin fallback.
const FONT_OPTIONS = [
  { id: 'Outfit',           label: 'Clean',    family: '"Outfit", sans-serif',           weight: 800 },
  { id: 'Playfair Display', label: 'Elegant',  family: '"Playfair Display", serif',      weight: 900 },
  { id: 'Bebas Neue',       label: 'Impact',   family: '"Bebas Neue", sans-serif',        weight: 400 },
  { id: 'Pacifico',         label: 'Script',   family: '"Pacifico", cursive',             weight: 400 },
  { id: 'Anton',            label: 'Heavy',    family: '"Anton", sans-serif',             weight: 400 },
  { id: 'Cinzel',           label: 'Engraved', family: '"Cinzel", serif',                 weight: 900 },
];

const FRAME_OPTIONS = [
  { id: 'none',     label: 'None' },
  { id: 'classic',  label: 'Classic' },
  { id: 'gold',     label: 'Gold' },
  { id: 'polaroid', label: 'Polaroid' },
];

function fontById(id) { return FONT_OPTIONS.find(f => f.id === id) || FONT_OPTIONS[0]; }

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

function shadeColor(hex, percent) {
  let h = (hex || '#ffffff').replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const num = parseInt(h, 16) || 0xffffff;
  let r = (num >> 16) & 0xff, g = (num >> 8) & 0xff, b = num & 0xff;
  const target = percent < 0 ? 0 : 255;
  const p = Math.abs(percent);
  r = Math.round((target - r) * p + r);
  g = Math.round((target - g) * p + g);
  b = Math.round((target - b) * p + b);
  return `rgb(${r},${g},${b})`;
}

function computeLines(ctx, text, maxWidth) {
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
  return lines;
}

// Draws wrapped text either flat (with a soft drop shadow) or as an embossed
// pseudo-3D block — several darkening copies stepped diagonally behind the
// final bright fill, the classic canvas "extruded text" trick.
function renderTextBlock(ctx, { text, cx, y, maxWidth, lineHeight, color, is3d }) {
  const lines = computeLines(ctx, text, maxWidth);
  const startY = y - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((l, i) => {
    const ly = startY + i * lineHeight;
    if (is3d) {
      const depth = 7;
      for (let d = depth; d >= 1; d--) {
        ctx.fillStyle = shadeColor(color, -0.55 * (d / depth));
        ctx.fillText(l, cx + d * 0.7, ly + d * 0.7);
      }
      ctx.fillStyle = color;
      ctx.fillText(l, cx, ly);
    } else {
      ctx.fillStyle = color;
      ctx.fillText(l, cx, ly);
    }
  });
  return lines.length;
}

function drawFrame(ctx, w, h, frame) {
  if (frame === 'none') return;
  const pad = w * 0.03;
  if (frame === 'classic') {
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = w * 0.006;
    ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = w * 0.002;
    ctx.strokeRect(pad * 1.8, pad * 1.8, w - pad * 3.6, h - pad * 3.6);
  } else if (frame === 'gold') {
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = w * 0.012;
    ctx.strokeRect(pad * 0.6, pad * 0.6, w - pad * 1.2, h - pad * 1.2);
    const cs = w * 0.055;
    ctx.lineWidth = w * 0.018;
    [
      [pad * 0.6, pad * 0.6, 1, 1], [w - pad * 0.6, pad * 0.6, -1, 1],
      [pad * 0.6, h - pad * 0.6, 1, -1], [w - pad * 0.6, h - pad * 0.6, -1, -1],
    ].forEach(([x, y, sx, sy]) => {
      ctx.beginPath();
      ctx.moveTo(x, y + cs * sy);
      ctx.lineTo(x, y);
      ctx.lineTo(x + cs * sx, y);
      ctx.stroke();
    });
  } else if (frame === 'polaroid') {
    const border = w * 0.045;
    const bottomExtra = h * 0.09;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, border);
    ctx.fillRect(0, 0, border, h);
    ctx.fillRect(w - border, 0, border, h);
    ctx.fillRect(0, h - border - bottomExtra, w, border + bottomExtra);
  }
}

const initialEdit = (poster) => ({
  title: poster.title || '',
  name: poster.name || '',
  textColor: '#ffffff',
  textPos: 'bottom',
  font: 'Outfit',
  text3d: false,
  frame: 'none',
});

// Full-screen viewer + editor shown immediately after a poster image is generated:
// lets the user tweak the overlaid title/name text (font, color, 3D style, position),
// pick a frame, drop in a logo or photo, undo/redo any of it, regenerate a fresh
// AI variation, then download the flattened PNG or save it to their history.
export default function PosterEditor({ poster, onClose, onSaved, onRegenerate, regenerating }) {
  const canvasRef  = useRef(null);
  const baseImgRef = useRef(null);
  const logoImgRef = useRef(null);
  const debounceRef = useRef(null);
  const historyRef = useRef([initialEdit(poster)]);
  const histIndexRef = useRef(0);

  const [ready, setReady]         = useState(false);
  const [fontsReady, setFontsReady] = useState(false);
  const [edit, setEdit]           = useState(() => initialEdit(poster));
  const [histTick, setHistTick]   = useState(0);
  const [themeAccent, setThemeAccent] = useState(null); // color pulled from the artwork itself
  const [isLight, setIsLight]     = useState(false);
  const [logoCorner, setLogoCorner] = useState('br');
  const [logoSize, setLogoSize]     = useState('medium');
  const [editingText, setEditingText] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  const canUndo = histIndexRef.current > 0;
  const canRedo = histIndexRef.current < historyRef.current.length - 1;

  const pushHistory = (next) => {
    const hist = historyRef.current;
    const idx = histIndexRef.current;
    if (JSON.stringify(hist[idx]) === JSON.stringify(next)) return;
    const truncated = hist.slice(0, idx + 1);
    truncated.push(next);
    historyRef.current = truncated;
    histIndexRef.current = truncated.length - 1;
    setHistTick(t => t + 1);
  };

  // Discrete controls (color swatch, position, font, frame, 3D toggle, ...) commit
  // to history immediately. Text inputs pass `debounce` so undo has one step per
  // pause-in-typing instead of one step per keystroke.
  const update = (patch, debounceMs) => {
    setEdit(prev => {
      const next = { ...prev, ...patch };
      if (debounceMs) {
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => pushHistory(next), debounceMs);
      } else {
        pushHistory(next);
      }
      return next;
    });
  };

  const undo = () => {
    if (!canUndo) return;
    histIndexRef.current -= 1;
    setEdit(historyRef.current[histIndexRef.current]);
    setHistTick(t => t + 1);
  };
  const redo = () => {
    if (!canRedo) return;
    histIndexRef.current += 1;
    setEdit(historyRef.current[histIndexRef.current]);
    setHistTick(t => t + 1);
  };

  // Preload every stylized font once so the first canvas draw doesn't render a
  // fallback face for a frame before the webfont finishes downloading (canvas
  // text doesn't repaint itself on font-load the way DOM text does).
  useEffect(() => {
    const specs = FONT_OPTIONS.map(f => `${f.weight} 60px "${f.id}"`);
    Promise.all(specs.map(spec => document.fonts.load(spec).catch(() => {})))
      .then(() => setFontsReady(true));
  }, []);

  // Load the base poster image once, then sample it to pick a text color/band
  // treatment that actually suits this specific poster (light vs dark background)
  // instead of always defaulting to white text on a black gradient.
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      baseImgRef.current = img;
      setReady(true);
      const theme = extractThemeColors(img);
      if (theme) {
        setIsLight(theme.isLight);
        setThemeAccent(theme.accent);
        const patched = { ...historyRef.current[0], textColor: theme.isLight ? '#111111' : '#ffffff' };
        historyRef.current = [patched];
        histIndexRef.current = 0;
        setEdit(patched);
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

    const w = canvas.width, h = canvas.height;
    drawFrame(ctx, w, h, edit.frame);

    const hasText = edit.title.trim() || edit.name.trim();
    if (hasText) {
      const bandH = h * 0.34;
      const bandY = edit.textPos === 'top' ? 0 : edit.textPos === 'center' ? (h - bandH) / 2 : h - bandH;
      const grad = ctx.createLinearGradient(0, bandY, 0, bandY + bandH);
      const shade = isLight ? '255,255,255' : '0,0,0';
      if (edit.textPos === 'center') {
        grad.addColorStop(0, `rgba(${shade},0)`);
        grad.addColorStop(0.5, `rgba(${shade},0.55)`);
        grad.addColorStop(1, `rgba(${shade},0)`);
      } else if (edit.textPos === 'top') {
        grad.addColorStop(0, `rgba(${shade},0.65)`);
        grad.addColorStop(1, `rgba(${shade},0)`);
      } else {
        grad.addColorStop(0, `rgba(${shade},0)`);
        grad.addColorStop(1, `rgba(${shade},0.7)`);
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, bandY, w, bandH);

      ctx.textAlign = 'center';
      if (!edit.text3d) {
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = w * 0.01;
      }

      const fontRec = fontById(edit.font);
      const cx = w / 2;
      const titleSize = Math.round(w * 0.075);
      const nameSize  = Math.round(w * 0.045);
      let ty = edit.textPos === 'top' ? bandY + titleSize * 1.3 : bandY + bandH / 2 - nameSize;

      if (edit.title.trim()) {
        ctx.font = `${fontRec.weight} ${titleSize}px ${fontRec.family}`;
        renderTextBlock(ctx, { text: edit.title.trim(), cx, y: ty, maxWidth: w * 0.86, lineHeight: titleSize * 1.15, color: edit.textColor, is3d: edit.text3d });
        ty += titleSize * 1.4;
      }
      if (edit.name.trim()) {
        ctx.font = `700 ${nameSize}px ${fontRec.family}`;
        const nameColor = edit.textColor === '#ffffff' ? GOLD : edit.textColor;
        renderTextBlock(ctx, { text: edit.name.trim(), cx, y: ty, maxWidth: w * 0.8, lineHeight: nameSize * 1.2, color: nameColor, is3d: edit.text3d });
      }
      ctx.shadowBlur = 0;
    }

    const logo = logoImgRef.current;
    if (logo) {
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
  }, [edit, isLight, logoCorner, logoSize]);

  useEffect(() => { if (ready && fontsReady) draw(); }, [ready, fontsReady, draw]);

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
          title: edit.title.trim() || poster.title || 'Poster',
          name: edit.name.trim(),
          colors: { primary: edit.textColor },
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

      <div style={st.historyBtns}>
        <button onClick={undo} disabled={!canUndo} title="Undo"
          style={{ ...st.roundBtn, opacity: canUndo ? 1 : 0.35, cursor: canUndo ? 'pointer' : 'default' }}>⟲</button>
        <button onClick={redo} disabled={!canRedo} title="Redo"
          style={{ ...st.roundBtn, opacity: canRedo ? 1 : 0.35, cursor: canRedo ? 'pointer' : 'default' }}>⟳</button>
      </div>

      <div style={st.panel}>
        {editingText ? (
          <div style={st.editRow}>
            <input value={edit.title} onChange={e => update({ title: e.target.value }, 500)} placeholder="Title"
              style={st.textInput} maxLength={40} />
            <input value={edit.name} onChange={e => update({ name: e.target.value }, 500)} placeholder="Name"
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
          {onRegenerate && (
            <button onClick={onRegenerate} disabled={regenerating}
              style={{ ...st.chipBtn, color: GOLD, opacity: regenerating ? 0.5 : 1, cursor: regenerating ? 'not-allowed' : 'pointer' }}>
              🔄 {regenerating ? 'Regenerating…' : 'Regenerate'}
            </button>
          )}
        </div>

        {editingText && (
          <div style={st.controlsRow}>
            <span style={st.miniLabel}>Font:</span>
            {FONT_OPTIONS.map(f => (
              <button key={f.id} onClick={() => update({ font: f.id })}
                style={{ ...st.miniBtn, fontFamily: f.family, ...(edit.font === f.id ? st.miniBtnActive : {}) }}>
                {f.label}
              </button>
            ))}
          </div>
        )}

        {editingText && (
          <div style={st.controlsRow}>
            <span style={st.miniLabel}>Style:</span>
            <button onClick={() => update({ text3d: false })}
              style={{ ...st.miniBtn, ...(!edit.text3d ? st.miniBtnActive : {}) }}>Flat</button>
            <button onClick={() => update({ text3d: true })}
              style={{ ...st.miniBtn, ...(edit.text3d ? st.miniBtnActive : {}) }}>3D</button>

            <span style={{ ...st.miniLabel, marginLeft: 10 }}>Position:</span>
            {['top', 'center', 'bottom'].map(p => (
              <button key={p} onClick={() => update({ textPos: p })}
                style={{ ...st.miniBtn, ...(edit.textPos === p ? st.miniBtnActive : {}) }}>{p}</button>
            ))}
          </div>
        )}

        {editingText && (
          <div style={st.controlsRow}>
            <span style={st.miniLabel}>Color:</span>
            {themeAccent && (
              <button onClick={() => update({ textColor: themeAccent })} title="Matched from your poster's own colors" style={{
                width: 24, height: 24, borderRadius: '50%', background: themeAccent, cursor: 'pointer',
                border: edit.textColor === themeAccent ? `2px solid ${TEAL}` : '2px solid #fff',
                boxShadow: '0 0 0 1px rgba(0,0,0,0.3)',
              }} />
            )}
            {TEXT_COLORS.map(c => (
              <button key={c} onClick={() => update({ textColor: c })} style={{
                width: 24, height: 24, borderRadius: '50%', background: c, cursor: 'pointer',
                border: edit.textColor === c ? `2px solid ${TEAL}` : '1px solid rgba(255,255,255,0.3)',
              }} />
            ))}
          </div>
        )}

        <div style={st.controlsRow}>
          <span style={st.miniLabel}>Frame:</span>
          {FRAME_OPTIONS.map(f => (
            <button key={f.id} onClick={() => update({ frame: f.id })}
              style={{ ...st.miniBtn, ...(edit.frame === f.id ? st.miniBtnActive : {}) }}>{f.label}</button>
          ))}
        </div>

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
  historyBtns: {
    position: 'absolute', top: 16, left: 16, zIndex: 2, display: 'flex', gap: 8,
  },
  roundBtn: {
    width: 36, height: 36, borderRadius: '50%', border: 'none',
    background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 18, lineHeight: '36px', padding: 0,
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
