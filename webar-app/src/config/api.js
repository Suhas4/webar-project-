// In dev, default to same-origin so requests go through Vite's own /api proxy
// (vite.config.js) to localhost:8181. This lets the app work over ngrok or a
// LAN IP without ever needing VITE_API_BASE to point at a real host — the
// browser calls a relative /api/... path no matter what domain served the page.
export const API_BASE = import.meta.env.VITE_API_BASE ?? (import.meta.env.DEV ? '' : 'https://webar-project-8jbi.onrender.com');
export const R2_PUBLIC_URL = (import.meta.env.VITE_R2_PUBLIC_URL ?? 'https://pub-4cb6dfb082c64346a30587f3e9123a37.r2.dev').replace(/\/$/, '');

// Backend error responses are usually JSON ({ error: "..." }) but some failure
// paths (proxy errors, 503s) return plain text. Falling back to the raw text
// keeps the real server message visible instead of masking it as a network error.
export async function parseApiResponse(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: text || `Server error (${res.status}).` };
  }
}

// The backend runs on a free instance that sleeps after ~15 minutes idle and
// cold-starts (30-60s+) on the next request — a request landing in that window
// fails at the network level (fetch throws, not an HTTP error status). Retrying
// with backoff rides out the cold start instead of surfacing a hard failure.
export async function fetchWithRetry(url, options, { retries = 3, baseDelayMs = 3000, onRetry } = {}) {
  // Only GET/HEAD are retried on a server error. A 5xx can mean the request
  // was actually applied and only the response was lost, so replaying a POST
  // or PUT risks writing twice.
  const method = (options?.method || 'GET').toUpperCase();
  const replayable = method === 'GET' || method === 'HEAD';

  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, options);
      // A cold-starting instance answers 502/503/504 for the first requests
      // while it boots. Handing that straight back is indistinguishable from
      // a legitimate empty response, which is what made "Tap to Scan" report
      // "no AR targets" and refuse to open the camera after the backend had
      // been idle. Treat a transient 5xx like a thrown network error.
      if (replayable && res.status >= 500 && attempt < retries) {
        onRetry && onRetry(attempt + 1);
        await new Promise((r) => setTimeout(r, baseDelayMs * (attempt + 1)));
        continue;
      }
      return res;
    } catch (err) {
      if (attempt >= retries) throw err;
      onRetry && onRetry(attempt + 1);
      await new Promise((r) => setTimeout(r, baseDelayMs * (attempt + 1)));
    }
  }
}
