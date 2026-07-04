// Pre-compiles AR targets in the background while user is on home screen,
// so UserScanScreen opens instantly with zero compilation delay.
import { loadTargets } from './useArStorage.js';
import { getCachedUserMind, setCachedUserMind } from './useMindCache.js';
import { loadMindARCompiler } from './loadMindARCompiler.js';
import { fetchImageForAR } from './fetchImageForAR.js';

let _result  = null; // { key, mindBuffer, arTargets }
let _promise = null; // running compile promise

export function startBackgroundCompile() {
  if (_result || _promise) return;
  _promise = _doCompile()
    .then((r) => { _result = r; })
    .catch(() => {})
    .finally(() => { _promise = null; });
}

// Returns true if the result is already available (no waiting needed).
export function isResultReady() { return !!_result; }

// Await the background result; resolves immediately if already done.
export async function waitForBackgroundResult() {
  if (_result) return _result;
  if (_promise) { await _promise; return _result; }
  return null;
}

// Claim the result — clears it so the next scan re-uses cache normally.
export function consumeBackgroundResult() {
  const r = _result;
  _result  = null;
  _promise = null;
  return r;
}

// Call when targets are invalidated (new upload).
export function invalidateBackgroundCompile() {
  _result  = null;
  _promise = null;
}

async function _doCompile() {
  // Only compile the logged-in user's own targets.
  // Public targets are handled separately by GuestScanScreen.
  const ownResult = await loadTargets();

  const merged = [];
  const seen   = new Set();

  if (ownResult.hasData && ownResult.targets) {
    for (const t of ownResult.targets) {
      const imgUrl = t._imagePreviewUrl;
      if (imgUrl && !seen.has(imgUrl)) {
        seen.add(imgUrl);
        merged.push({
          imageUrl: imgUrl, videoUrl: t.videoUrl || '',
          targetType: t.targetType || 'video', urlLink: t.urlLink || '',
          label: t.label, planeWidth: t.planeWidth,
          planeHeight: t.planeHeight, planeOffsetY: t.planeOffsetY,
        });
      }
    }
  }

  if (!merged.length) return null;

  const fingerprint = merged.map((t) => t.imageUrl).sort().join('|');

  // IndexedDB cache — fast path, no recompile needed. Reject entries cached
  // before arTargets gained the `imageUrl` field (needed by the experimental
  // jsfeat/capture scan engines) — those would silently lack it forever
  // since a cache hit skips the code that would populate it.
  const idbHit = await getCachedUserMind(fingerprint);
  if (idbHit && idbHit.arTargets?.every((t) => !!t.imageUrl)) {
    return { key: fingerprint, mindBuffer: idbHit.mindBuffer, arTargets: idbHit.arTargets };
  }

  // Load MindAR compiler via script tag
  try {
    await loadMindARCompiler();
  } catch {
    return null;
  }

  // Use allSettled so one failed image doesn't abort the whole compile
  const rawResults = await Promise.allSettled(
    merged.map((t, i) => fetchImageForAR(t.imageUrl, t.label || ('Target ' + (i + 1))))
  );
  const imageElements = [];
  const validMerged   = [];
  rawResults.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      imageElements.push(r.value);
      validMerged.push(merged[i]);
    }
  });

  if (!imageElements.length) return null;

  // Compile — no progress callback so it runs full-speed in background
  const compiler = new window.MINDAR.IMAGE.Compiler();
  await compiler.compileImageTargets(imageElements, null);

  const mindBuffer = await compiler.exportData();
  const arTargets  = validMerged.map((t, i) => ({
    targetIndex: i, label: t.label,
    planeWidth: t.planeWidth, planeHeight: t.planeHeight,
    planeOffsetY: t.planeOffsetY, videoUrl: t.videoUrl || '',
    targetType: t.targetType || 'video', urlLink: t.urlLink || '',
    imageUrl: t.imageUrl || '', // needed by the experimental jsfeat engine
  }));

  setCachedUserMind(fingerprint, mindBuffer, arTargets).catch(() => {});
  return { key: fingerprint, mindBuffer, arTargets };
}
