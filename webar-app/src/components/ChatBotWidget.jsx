import { useState, useRef, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { API_BASE } from '../config/api.js';
import PosterEditor from './PosterEditor.jsx';

// Poster generation runs on the festival-greeting backend (Railway), not the main API_BASE.
// In dev we hit the Vite proxy (/festival-api → Railway) so the request is same-origin
// and Railway's CORS origin allowlist can't block it on non-5173 ports.
const POSTER_API_BASE = import.meta.env.DEV ? '/festival-api' : (import.meta.env.VITE_BACKEND_URL || API_BASE);

const FONT    = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const TEAL    = "#00C9A7";
const GOLD    = "#C9A84C";
const WHATSAPP = "https://wa.me/919187713120";

// ── FAQ knowledge base ────────────────────────────────────────────────────────
const FAQS = [
  {
    patterns: ['scan', 'ar scan', 'camera', 'detect', 'recognize'],
    answer: "To scan an AR target:\n1. Tap the **Scan** button on the Home screen.\n2. Point your camera at the AR target image.\n3. Memoera will detect it and play your linked memory!\n\nMake sure the target is well-lit and your camera permission is enabled.",
    quick: ['How to upload a target?', 'Scan not working?'],
  },
  {
    patterns: ['upload', 'add target', 'create', 'new target'],
    answer: "To upload your first target:\n1. Tap **Upload** on Home.\n2. Choose **Private** (only you) or **Public** (everyone).\n3. Pick Photo+Video or Photo+URL.\n4. Follow the steps to link your memory.\n\nYour target will be live within seconds! 🎉",
    quick: ['Storage limits?', 'How to scan?'],
  },
  {
    patterns: ['not work', 'not scanning', 'fail', 'error', 'problem', 'issue', 'bug'],
    answer: "If scanning isn't working, try these steps:\n• Ensure camera permission is granted in your phone settings.\n• Hold steady 20-40 cm from the target.\n• Make sure the target image is clear, flat, and well-lit.\n• Re-upload the target if it's blurry.\n• Refresh the app.\n\nStill stuck? Let's connect on WhatsApp! 💬",
    quick: ['Contact support', 'How to upload?'],
  },
  {
    patterns: ['storage', 'limit', 'space', 'mb', 'full'],
    answer: "Each account includes:\n• **250 MB** for Private targets\n• **250 MB** for Public targets\n• **500 MB total**\n\nYou can earn extra storage by watching ads in Refer & Earn. Premium plans unlock more storage! 🌟",
    quick: ['Premium plans?', 'Watch ad for storage?'],
  },
  {
    patterns: ['premium', 'subscribe', 'plan', 'paid', 'upgrade'],
    answer: "Memoera Premium gives you:\n• Up to **2 GB storage**\n• Priority AR processing\n• Early access to new features\n• No advertisement banners\n\nGo to **Settings → Subscription** to upgrade. Plans start from ₹99/month.",
    quick: ['How to upgrade?', 'Storage limits?'],
  },
  {
    patterns: ['delete', 'remove', 'gallery'],
    answer: "To delete a target:\n1. Open **Gallery** from the Home screen.\n2. Find your target.\n3. Long-press or use the delete button.\n\nNote: Deleted targets cannot be recovered.",
    quick: ['How to upload?', 'Storage limits?'],
  },
  {
    patterns: ['password', 'forgot', 'reset', 'login', 'sign in', 'account'],
    answer: "If you forgot your password:\n1. On the Sign In screen, tap **Forgot Password?**\n2. Enter your mobile number.\n3. Answer your security question.\n4. Enter the OTP sent to your phone.\n5. Set a new password.\n\nTo change your password when logged in, go to **Settings → Account → Change Password**.",
    quick: ['Contact support', 'How to scan?'],
  },
  {
    patterns: ['refer', 'referral', 'earn', 'bonus', 'reward'],
    answer: "Refer friends & earn bonus storage!\n• Share your referral link from **Refer & Earn**.\n• Each friend who joins gives you +100 MB.\n• Watch ads for an extra +50 MB per ad.\n\nTap **Refer** in the nav bar to get started! 🎁",
    quick: ['Premium plans?', 'Storage limits?'],
  },
  {
    patterns: ['public', 'private', 'visibility'],
    answer: "**Private targets** are only detected by you when you scan.\n\n**Public targets** are visible to ALL Memoera users — great for businesses, events, and campaigns.\n\nYou can choose visibility when uploading.",
    quick: ['How to upload?', 'Storage limits?'],
  },
  {
    patterns: ['language', 'translate', 'hindi', 'tamil', 'kannada'],
    answer: "Memoera supports 16 languages! To change:\n1. On the Home screen, tap the language selector (top right).\n2. Choose your preferred language.\n\nAvailable: English, Hindi, Kannada, Tamil, Telugu, Spanish, French, Arabic, Portuguese, German, Chinese, Japanese, Russian, Malay, Bengali, Swahili.",
    quick: ['How to scan?', 'Contact support'],
  },
];

const QUICK_START = ['How to scan?', 'How to upload?', 'Storage limits?', 'Premium plans?', 'Contact support'];

function findAnswer(text) {
  const lower = text.toLowerCase();
  if (lower.includes('contact') || lower.includes('human') || lower.includes('agent') || lower.includes('support')) {
    return {
      answer: "I'll connect you with our support team right away! 💬\n\nTap the button below to chat with us on WhatsApp — we typically respond within a few minutes.",
      whatsapp: true,
      quick: ['How to scan?', 'How to upload?'],
    };
  }
  for (const faq of FAQS) {
    if (faq.patterns.some(p => lower.includes(p))) return faq;
  }
  return {
    answer: "I'm not sure about that, but I'm happy to connect you with our support team! 😊\n\nOr try rephrasing your question — I can help with scanning, uploading, storage, premium plans, and more.",
    whatsapp: true,
    quick: QUICK_START.slice(0, 3),
  };
}

function formatMsg(text) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((p, i) =>
    i % 2 === 1
      ? <strong key={i}>{p}</strong>
      : p.split('\n').map((l, j, a) => <span key={j}>{l}{j < a.length - 1 && <br />}</span>)
  );
}

// ── Poster generation ─────────────────────────────────────────────────────────
const POSTER_CHIPS = [
  { label: '🎂 Birthday',    hint: 'Happy Birthday celebration poster with balloons and cake, colorful festive' },
  { label: '💍 Anniversary', hint: 'Happy Anniversary romantic poster with flowers and hearts, elegant' },
  { label: '🎓 Graduation',  hint: 'Congratulations Graduation poster with cap and diploma, gold achievement' },
  { label: '🪔 Diwali',      hint: 'Happy Diwali festival poster with diyas and rangoli, golden Indian festive' },
  { label: '🎄 Christmas',   hint: 'Merry Christmas poster with snowflakes and tree, red green gold festive' },
  { label: '🥳 New Year',    hint: 'Happy New Year celebration poster with fireworks, gold silver sparkling' },
  { label: '💝 Wedding',     hint: 'Beautiful Wedding celebration poster with flowers and love, elegant white gold' },
  { label: '🎊 Congrats',    hint: 'Congratulations achievement celebration poster, vibrant colorful joyful' },
  { label: '🙏 Festival',    hint: 'Indian festival celebration poster, traditional colorful cultural festive' },
  { label: '💼 Corporate',   hint: 'Professional corporate event poster, modern sleek business design' },
];


// ── Poster generation mode ────────────────────────────────────────────────────
const ORIENTATIONS = [
  { id: 'portrait',  label: '▯ Portrait' },
  { id: 'landscape', label: '▭ Landscape' },
  { id: 'square',    label: '▢ Square' },
];

// Mirrors STYLE_VARIANTS in the festival backend's routes/poster.js — index sent
// as styleIndex so the same art direction can be picked explicitly instead of
// the backend choosing at random every time (the "everything looks the same
// dark theme" complaint was really "no visible way to pick a lighter style").
const STYLE_CHOICES = [
  { label: '🎲 Surprise Me' }, // styleIndex omitted → backend picks at random
  { label: '✨ Neon Futuristic' },
  { label: '🎨 Traditional' },
  { label: '💎 Luxury Editorial' },
  { label: '🌸 Watercolor' },
  { label: '🕰️ Vintage Retro' },
  { label: '🔮 Fantasy' },
  { label: '🟢 Bold Graphic' },
  { label: '🎬 Cinematic' },
];

function PosterMode({ colors, isDark }) {
  const [input, setInput]             = useState('');
  const [name, setName]               = useState('');
  const [orientation, setOrientation] = useState('portrait');
  const [styleIndex, setStyleIndex]   = useState(null); // null = let backend pick at random
  const [items, setItems]             = useState([]);
  const [generating, setGenerating]   = useState(false);
  const [editingPoster, setEditingPoster] = useState(null);
  const [attachedLogo, setAttachedLogo]   = useState(null); // dataURL, composited server-side before generation
  const lastOccasionRef = useRef(''); // remembers the last prompt so Regenerate doesn't need retyping
  const endRef = useRef(null);
  const logoInputRef = useRef(null);

  // Batch mode: generate several (occasion, name) posters in one go, sharing the
  // same orientation/style/logo settings, instead of one-at-a-time chat turns.
  const [batchMode, setBatchMode]           = useState(false);
  const [batchRows, setBatchRows]           = useState([{ occasion: '', name: '' }]);
  const [batchResults, setBatchResults]     = useState([]);
  const [batchGenerating, setBatchGenerating] = useState(false);

  // Free-tier AI poster allowance — fetched once on open so the limit is visible
  // up front, then kept in sync from each generate response's postersRemaining.
  const [quotaInfo, setQuotaInfo] = useState(null); // { remaining, limit, unlimited } | null

  useEffect(() => {
    const token = localStorage.getItem('memoera_token');
    if (!token) return;
    fetch(`${API_BASE}/api/poster/quota`, { headers: { Authorization: 'Bearer ' + token } })
      .then(r => r.ok ? r.json() : null)
      .then(q => { if (q) setQuotaInfo(q); })
      .catch(() => {});
  }, []);

  const handleAttachLogo = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setAttachedLogo(reader.result);
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [items]);

  const MAX_BATCH_ROWS = 6;
  const addBatchRow    = () => setBatchRows(rows => rows.length >= MAX_BATCH_ROWS ? rows : [...rows, { occasion: '', name: '' }]);
  const removeBatchRow = (i) => setBatchRows(rows => rows.filter((_, idx) => idx !== i));
  const updateBatchRow = (i, patch) => setBatchRows(rows => rows.map((r, idx) => idx === i ? { ...r, ...patch } : r));

  // Runs each row's generation one at a time (not in parallel) so a slow/failed
  // row doesn't block the others and we don't slam the image API with a burst
  // of simultaneous requests — each row's tile updates from spinner to result
  // as soon as its own call resolves.
  const generateBatch = async () => {
    const rows = batchRows.filter(r => r.occasion.trim());
    if (!rows.length || batchGenerating) return;

    const token = localStorage.getItem('memoera_token');
    if (!token) {
      setBatchResults(rows.map((r, i) => ({
        id: Date.now() + i, occasion: r.occasion.trim(), name: r.name.trim(),
        poster: null, loading: false, error: 'Please sign in to create AI posters.',
      })));
      return;
    }

    setBatchGenerating(true);
    setBatchResults(rows.map((r, i) => ({
      id: Date.now() + i, occasion: r.occasion.trim(), name: r.name.trim(),
      poster: null, loading: true, error: null,
    })));

    for (let i = 0; i < rows.length; i++) {
      try {
        const res = await fetch(`${POSTER_API_BASE}/api/poster/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify({
            occasion: rows[i].occasion.trim(), name: rows[i].name.trim(), details: '', orientation,
            logoBase64: attachedLogo || undefined,
            styleIndex: styleIndex != null ? styleIndex - 1 : undefined,
          }),
        });
        if (!res.ok) {
          let msg = "Couldn't generate this poster.";
          try { const errData = await res.json(); if (errData?.error) msg = errData.error; } catch {}
          throw new Error(msg);
        }
        const poster = await res.json();
        setBatchResults(prev => prev.map((r, idx) => idx === i ? { ...r, loading: false, poster } : r));
        setQuotaInfo(q => ({ ...(q || {}), remaining: poster.postersRemaining, unlimited: poster.unlimited }));

        // Same best-effort history save single-generate already does, so batch
        // results show up in Settings → My Posters too.
        fetch(`${API_BASE}/api/poster/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify(poster),
        }).catch(() => {});
      } catch (err) {
        setBatchResults(prev => prev.map((r, idx) => idx === i ? { ...r, loading: false, error: err.message || 'Failed' } : r));
      }
    }
    setBatchGenerating(false);
  };

  const generate = async (occasionHint, opts = {}) => {
    const occasion = (occasionHint || input).trim();
    if (!occasion || generating) return;
    lastOccasionRef.current = occasion;
    setInput('');
    setGenerating(true);

    const id = Date.now();
    if (!opts.silent) {
      setItems(prev => [
        ...prev,
        { id, type: 'user', text: occasion + (name ? ` for ${name}` : '') },
        { id: id + 1, type: 'poster', loading: true, error: null, poster: null },
      ]);
    } else {
      // Regenerate: replace the most recent poster bubble instead of adding a new "you said" line
      setItems(prev => {
        const next = [...prev];
        for (let i = next.length - 1; i >= 0; i--) {
          if (next[i].type === 'poster') { next[i] = { ...next[i], loading: true, error: null }; break; }
        }
        return next;
      });
    }

    const token = localStorage.getItem('memoera_token');
    if (!token) {
      setItems(prev => {
        const next = [...prev];
        for (let i = next.length - 1; i >= 0; i--) {
          if (next[i].type === 'poster') { next[i] = { ...next[i], loading: false, error: 'Please sign in to create AI posters.' }; break; }
        }
        return next;
      });
      setGenerating(false);
      return;
    }

    try {
      const res = await fetch(`${POSTER_API_BASE}/api/poster/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({
          occasion, name: name.trim(), details: '', orientation,
          logoBase64: attachedLogo || undefined,
          styleIndex: styleIndex != null ? styleIndex - 1 : undefined, // -1 to skip "Surprise Me" at index 0
        }),
      });
      if (!res.ok) {
        let msg = "Couldn't generate your poster. Please try again.";
        try {
          const errData = await res.json();
          if (errData?.error) msg = errData.error;
        } catch {}
        throw new Error(msg);
      }
      const poster = await res.json();
      setItems(prev => {
        const next = [...prev];
        for (let i = next.length - 1; i >= 0; i--) {
          if (next[i].type === 'poster') { next[i] = { ...next[i], loading: false, error: null, poster }; break; }
        }
        return next;
      });
      setQuotaInfo(q => ({ ...(q || {}), remaining: poster.postersRemaining, unlimited: poster.unlimited }));

      // Persist the raw generation to the user's poster history (Settings → My Posters)
      // right away — best-effort, so nothing is lost even if they close the editor
      // below without tapping its own Save button. (token is guaranteed set here —
      // generation itself now requires sign-in.)
      fetch(`${API_BASE}/api/poster/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify(poster),
      }).catch(() => {});

      // Show it full-screen immediately, with editing tools, instead of making the
      // user tap into the mini chat-bubble preview first.
      setEditingPoster(poster);
    } catch (err) {
      const message = err.message || 'Something went wrong. Please try again.';
      setItems(prev => {
        const next = [...prev];
        for (let i = next.length - 1; i >= 0; i--) {
          if (next[i].type === 'poster') { next[i] = { ...next[i], loading: false, error: message }; break; }
        }
        return next;
      });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <style>{`
        @keyframes posterSpin  { to { transform: rotate(360deg); } }
        @keyframes posterPulse { 0%,100%{opacity:0.4} 50%{opacity:1} }
        @keyframes posterFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
      `}</style>

      {/* Full-screen poster view + editor */}
      {editingPoster && (
        <PosterEditor
          poster={editingPoster}
          onClose={() => setEditingPoster(null)}
          onRegenerate={async () => {
            setEditingPoster(null);
            await generate(lastOccasionRef.current, { silent: true });
          }}
          regenerating={generating}
        />
      )}

      {/* Scroll area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px 6px', display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Welcome */}
        {items.length === 0 && (
          <div style={{ textAlign: 'center', padding: '10px 4px 2px' }}>
            <div style={{ fontSize: 34, animation: 'posterFloat 3s ease-in-out infinite' }}>🎨</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: colors.text, fontFamily: FONT, margin: '6px 0 4px' }}>
              AI Poster Studio
            </div>
            <div style={{ fontSize: 11, color: colors.textMuted, fontFamily: FONT, lineHeight: 1.5 }}>
              Pick a celebration below or type your own. We'll craft a unique AI-generated poster for you!
            </div>
            {quotaInfo && !quotaInfo.unlimited && (
              <div style={{
                display: 'inline-block', marginTop: 8, padding: '4px 12px', borderRadius: 20,
                fontSize: 10.5, fontFamily: FONT, fontWeight: 600,
                color: quotaInfo.remaining > 0 ? GOLD : '#FF6B6B',
                background: quotaInfo.remaining > 0 ? 'rgba(201,168,76,0.12)' : 'rgba(255,107,107,0.12)',
                border: `1px solid ${quotaInfo.remaining > 0 ? GOLD : '#FF6B6B'}55`,
              }}>
                {quotaInfo.remaining > 0
                  ? `🎁 ${quotaInfo.remaining} free poster${quotaInfo.remaining === 1 ? '' : 's'} left`
                  : '⚠ Free posters used — Upgrade to Premium for unlimited'}
              </div>
            )}
          </div>
        )}

        {/* Batch mode toggle */}
        {items.length === 0 && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '0 4px' }}>
            <button onClick={() => setBatchMode(v => !v)} style={{
              background: batchMode ? `${GOLD}22` : 'transparent',
              border: `1px solid ${batchMode ? GOLD : colors.border}`, borderRadius: 20,
              color: batchMode ? GOLD : colors.textMuted,
              fontSize: 11, fontWeight: 600, fontFamily: FONT, padding: '6px 14px', cursor: 'pointer',
            }}>
              {batchMode ? '✕ Exit Batch Mode' : '🗂 Batch Generate (multiple posters)'}
            </button>
          </div>
        )}

        {/* Name input (single-poster mode only — batch mode has its own per-row name field) */}
        {items.length === 0 && !batchMode && (
          <div style={{ padding: '0 4px' }}>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Person's name (optional, e.g. Rahul)"
              style={{
                width: '100%', boxSizing: 'border-box',
                border: `1px solid ${TEAL}44`, borderRadius: 12,
                background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                color: colors.text, fontSize: 12, fontFamily: FONT,
                padding: '9px 12px', outline: 'none',
              }}
            />
          </div>
        )}

        {/* Orientation picker */}
        {items.length === 0 && (
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', padding: '0 4px' }}>
            {ORIENTATIONS.map(o => (
              <button key={o.id} onClick={() => setOrientation(o.id)} style={{
                flex: 1, background: orientation === o.id ? `${TEAL}22` : 'transparent',
                border: `1px solid ${orientation === o.id ? TEAL : colors.border}`, borderRadius: 10,
                color: orientation === o.id ? TEAL : colors.textMuted,
                fontSize: 11, fontWeight: 600, fontFamily: FONT, padding: '7px 4px', cursor: 'pointer',
              }}>
                {o.label}
              </button>
            ))}
          </div>
        )}

        {/* Art style picker */}
        {items.length === 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', padding: '2px 4px 0' }}>
            {STYLE_CHOICES.map((sc, i) => (
              <button key={sc.label} onClick={() => setStyleIndex(i)} style={{
                background: (styleIndex ?? 0) === i ? `${GOLD}22` : 'transparent',
                border: `1px solid ${(styleIndex ?? 0) === i ? GOLD : colors.border}`, borderRadius: 16,
                color: (styleIndex ?? 0) === i ? GOLD : colors.textMuted,
                fontSize: 10.5, fontFamily: FONT, padding: '5px 9px', cursor: 'pointer',
              }}>
                {sc.label}
              </button>
            ))}
          </div>
        )}

        {/* Category chips (single-poster mode only) */}
        {items.length === 0 && !batchMode && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', padding: '2px 0 4px' }}>
            {POSTER_CHIPS.map(c => (
              <button key={c.label}
                onClick={() => generate(c.hint)}
                disabled={generating}
                style={{
                  background: isDark ? 'rgba(0,201,167,0.1)' : 'rgba(0,201,167,0.12)',
                  border: `1px solid ${TEAL}55`, borderRadius: 20,
                  padding: '6px 11px', fontSize: 11, fontFamily: FONT,
                  color: TEAL, cursor: generating ? 'not-allowed' : 'pointer',
                  opacity: generating ? 0.5 : 1, transition: 'background 0.15s',
                }}>
                {c.label}
              </button>
            ))}
          </div>
        )}

        {/* Batch rows editor */}
        {items.length === 0 && batchMode && (
          <div style={{ padding: '2px 4px 4px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {batchRows.map((row, i) => (
              <div key={i} style={{ display: 'flex', gap: 6 }}>
                <input
                  value={row.occasion}
                  onChange={e => updateBatchRow(i, { occasion: e.target.value })}
                  placeholder="Occasion e.g. Birthday"
                  style={{
                    flex: 1.4, boxSizing: 'border-box', border: `1px solid ${TEAL}44`, borderRadius: 10,
                    background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                    color: colors.text, fontSize: 11.5, fontFamily: FONT, padding: '8px 10px', outline: 'none',
                  }}
                />
                <input
                  value={row.name}
                  onChange={e => updateBatchRow(i, { name: e.target.value })}
                  placeholder="Name (optional)"
                  style={{
                    flex: 1, boxSizing: 'border-box', border: `1px solid ${TEAL}44`, borderRadius: 10,
                    background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                    color: colors.text, fontSize: 11.5, fontFamily: FONT, padding: '8px 10px', outline: 'none',
                  }}
                />
                {batchRows.length > 1 && (
                  <button onClick={() => removeBatchRow(i)} title="Remove row" style={{
                    flexShrink: 0, width: 30, background: 'transparent', border: `1px solid ${colors.border}`,
                    borderRadius: 10, color: '#FF6B6B', fontSize: 13, cursor: 'pointer',
                  }}>✕</button>
                )}
              </div>
            ))}

            <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
              <button onClick={addBatchRow} disabled={batchRows.length >= MAX_BATCH_ROWS} style={{
                flex: 1, background: 'transparent', border: `1px solid ${colors.border}`, borderRadius: 20,
                color: colors.textMuted, fontSize: 11, fontFamily: FONT, padding: '8px', cursor: 'pointer',
                opacity: batchRows.length >= MAX_BATCH_ROWS ? 0.5 : 1,
              }}>
                + Add Occasion ({batchRows.length}/{MAX_BATCH_ROWS})
              </button>
              <button onClick={generateBatch} disabled={batchGenerating || !batchRows.some(r => r.occasion.trim())} style={{
                flex: 1.3, background: batchGenerating ? 'rgba(0,201,167,0.3)' : `linear-gradient(135deg,${TEAL},#00E5CC)`,
                border: 'none', borderRadius: 20, color: '#040D0B', fontSize: 11.5, fontWeight: 700,
                fontFamily: FONT, padding: '8px', cursor: batchGenerating ? 'not-allowed' : 'pointer',
              }}>
                {batchGenerating ? '⏳ Generating…' : `🚀 Generate All (${batchRows.filter(r => r.occasion.trim()).length})`}
              </button>
            </div>
          </div>
        )}

        {/* Batch results grid — stays visible even after toggling batch mode off */}
        {batchResults.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, padding: '2px 4px 8px' }}>
            {batchResults.map(r => (
              <div key={r.id}
                onClick={() => r.poster && setEditingPoster(r.poster)}
                style={{
                  position: 'relative', borderRadius: 12, overflow: 'hidden', aspectRatio: '3/4',
                  background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
                  border: `1px solid ${TEAL}33`, cursor: r.poster ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                {r.loading && (
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%',
                    border: `2.5px solid ${TEAL}33`, borderTopColor: TEAL,
                    animation: 'posterSpin 0.9s linear infinite',
                  }} />
                )}
                {r.error && (
                  <div style={{ fontSize: 10, color: '#FF6B6B', fontFamily: FONT, padding: 8, textAlign: 'center' }}>
                    ⚠ {r.error}
                  </div>
                )}
                {r.poster?.imageBase64 && (
                  <img src={r.poster.imageBase64} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                )}
                <div style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 9,
                  fontFamily: FONT, padding: '3px 6px', textAlign: 'center',
                }}>
                  {r.occasion}{r.name ? ` · ${r.name}` : ''}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Chat history */}
        {items.map(item => {
          if (item.type === 'user') return (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{
                background: TEAL, color: '#fff',
                borderRadius: '18px 18px 4px 18px',
                padding: '9px 13px', maxWidth: '80%',
                fontSize: 13, fontFamily: FONT, lineHeight: 1.5,
              }}>{item.text}</div>
            </div>
          );

          if (item.type === 'poster') return (
            <div key={item.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#112', overflow: 'hidden', padding: 2 }}>
                  <img src="/logo1.png" alt="" style={{ width: '100%', objectFit: 'contain' }} />
                </div>
                <span style={{ fontSize: 10, color: colors.textMuted, fontFamily: FONT }}>
                  {item.loading ? 'Claude is creating your poster…' : item.error ? 'Failed — try again' : 'Your poster is ready! ✨'}
                </span>
              </div>

              {/* Loading state */}
              {item.loading && (
                <div style={{
                  borderRadius: 16, padding: '24px 20px', textAlign: 'center',
                  background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
                  border: `1px solid ${TEAL}33`, width: '80%',
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', margin: '0 auto 10px',
                    border: `3px solid ${TEAL}33`, borderTopColor: TEAL,
                    animation: 'posterSpin 0.9s linear infinite',
                  }} />
                  <div style={{ fontSize: 11, color: colors.textMuted, fontFamily: FONT, animation: 'posterPulse 1.6s ease-in-out infinite' }}>
                    Claude AI is designing your poster…
                  </div>
                </div>
              )}

              {/* Error state */}
              {item.error && (
                <div style={{ fontSize: 12, color: '#ff6b6b', fontFamily: FONT, padding: '6px 12px', background: 'rgba(255,60,60,0.1)', borderRadius: 10 }}>
                  ⚠ {item.error}
                </div>
              )}

              {/* Poster preview */}
              {item.poster && (
                <div style={{
                  position: 'relative', width: '85%', borderRadius: 16, overflow: 'hidden',
                  background: item.poster.colors?.bg || '#0a1628',
                  border: `1px solid ${item.poster.colors?.primary || TEAL}44`,
                  cursor: 'pointer',
                }} onClick={() => setEditingPoster(item.poster)}>
                  {item.poster.imageBase64 && (
                    <img src={item.poster.imageBase64} alt="" style={{
                      width: '100%', display: 'block',
                    }} />
                  )}
                </div>
              )}

              {/* Action buttons */}
              {item.poster && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setEditingPoster(item.poster)} style={{
                    background: `linear-gradient(135deg,${TEAL},#00E5CC)`,
                    border: 'none', borderRadius: 20,
                    color: '#040D0B', fontSize: 11, fontWeight: 700, fontFamily: FONT,
                    padding: '7px 14px', cursor: 'pointer',
                  }}>
                    ✏️ Edit / Download
                  </button>
                  <button onClick={() => generate(lastOccasionRef.current, { silent: true })} disabled={generating} style={{
                    background: 'transparent', border: `1px solid ${GOLD}77`,
                    borderRadius: 20, color: GOLD,
                    fontSize: 11, fontFamily: FONT,
                    padding: '7px 12px', cursor: generating ? 'not-allowed' : 'pointer',
                    opacity: generating ? 0.5 : 1,
                  }}>
                    🔄 Regenerate
                  </button>
                  <button onClick={() => { setItems([]); }} style={{
                    background: 'transparent', border: `1px solid ${TEAL}55`,
                    borderRadius: 20, color: TEAL,
                    fontSize: 11, fontFamily: FONT,
                    padding: '7px 12px', cursor: 'pointer',
                  }}>
                    ＋ New Poster
                  </button>
                </div>
              )}
            </div>
          );
          return null;
        })}

        <div ref={endRef} />
      </div>

      {/* Attached logo/photo preview */}
      {attachedLogo && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
          borderTop: `1px solid ${colors.border}`, flexShrink: 0,
          background: isDark ? 'rgba(0,201,167,0.06)' : 'rgba(0,201,167,0.08)',
        }}>
          <img src={attachedLogo} alt="" style={{ width: 26, height: 26, borderRadius: 6, objectFit: 'cover' }} />
          <span style={{ fontSize: 11, color: TEAL, fontFamily: FONT, flex: 1 }}>
            Logo/photo will be added to your next poster
          </span>
          <button onClick={() => setAttachedLogo(null)} style={{
            background: 'transparent', border: 'none', color: colors.textMuted,
            fontSize: 14, cursor: 'pointer', padding: '0 4px',
          }}>✕</button>
        </div>
      )}

      {/* Input row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 10px', borderTop: attachedLogo ? 'none' : `1px solid ${colors.border}`, flexShrink: 0,
        background: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.7)',
      }}>
        <input ref={logoInputRef} type="file" accept="image/*" onChange={handleAttachLogo} style={{ display: 'none' }} />
        <button onClick={() => logoInputRef.current?.click()} title="Attach logo or photo" style={{
          width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
          background: attachedLogo ? `${TEAL}33` : 'transparent', border: `1px solid ${TEAL}55`,
          color: TEAL, fontSize: 16, fontWeight: 700, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>+</button>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !generating && generate()}
          placeholder={generating ? 'Claude is creating…' : 'e.g. Anniversary poster, Diwali wishes…'}
          disabled={generating}
          style={{
            flex: 1, border: 'none', outline: 'none',
            fontSize: 12, fontFamily: FONT, padding: '6px 0',
            color: colors.text, background: 'transparent',
          }}
        />
        <button onClick={() => generate()}
          disabled={!input.trim() || generating}
          style={{
            width: 34, height: 34, borderRadius: '50%',
            background: !input.trim() || generating ? 'rgba(0,201,167,0.3)' : `linear-gradient(135deg,${TEAL},#00E5CC)`,
            border: 'none', cursor: !input.trim() || generating ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
          {generating
            ? <div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'posterSpin 0.7s linear infinite' }} />
            : <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M21 15.5c0 .83-.67 1.5-1.5 1.5H7l-4 4V4c0-.83.67-1.5 1.5-1.5h15c.83 0 1.5.67 1.5 1.5v11.5z"/></svg>
          }
        </button>
      </div>
    </div>
  );
}

// ── Main widget ───────────────────────────────────────────────────────────────

export default function ChatBotWidget() {
  const { colors, theme } = useTheme();
  const [open, setOpen]   = useState(false);
  const [tab, setTab]     = useState('support'); // 'support' | 'poster'

  // Support tab state
  const [messages, setMessages]       = useState([]);
  const [input, setInput]             = useState('');
  const [typing, setTyping]           = useState(false);
  const [quickReplies, setQuickReplies] = useState(QUICK_START);
  const endRef = useRef(null);

  const isDark     = theme === 'dark';
  const bubbleBg   = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const headerBg   = isDark ? '#0A2229' : '#061A1F';

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{ role: 'bot', text: "Welcome to Memoera Support! 🌟\n\nI'm your AI assistant. How can I help you today?\n\nTap a quick option below or type your question.", ts: new Date() }]);
      setQuickReplies(QUICK_START);
    }
  }, [open, messages.length]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing]);

  const sendMessage = (text) => {
    const userMsg = text.trim();
    if (!userMsg) return;
    setInput('');
    setQuickReplies([]);
    setMessages(prev => [...prev, { role: 'user', text: userMsg, ts: new Date() }]);
    setTyping(true);
    setTimeout(() => {
      const result = findAnswer(userMsg);
      setTyping(false);
      setMessages(prev => [...prev, { role: 'bot', text: result.answer, whatsapp: result.whatsapp, ts: new Date() }]);
      setQuickReplies(result.quick || []);
    }, 600 + Math.random() * 500);
  };

  return (
    <>
      {/* ── Floating button ── */}
      {!open && (
        <button onClick={() => setOpen(true)} style={s.fab} title="Chat with Memoera AI">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="#fff">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
          </svg>
          <span style={s.fabBadge}>AI</span>
        </button>
      )}

      {/* ── Chat panel ── */}
      {open && (
        <div style={{ ...s.panel, background: isDark ? '#0A1A20' : '#f0f9f7', boxShadow: '0 8px 40px rgba(0,0,0,0.4)' }}>

          {/* Header */}
          <div style={{ ...s.header, background: headerBg }}>
            <div style={s.headerAvatar}>
              <img src="/logo-icon.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={s.headerName}>Memoera AI</div>
              <div style={s.headerStatus}>● Online · AI Powered</div>
            </div>
            <button onClick={() => setOpen(false)} style={s.closeBtn}>✕</button>
          </div>

          {/* Tab switcher */}
          <div style={{
            display: 'flex', borderBottom: `1px solid ${colors.border}`, flexShrink: 0,
            background: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.4)',
          }}>
            {[
              { id: 'support', label: '💬 Support' },
              { id: 'poster',  label: '🎨 Create Poster' },
            ].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                flex: 1, padding: '9px 4px', border: 'none', cursor: 'pointer',
                background: 'transparent', fontFamily: FONT, fontSize: 12, fontWeight: tab === t.id ? 700 : 500,
                color: tab === t.id ? TEAL : colors.textMuted,
                borderBottom: tab === t.id ? `2px solid ${TEAL}` : '2px solid transparent',
                transition: 'color 0.2s, border-color 0.2s',
              }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* ── Support tab ── */}
          {tab === 'support' && (
            <>
              <div style={s.messages}>
                {messages.map((m, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
                    <div style={{
                      ...s.bubble,
                      background: m.role === 'user' ? TEAL : bubbleBg,
                      color: m.role === 'user' ? '#fff' : colors.text,
                      borderRadius: m.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                    }}>
                      {formatMsg(m.text)}
                    </div>
                    {m.whatsapp && (
                      <a href={WHATSAPP} target="_blank" rel="noreferrer" style={s.waBtn}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff" style={{ marginRight: 5 }}>
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                        </svg>
                        Chat on WhatsApp
                      </a>
                    )}
                    <span style={{ fontSize: 9, color: colors.textMuted, fontFamily: FONT, marginTop: 2, paddingInline: 4 }}>
                      {m.ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
                {typing && (
                  <div style={{ ...s.bubble, background: bubbleBg, color: colors.textMuted, borderRadius: '18px 18px 18px 4px', alignSelf: 'flex-start' }}>
                    <TypingDots />
                  </div>
                )}
                <div ref={endRef} />
              </div>

              {quickReplies.length > 0 && (
                <div style={s.quickRow}>
                  {quickReplies.map((q, i) => (
                    <button key={i} style={{ ...s.quickBtn, borderColor: TEAL, color: TEAL }} onClick={() => sendMessage(q)}>
                      {q}
                    </button>
                  ))}
                </div>
              )}

              <div style={{ ...s.inputRow, borderTopColor: colors.border, background: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.7)' }}>
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendMessage(input)}
                  placeholder="Type your question…"
                  style={{ ...s.input, color: colors.text, background: 'transparent' }}
                />
                <button onClick={() => sendMessage(input)} style={s.sendBtn} disabled={!input.trim()}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                </button>
              </div>
            </>
          )}

          {/* ── Poster tab ── */}
          {tab === 'poster' && <PosterMode colors={colors} isDark={isDark} />}
        </div>
      )}
    </>
  );
}

function TypingDots() {
  return (
    <span style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '2px 4px' }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: 6, height: 6, borderRadius: '50%', background: TEAL, opacity: 0.6,
          animation: `typingDot 1.2s ease-in-out ${i * 0.2}s infinite`,
        }} />
      ))}
      <style>{`@keyframes typingDot { 0%,80%,100%{transform:scale(0.6);opacity:0.3} 40%{transform:scale(1);opacity:1} }`}</style>
    </span>
  );
}

const s = {
  fab: {
    position: 'fixed', bottom: 88, right: 16, zIndex: 500,
    width: 54, height: 54, borderRadius: '50%',
    background: `linear-gradient(135deg, ${TEAL}, #00E5CC)`,
    border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: `0 4px 18px rgba(0,201,167,0.5)`,
    transition: 'transform 0.2s',
  },
  fabBadge: {
    position: 'absolute', top: -4, right: -4,
    background: GOLD, color: '#fff', fontSize: 8, fontWeight: 700,
    fontFamily: FONT, borderRadius: 8, padding: '2px 5px',
  },
  panel: {
    position: 'fixed', bottom: 80, right: 12, zIndex: 500,
    width: 'min(360px, calc(100vw - 24px))',
    height: 'min(560px, calc(100vh - 100px))',
    borderRadius: 20, display: 'flex', flexDirection: 'column',
    overflow: 'hidden', border: `1px solid rgba(0,201,167,0.25)`,
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '12px 14px', flexShrink: 0,
  },
  headerAvatar: {
    width: 36, height: 36, borderRadius: '50%',
    background: 'rgba(255,255,255,0.95)', overflow: 'hidden', flexShrink: 0, padding: 4,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 0 0 1.5px rgba(0,201,167,0.4)',
  },
  headerName:   { fontSize: 14, fontWeight: 700, color: '#fff', fontFamily: FONT },
  headerStatus: { fontSize: 10, color: TEAL, fontFamily: FONT, marginTop: 1 },
  closeBtn: {
    background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.6)',
    fontSize: 16, cursor: 'pointer', padding: '0 4px', marginLeft: 'auto',
  },
  messages: { flex: 1, overflowY: 'auto', padding: '12px 12px 4px', display: 'flex', flexDirection: 'column' },
  bubble:   { maxWidth: '85%', fontSize: 13, fontFamily: FONT, lineHeight: 1.55, padding: '9px 13px' },
  quickRow: { display: 'flex', flexWrap: 'wrap', gap: 6, padding: '6px 10px' },
  quickBtn: {
    background: 'transparent', border: '1px solid', borderRadius: 16,
    fontSize: 11, fontFamily: FONT, padding: '5px 10px', cursor: 'pointer',
  },
  inputRow: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '8px 10px', borderTop: '1px solid', flexShrink: 0,
  },
  input: {
    flex: 1, border: 'none', outline: 'none',
    fontSize: 13, fontFamily: FONT, padding: '6px 0',
  },
  sendBtn: {
    width: 34, height: 34, borderRadius: '50%',
    background: `linear-gradient(135deg,${TEAL},#00E5CC)`,
    border: 'none', cursor: 'pointer', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  waBtn: {
    display: 'inline-flex', alignItems: 'center',
    background: '#25D366', color: '#fff', borderRadius: 20,
    padding: '6px 12px', fontSize: 11, fontFamily: FONT,
    textDecoration: 'none', marginTop: 4, fontWeight: 600,
  },
};
