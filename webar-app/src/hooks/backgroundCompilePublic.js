// Pre-compiles (or pre-downloads) the public/guest AR mind file in the
// background while the user is on the Hello/welcome screen, so GuestScanScreen
// opens instantly with zero wait when they tap "Tap to Scan".
import { loadPublicTargets } from './useArStorage.js';
import { getCachedPublicMind, setCachedPublicMind } from './useMindCache.js';
import { loadMindARCompiler } from './loadMindARCompiler.js';
import { fetchImageForAR } from './fetchImageForAR.js';
import { R2_PUBLIC_URL } from '../config/api.js';

let _result  = null; // { key, mindBuffer, arTargets }
let _promise = null; // running job promise

export function startBackgroundPublicCompile(prefetchedTargets) {
  if (_result || _promise) return;
  _promise = _doCompile(prefetchedTargets)
    .then((r) => { _result = r; })
    .catch(() => {})
    .finally(() => { _promise = null; });
}

// Returns true if the result is already available (no waiting needed).
export function isPublicResultReady() { return !!_result; }

// Await the background result; resolves immediately if already done.
export async function waitForBackgroundPublicResult() {
  if (_result) return _result;
  if (_promise) { await _promise; return _result; }
  return null;
}

// Claim the result — clears it so a later scan re-uses cache normally.
export function consumeBackgroundPublicResult() {
  const r = _result;
  _result  = null;
  _promise = null;
  return r;
}

// Call when public targets are invalidated (new upload, cache clear).
export function invalidateBackgroundPublicCompile() {
  _result  = null;
  _promise = null;
}

function buildArTargets(targets) {
  return targets.map((t, i) => ({
    targetIndex: i, label: t.label,
    planeWidth: t.planeWidth, planeHeight: t.planeHeight,
    planeOffsetY: t.planeOffsetY, videoUrl: t.videoUrl || '',
    targetType: t.targetType || 'video', urlLink: t.urlLink || '',
    imageUrl: t.imageUrl || '', // needed by the experimental jsfeat engine
  }));
}

async function _doCompile(prefetchedTargets) {
  const publicTargets = prefetchedTargets?.length > 0 ? prefetchedTargets : await loadPublicTargets();
  if (!publicTargets || publicTargets.length === 0) return null;

  const fingerprint = publicTargets.map((t) => t.imageUrl).join('|');

  // 1. IndexedDB cache — fast path, no download or compile needed.
  const idbHit = await getCachedPublicMind(fingerprint);
  if (idbHit && idbHit.arTargets?.every((t) => !!t.imageUrl)) {
    return { key: fingerprint, mindBuffer: idbHit.mindBuffer, arTargets: idbHit.arTargets };
  }

  // 2. Pre-built .mind in R2 — just a download, no CPU-heavy compile.
  try {
    const fpRes = await fetch(`${R2_PUBLIC_URL}/public/combined-fingerprint.txt`, { cache: 'no-cache' });
    if (fpRes.ok) {
      const storedFp = (await fpRes.text()).trim();
      if (storedFp === fingerprint) {
        const mindRes = await fetch(`${R2_PUBLIC_URL}/public/combined.mind`);
        if (mindRes.ok) {
          const mindBuffer = await mindRes.arrayBuffer();
          const arTargets = buildArTargets(publicTargets);
          setCachedPublicMind(fingerprint, mindBuffer, arTargets).catch(() => {});
          return { key: fingerprint, mindBuffer, arTargets };
        }
      }
    }
  } catch {
    // Pre-built not available — fall through to compile
  }

  // 3. Compile from scratch (first-time or stale pre-built)
  try {
    await loadMindARCompiler();
  } catch {
    return null;
  }

  const rawResults = await Promise.allSettled(
    publicTargets.map((t, i) => {
      if (!t.imageUrl) return Promise.reject(new Error('missing image'));
      return fetchImageForAR(t.imageUrl, t.label || ('Target ' + (i + 1)));
    })
  );
  const imageElements = [];
  const validTargets  = [];
  rawResults.forEach((r, i) => {
    if (r.status === 'fulfilled') { imageElements.push(r.value); validTargets.push(publicTargets[i]); }
  });
  if (!imageElements.length) return null;

  const compiler = new window.MINDAR.IMAGE.Compiler();
  await compiler.compileImageTargets(imageElements, null);

  const mindBuffer = await compiler.exportData();
  const arTargets  = buildArTargets(validTargets);

  setCachedPublicMind(fingerprint, mindBuffer, arTargets).catch(() => {});
  return { key: fingerprint, mindBuffer, arTargets };
}
