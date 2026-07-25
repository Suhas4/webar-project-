import { get, set, del } from 'idb-keyval';

// Persists compiled .mind across browser sessions.
// Stores raw ArrayBuffer (not blob URL) — blob URLs don't survive page reloads.
// Cache keyed by fingerprint = sorted imageUrls joined with '|'.

async function getCached(storeKey, fingerprint) {
  try {
    const entry = await get(storeKey);
    if (!entry || entry.fingerprint !== fingerprint) return null;
    return { mindBuffer: entry.mindBuffer, arTargets: entry.arTargets };
  } catch {
    return null;
  }
}

async function setCached(storeKey, fingerprint, mindBuffer, arTargets) {
  try {
    const buf = mindBuffer instanceof ArrayBuffer ? mindBuffer : await mindBuffer.arrayBuffer();
    await set(storeKey, { fingerprint, mindBuffer: buf, arTargets });
  } catch {
    // Storage quota exceeded — skip, session cache still works
  }
}

export const getCachedPublicMind = (fp) => getCached('mind-public', fp);
export const setCachedPublicMind = (fp, buf, targets) => setCached('mind-public', fp, buf, targets);
export const clearCachedPublicMind = () => del('mind-public').catch(() => {});
