/**
 * useArStorage — IndexedDB persistence for uploaded AR assets.
 *
 * Uses idb-keyval (tiny wrapper around the IndexedDB API) to store:
 *   'ar-targets'    → JSON array of target metadata (no blobs)
 *   'ar-mind-file'  → ArrayBuffer of the compiled .mind file
 *   'ar-video-{i}'  → Blob of the video for target index i
 *   'ar-image-{i}'  → Blob of the marker image for target index i
 *
 * Blob URLs are NOT stored — they are created fresh on each loadTargets() call
 * and must be revoked by the caller when no longer needed.
 */
import { get, set, del } from 'idb-keyval';

/**
 * saveTargets — persist all AR assets to IndexedDB.
 *
 * @param {Array<{label:string, planeWidth:number, planeHeight:number, planeOffsetY:number}>} targetsMeta
 * @param {ArrayBuffer} mindBuffer — compiled .mind binary from MindAR compiler
 * @param {Blob[]} videoBlobs — one Blob per target (same order as targetsMeta)
 * @param {Blob[]} imageBlobs — one Blob per target (same order as targetsMeta)
 */
export async function saveTargets(targetsMeta, mindBuffer, videoBlobs, imageBlobs) {
  await set('ar-targets', targetsMeta);
  await set('ar-mind-file', mindBuffer);
  for (let i = 0; i < targetsMeta.length; i++) {
    if (videoBlobs[i]) await set(`ar-video-${i}`, videoBlobs[i]);
    if (imageBlobs[i]) await set(`ar-image-${i}`, imageBlobs[i]);
  }
}

/**
 * loadTargets — restore AR assets from IndexedDB and create blob URLs.
 *
 * @returns {Promise<{
 *   targets: Array|null,
 *   mindFileUrl: string|null,
 *   hasData: boolean,
 *   imagePreviewUrls: string[]
 * }>}
 *
 * ⚠️  The caller MUST revoke all returned blob URLs when done:
 *       URL.revokeObjectURL(mindFileUrl)
 *       targets.forEach(t => URL.revokeObjectURL(t.videoUrl))
 *       imagePreviewUrls.forEach(u => URL.revokeObjectURL(u))
 */
export async function loadTargets() {
  const targetsMeta = await get('ar-targets');
  const mindBuffer = await get('ar-mind-file');

  if (!targetsMeta || !mindBuffer) {
    return { targets: null, mindFileUrl: null, hasData: false, imagePreviewUrls: [] };
  }

  // Create a blob URL for the .mind file so MindAR can fetch it
  const mindBlob = new Blob([mindBuffer], { type: 'application/octet-stream' });
  const mindFileUrl = URL.createObjectURL(mindBlob);

  const imagePreviewUrls = [];

  const targets = await Promise.all(
    targetsMeta.map(async (meta, i) => {
      const videoBlob = await get(`ar-video-${i}`);
      const imageBlob = await get(`ar-image-${i}`);

      const videoUrl = videoBlob ? URL.createObjectURL(videoBlob) : null;
      const imagePreviewUrl = imageBlob ? URL.createObjectURL(imageBlob) : null;
      if (imagePreviewUrl) imagePreviewUrls.push(imagePreviewUrl);

      return {
        ...meta,
        targetIndex: i,
        videoUrl,
        // Store the image blob URL so SetupScreen can show previews
        _imagePreviewUrl: imagePreviewUrl,
        _videoBlob: videoBlob,
        _imageBlob: imageBlob,
      };
    })
  );

  return { targets, mindFileUrl, hasData: true, imagePreviewUrls };
}

/**
 * clearTargets — delete all stored AR assets from IndexedDB.
 *
 * @param {number} count — number of targets to clear (needed to delete indexed keys)
 */
export async function clearTargets(count = 10) {
  await del('ar-targets');
  await del('ar-mind-file');
  for (let i = 0; i < count; i++) {
    await del(`ar-video-${i}`);
    await del(`ar-image-${i}`);
  }
}

/**
 * hasStoredTargets — quick check without loading all blobs.
 * Useful for deciding whether to show setup or AR on first load.
 */
export async function hasStoredTargets() {
  const meta = await get('ar-targets');
  return Array.isArray(meta) && meta.length > 0;
}
