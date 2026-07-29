import { useEffect, useState } from 'react';
import { API_BASE } from '../config/api.js';

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";

// What a stranger sees when they tap someone's sticker. Rendered straight from
// the owner's published blocks — this component never receives account data,
// only what the resolve endpoint chose to publish.
//
// Themes are named rather than free-form colours so a published page can't be
// made unreadable, and so the look stays recognisably MemoEra.
const THEMES = {
  midnight: { bg: 'linear-gradient(170deg,#0B0714,#141026 60%,#0B0714)', card: 'rgba(255,255,255,0.055)',
              line: 'rgba(255,255,255,0.10)', text: '#F4F1FA', muted: 'rgba(244,241,250,0.58)', accent: '#8B5CF6' },
  teal:     { bg: 'linear-gradient(170deg,#04120F,#062724 60%,#04120F)', card: 'rgba(255,255,255,0.055)',
              line: 'rgba(255,255,255,0.10)', text: '#EAFBF6', muted: 'rgba(234,251,246,0.58)', accent: '#00C9A7' },
  gold:     { bg: 'linear-gradient(170deg,#120E04,#241B08 60%,#120E04)', card: 'rgba(255,255,255,0.055)',
              line: 'rgba(255,255,255,0.10)', text: '#FBF5E6', muted: 'rgba(251,245,230,0.58)', accent: '#C9A84C' },
  light:    { bg: 'linear-gradient(170deg,#FBFAFD,#F1EEF8 60%,#FBFAFD)', card: '#FFFFFF',
              line: 'rgba(20,10,40,0.10)', text: '#16101F', muted: 'rgba(22,16,31,0.58)', accent: '#6D3BF5' },
};

export default function NfcPublicView({ code }) {
  const [state, setState] = useState('loading');
  const [data, setData]   = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/nfc/resolve?code=${encodeURIComponent(code)}`)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) { setState(res.status === 404 ? 'unknown' : 'error'); return; }
        const d = await res.json();
        setData(d);
        setState(d.state || 'error');
      })
      .catch(() => { if (!cancelled) setState('error'); });
    return () => { cancelled = true; };
  }, [code]);

  const t = THEMES[data?.theme] || THEMES.midnight;
  const shell = { minHeight: '100dvh', background: t.bg, color: t.text, fontFamily: FONT,
    display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 18px 56px' };

  if (state === 'loading') {
    return <div style={{ ...shell, justifyContent: 'center' }}>
      <div style={{ color: t.muted, fontSize: 14 }}>Opening…</div>
    </div>;
  }

  if (state !== 'ok') {
    const MESSAGES = {
      unknown:   ['🔍', "We don't recognise this sticker", "Check the ID printed on the back, or contact MemoEra support."],
      unclaimed: ['✨', 'This sticker is ready to activate', 'Open MemoEra, sign in and tap Activate NFC to make it yours.'],
      empty:     ['📄', 'Nothing published here yet', 'The owner has this sticker but hasn’t set up what it opens.'],
      blocked:   ['🔒', 'This sticker has been blocked', 'If you believe this is a mistake, contact MemoEra support.'],
      error:     ['⚠️', "Couldn't load this page", 'Check your connection and try again.'],
    };
    const [emoji, title, body] = MESSAGES[state] || MESSAGES.error;
    return (
      <div style={{ ...shell, justifyContent: 'center', textAlign: 'center' }}>
        <div style={{ fontSize: 44, marginBottom: 14 }}>{emoji}</div>
        <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em' }}>{title}</div>
        <p style={{ color: t.muted, fontSize: 14, maxWidth: 320, lineHeight: 1.6, marginTop: 8 }}>{body}</p>
        {data?.code && (
          <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, color: t.muted,
            border: `1px solid ${t.line}`, borderRadius: 10, padding: '7px 13px', marginTop: 18 }}>
            {data.code}
          </div>
        )}
        <a href="https://memoera.in" style={{ marginTop: 26, color: t.accent, fontSize: 13,
          fontWeight: 700, textDecoration: 'none' }}>memoera.in →</a>
      </div>
    );
  }

  const blocks = Array.isArray(data.blocks) ? data.blocks : [];

  return (
    <div style={shell}>
      <div style={{ width: '100%', maxWidth: 480, paddingTop: 'max(34px, env(safe-area-inset-top))' }}>
        {blocks.map((b, i) => <Block key={i} block={b} t={t} />)}
        {blocks.length === 0 && (
          <div style={{ color: t.muted, textAlign: 'center', fontSize: 14, padding: '60px 0' }}>
            Nothing published here yet.
          </div>
        )}
        <div style={{ textAlign: 'center', marginTop: 34 }}>
          <a href="https://memoera.in" style={{ color: t.muted, fontSize: 11, textDecoration: 'none',
            letterSpacing: '0.08em', fontWeight: 600 }}>
            POWERED BY MEMOERA
          </a>
        </div>
      </div>
    </div>
  );
}

function Block({ block, t }) {
  const card = { background: t.card, border: `1px solid ${t.line}`, borderRadius: 18,
    padding: 18, marginBottom: 14 };

  switch (block.type) {
    case 'profile':
      return (
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          {block.photoUrl
            ? <img src={block.photoUrl} alt="" style={{ width: 104, height: 104, borderRadius: '50%',
                objectFit: 'cover', border: `3px solid ${t.accent}` }} />
            : <div style={{ width: 104, height: 104, borderRadius: '50%', margin: '0 auto',
                background: `linear-gradient(135deg, ${t.accent}, ${t.accent}77)`, display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: 38, fontWeight: 800, color: '#fff' }}>
                {(block.name || '?').trim().charAt(0).toUpperCase()}
              </div>}
          <div style={{ fontSize: 25, fontWeight: 800, letterSpacing: '-0.03em', marginTop: 14 }}>
            {block.name}
          </div>
          {block.tagline && <div style={{ color: t.accent, fontSize: 13, fontWeight: 700, marginTop: 3 }}>{block.tagline}</div>}
          {block.bio && <p style={{ color: t.muted, fontSize: 14, lineHeight: 1.6, marginTop: 10 }}>{block.bio}</p>}
        </div>
      );

    case 'text':
      return (
        <div style={card}>
          {block.title && <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>{block.title}</div>}
          <p style={{ color: t.muted, fontSize: 14, lineHeight: 1.65, margin: 0, whiteSpace: 'pre-wrap' }}>{block.body}</p>
        </div>
      );

    case 'links':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
          {(block.items || []).map((it, i) => (
            <a key={i} href={it.url} target="_blank" rel="noopener noreferrer nofollow"
              style={{ ...card, marginBottom: 0, display: 'flex', alignItems: 'center', gap: 12,
                textDecoration: 'none', color: t.text, fontWeight: 700, fontSize: 14.5 }}>
              <span style={{ fontSize: 19 }}>{it.icon || '🔗'}</span>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
                whiteSpace: 'nowrap' }}>{it.label}</span>
              <span style={{ color: t.muted }}>→</span>
            </a>
          ))}
        </div>
      );

    case 'contact': {
      // tel:/mailto:/wa.me are the three actions people actually take from a
      // tapped card, so they're buttons rather than text to copy.
      const actions = [
        block.phone    && { label: 'Call',     href: `tel:${block.phone}`, icon: '📞' },
        block.whatsapp && { label: 'WhatsApp', href: `https://wa.me/${String(block.whatsapp).replace(/\D/g, '')}`, icon: '💬' },
        block.email    && { label: 'Email',    href: `mailto:${block.email}`, icon: '✉️' },
      ].filter(Boolean);
      if (!actions.length) return null;
      return (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(actions.length, 3)}, 1fr)`,
          gap: 10, marginBottom: 14 }}>
          {actions.map((a, i) => (
            <a key={i} href={a.href} style={{ ...card, marginBottom: 0, textAlign: 'center',
              textDecoration: 'none', color: t.text, padding: '14px 8px' }}>
              <div style={{ fontSize: 20 }}>{a.icon}</div>
              <div style={{ fontSize: 12, fontWeight: 700, marginTop: 4 }}>{a.label}</div>
            </a>
          ))}
        </div>
      );
    }

    case 'gallery':
      return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
          {(block.images || []).map((src, i) => (
            <img key={i} src={src} alt="" loading="lazy"
              style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 12,
                border: `1px solid ${t.line}` }} />
          ))}
        </div>
      );

    case 'map':
      return (
        <a href={`https://maps.google.com/?q=${encodeURIComponent(block.query || '')}`}
          target="_blank" rel="noopener noreferrer"
          style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: t.text }}>
          <span style={{ fontSize: 20 }}>📍</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{block.label || 'Find us'}</div>
            <div style={{ color: t.muted, fontSize: 12, marginTop: 2 }}>{block.query}</div>
          </div>
          <span style={{ color: t.muted }}>→</span>
        </a>
      );

    case 'hours':
      return (
        <div style={card}>
          <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8 }}>{block.title || 'Opening hours'}</div>
          {(block.rows || []).map((rw, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12,
              fontSize: 13, padding: '5px 0', color: t.muted }}>
              <span>{rw.day}</span><span style={{ color: t.text, fontWeight: 600 }}>{rw.time}</span>
            </div>
          ))}
        </div>
      );

    case 'products':
      return (
        <div style={{ marginBottom: 14 }}>
          {block.title && <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 10 }}>{block.title}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            {(block.items || []).map((p, i) => (
              <div key={i} style={{ ...card, marginBottom: 0, padding: 0, overflow: 'hidden' }}>
                {p.imageUrl && <img src={p.imageUrl} alt="" loading="lazy"
                  style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block' }} />}
                <div style={{ padding: 11 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{p.name}</div>
                  {p.price && <div style={{ color: t.accent, fontSize: 13, fontWeight: 800, marginTop: 3 }}>₹{p.price}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      );

    default:
      return null;
  }
}
