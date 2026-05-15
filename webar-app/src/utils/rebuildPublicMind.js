import { loadPublicTargets, uploadPublicCombinedMind } from '../hooks/useArStorage.js';
import { setCachedPublicMind } from '../hooks/useMindCache.js';

// Rebuilds the pre-compiled public .mind and uploads it to R2 at public/combined.mind.
// Fire-and-forget — called in the background after any PUBLIC target upload.
// Next guest scan downloads this one file instead of recompiling N images.
export async function rebuildPublicMindInBackground() {
  try {
    const targets = await loadPublicTargets();
    if (!targets || targets.length === 0) return;

    const fingerprint = targets.map((t) => t.imageUrl).sort().join('|');

    const imageElements = await Promise.all(
      targets.map(
        (t) =>
          new Promise((resolve, reject) => {
            if (!t.imageUrl) { reject(new Error('missing imageUrl')); return; }
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = t.imageUrl;
          })
      )
    );

    if (!window.MINDAR?.IMAGE?.Compiler) {
      await import('https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image.prod.js');
    }
    if (!window.MINDAR?.IMAGE?.Compiler) return;

    const compiler = new window.MINDAR.IMAGE.Compiler();
    await compiler.compileImageTargets(imageElements, () => {});
    const mindBuffer = await compiler.exportData();

    const arTargets = targets.map((t, i) => ({
      targetIndex: i,
      label: t.label,
      planeWidth: t.planeWidth,
      planeHeight: t.planeHeight,
      planeOffsetY: t.planeOffsetY,
      videoUrl: t.videoUrl,
      targetType: t.targetType || 'video',
      urlLink: t.urlLink || '',
    }));

    // Upload to R2 + warm local IndexedDB cache at the same time
    await Promise.all([
      uploadPublicCombinedMind(mindBuffer, fingerprint),
      setCachedPublicMind(fingerprint, mindBuffer, arTargets),
    ]);
  } catch (err) {
    console.warn('[rebuildPublicMind] failed silently:', err?.message);
  }
}
