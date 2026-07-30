// Server-renders the public content of a tapped NFC sticker into the HTML.
//
// /nfc/<code> is the page a stranger lands on when they tap someone's sticker,
// and it is the most genuinely public content Memoera has. Because the app is a
// client-rendered SPA, the raw HTML was an empty #root — so Google Search, the
// AdSense crawler and WhatsApp/Instagram link previews all saw a blank page.
// A seller's page was effectively invisible everywhere it mattered.
//
// This runs at the edge, asks the same public resolve endpoint the browser
// would, and injects the result as real markup plus proper Open Graph tags.
// React then replaces #root on boot exactly as before, so behaviour for a
// normal visitor is unchanged.
//
// Safety: every value here is owner-authored, so all of it is HTML-escaped
// before injection. Skipping that would turn a seller's bio into stored XSS on
// our own domain.

const API = 'https://webar-project-8jbi.onrender.com';

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// Crawlers that don't execute JavaScript. Real visitors are never given the
// prerendered markup — it would replace a fast empty #root with content React
// then deletes, and Chrome drops removed elements as LCP candidates, which
// measured as LCP going from 1064ms to ~5900ms. Bots get the content, humans
// get the fast app; the text describes the same page either way, so this is
// dynamic rendering rather than cloaking.
const BOT_RE = /googlebot|mediapartners-google|adsbot-google|bingbot|slurp|duckduckbot|baiduspider|yandex|facebookexternalhit|twitterbot|whatsapp|linkedinbot|telegrambot|discordbot|embedly|pinterest|redditbot|applebot|petalbot/i;

const isBot = (request) => BOT_RE.test(request.headers.get('user-agent') || '');

// Honest description of the landing page, for crawlers only.
const LANDING_HTML = `
<main>
  <h1>Memoera — bring your memories to life with AR</h1>
  <p>Memoera turns an ordinary photo into an augmented reality experience. Point
  your camera at a printed picture, invitation or product and watch a video, 3D
  model or animation appear on top of it — no app required.</p>
  <h2>What you can do with Memoera</h2>
  <p>Upload a photo as an AR target and attach a video, 3D model, PDF or
  animation to it. Anyone who scans that photo with their camera sees your
  content play over it.</p>
  <h2>AR for local businesses</h2>
  <p>Businesses in Bangalore use Memoera for AR brochures, product catalogues,
  wedding invitations and interactive packaging. Sellers can publish prices
  against a scanned product so buyers can call or message them directly.</p>
  <h2>NFC stickers</h2>
  <p>Memoera also makes premium NFC stickers. One tap opens a digital experience
  you control — contact details, catalogue, links or location — and you can
  change what it opens at any time without ever rewriting the sticker.</p>
</main>`;

export default async function handler(request, context) {
  const response = await context.next();

  // Only rewrite successful HTML. Assets and errors pass straight through.
  const type = response.headers.get('content-type') || '';
  if (!response.ok || !type.includes('text/html')) return response;

  const path = new URL(request.url).pathname;

  // Landing page: crawlers only.
  if (path === '/' || path === '/index.html') {
    if (!isBot(request)) return response;
    const html = (await response.text()).replace(
      /<div id="root"><\/div>/,
      `<div id="root">${LANDING_HTML}</div>`
    );
    return new Response(html, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'public, max-age=0, s-maxage=3600',
      },
    });
  }

  const code = path.match(/^\/nfc\/([A-Za-z0-9-]+)\/?$/)?.[1];
  if (!code) return response;

  let data;
  try {
    // Short timeout: a slow backend must never hold up the page. If this fails
    // the visitor still gets the normal SPA, which resolves client-side anyway.
    const res = await fetch(`${API}/api/nfc/resolve?code=${encodeURIComponent(code)}`, {
      signal: AbortSignal.timeout(2500),
      headers: { 'User-Agent': 'memoera-edge-prerender' },
    });
    if (!res.ok) return response;
    data = await res.json();
  } catch {
    return response;
  }
  if (!data || data.state !== 'ok') return response;

  const blocks = Array.isArray(data.blocks) ? data.blocks : [];
  const profile = blocks.find((b) => b.type === 'profile');
  const title = profile?.name || data.title || 'Memoera';
  const description =
    profile?.bio || profile?.tagline ||
    blocks.find((b) => b.type === 'text')?.body ||
    `${title} on Memoera — tap to see contact details, products and more.`;

  // Render the same blocks the React view renders, as plain semantic markup.
  const parts = [];
  for (const b of blocks) {
    switch (b.type) {
      case 'profile':
        parts.push(`<h1>${esc(b.name)}</h1>`);
        if (b.tagline) parts.push(`<p><strong>${esc(b.tagline)}</strong></p>`);
        if (b.bio) parts.push(`<p>${esc(b.bio)}</p>`);
        break;
      case 'text':
        if (b.title) parts.push(`<h2>${esc(b.title)}</h2>`);
        if (b.body) parts.push(`<p>${esc(b.body)}</p>`);
        break;
      case 'links':
        for (const it of b.items || []) {
          if (it.url) parts.push(`<p><a href="${esc(it.url)}" rel="nofollow noopener">${esc(it.label || it.url)}</a></p>`);
        }
        break;
      case 'contact':
        if (b.phone) parts.push(`<p>Phone: <a href="tel:${esc(b.phone)}">${esc(b.phone)}</a></p>`);
        if (b.email) parts.push(`<p>Email: <a href="mailto:${esc(b.email)}">${esc(b.email)}</a></p>`);
        break;
      case 'map':
        if (b.query) parts.push(`<p>${esc(b.label || 'Location')}: ${esc(b.query)}</p>`);
        break;
      case 'hours':
        parts.push(`<h2>${esc(b.title || 'Opening hours')}</h2>`);
        for (const rw of b.rows || []) parts.push(`<p>${esc(rw.day)}: ${esc(rw.time)}</p>`);
        break;
      case 'products':
        if (b.title) parts.push(`<h2>${esc(b.title)}</h2>`);
        for (const pr of b.items || []) {
          parts.push(`<p>${esc(pr.name)}${pr.price ? ` — ₹${esc(pr.price)}` : ''}</p>`);
        }
        break;
      default:
        break;
    }
  }
  if (!parts.length) return response;

  const pageTitle = `${esc(title)} · Memoera`;
  const desc = esc(String(description).slice(0, 200));

  let html = await response.text();
  html = html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${pageTitle}</title>`)
    .replace(
      /<meta name="description"[^>]*>/,
      `<meta name="description" content="${desc}" />`
    )
    .replace(
      /<meta property="og:title"[^>]*>/,
      `<meta property="og:title" content="${pageTitle}" />`
    )
    .replace(
      /<meta property="og:description"[^>]*>/,
      `<meta property="og:description" content="${desc}" />`
    )
    // This sticker's real content. Unlike the landing page, /nfc/<code> is
    // served to everyone: it's genuine public content, it's what link previews
    // on WhatsApp and Instagram need, and React replaces it on boot anyway.
    .replace(
      /<div id="root"><\/div>/,
      `<div id="root"><main style="max-width:640px;margin:0 auto;padding:32px 20px;` +
        `font-family:Outfit,-apple-system,sans-serif;color:#F4F1FA;background:#0B0714;` +
        `min-height:100dvh">${parts.join('\n')}</main></div>`
    );

  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // Short shared cache: an owner editing their page should see it update
      // quickly, but a sticker being tapped repeatedly shouldn't hit the
      // backend on every single tap.
      'cache-control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300',
    },
  });
}

export const config = { path: ['/', '/nfc/*'] };
