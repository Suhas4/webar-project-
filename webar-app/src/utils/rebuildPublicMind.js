import { loadPublicTargets, uploadPublicCombinedMind } from '../hooks/useArStorage.js';
import { COMPILER_URL } from '../hooks/loadMindARCompiler.js';
import { setCachedPublicMind } from '../hooks/useMindCache.js';
import { invalidateBackgroundPublicCompile } from '../hooks/backgroundCompilePublic.js';

export async function rebuildPublicMindInBackground() {
  try {
    const targets = await loadPublicTargets();
    if (!targets || targets.length === 0) return;

    // Order-sensitive: index assignment below depends on this exact order, and the
    // backend returns public targets via a stable `ORDER BY id`, so the fingerprint
    // must change whenever that order shifts (not just when the image set changes) —
    // otherwise a stale combined.mind can get reused with a mismatched index mapping.
    const fingerprint = targets.map((t) => t.imageUrl).join('|');

    const imageElements = await Promise.all(
      targets.map((t) => new Promise((resolve, reject) => {
        if (!t.imageUrl) { reject(new Error('missing imageUrl')); return; }
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = t.imageUrl;
      }))
    );

    if (!window.MINDAR?.IMAGE?.Compiler) {
      await import(/* @vite-ignore */ COMPILER_URL);
    }
    if (!window.MINDAR?.IMAGE?.Compiler) return;

    const compiler = new window.MINDAR.IMAGE.Compiler();
    await compiler.compileImageTargets(imageElements, () => {});
    const mindBuffer = await compiler.exportData();

    const arTargets = targets.map((t, i) => ({ id:t.id, targetIndex:i, label:t.label, planeWidth:t.planeWidth, planeHeight:t.planeHeight, planeOffsetY:t.planeOffsetY, videoUrl:t.videoUrl, targetType:t.targetType||'video', urlLink:t.urlLink||'', imageUrl:t.imageUrl||'' }));

    invalidateBackgroundPublicCompile();
    await Promise.all([
      uploadPublicCombinedMind(mindBuffer, fingerprint),
      setCachedPublicMind(fingerprint, mindBuffer, arTargets),
    ]);
  } catch {
  }
}
