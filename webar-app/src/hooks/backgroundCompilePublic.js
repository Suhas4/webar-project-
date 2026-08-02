// Pre-compiles (or pre-downloads) the public/guest AR mind file in the
// background while the user is on the Hello/welcome screen, so GuestScanScreen
// opens instantly with zero wait when they tap "Tap to Scan".
import { loadPublicTargets, uploadPublicCombinedMind } from './useArStorage.js';
import { getCachedPublicMind, setCachedPublicMind } from './useMindCache.js';
import { loadMindARCompiler } from './loadMindARCompiler.js';
import { fetchImageForAR } from './fetchImageForAR.js';
import { R2_PUBLIC_URL } from '../config/api.js';

let _result  = null; // { key, mindBuffer, arTargets }
let _promise = null; // running job promise

// `allowCompile` gates the from-scratch compile in step 3. It is off by default
// because this runs during app startup, where that path is ruinous — see the
// note above step 3.
export function startBackgroundPublicCompile(prefetchedTargets, { allowCompile = false } = {}) {
  if (_result || _promise) return;
  _promise = _doCompile(prefetchedTargets, allowCompile)
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
    id: t.id, // lets the AR scanner's Like/Save/Report buttons flag the right DB row
    targetIndex: i, label: t.label,
    planeWidth: t.planeWidth, planeHeight: t.planeHeight,
    planeOffsetY: t.planeOffsetY, videoUrl: t.videoUrl || '',
    targetType: t.targetType || 'video', urlLink: t.urlLink || '',
    imageUrl: t.imageUrl || '', // needed by the experimental jsfeat engine
  }));
}

async function _doCompile(prefetchedTargets, allowCompile) {
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

  // 3. Compile from scratch (first-time or stale pre-built).
  //
  // Only when explicitly asked for. Steps 1 and 2 are cheap — a cache read or a
  // single .mind download — but this step is not: it pulls the MindAR compiler
  // (~2 MB) plus every public target image at full size, then runs feature
  // extraction over all of them. That is fine on the scan screen, which shows a
  // "compiling" phase while it happens, and ruinous at app startup, which is
  // where this is called from.
  //
  // It bit hard: whenever the pre-built .mind in R2 goes stale, step 2 misses
  // and *every* app open silently fell into this path — several MB of image
  // downloads and a long main-thread compile competing with the home screen for
  // the same CPU, so the interface crawled and taps appeared to do nothing.
  // Stale is not an edge case either: the self-heal that refreshes the
  // pre-built (uploadPublicCombinedMind) no-ops without a signed-in token, so a
  // run of guest traffic leaves it stale indefinitely.
  //
  // Returning null here is safe: GuestScanScreen treats a missing background
  // result as "not ready" and runs its own identical compile, with UI.
  if (!allowCompile) return null;

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
  // Self-healing — see the matching note in GuestScanScreen.jsx: whichever
  // device pays for a from-scratch compile pushes it back to R2 so the next
  // scan anywhere gets the instant pre-built path instead.
  uploadPublicCombinedMind(mindBuffer, fingerprint).catch(() => {});
  return { key: fingerprint, mindBuffer, arTargets };
}
