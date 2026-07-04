/**
 * Load an image for MindAR compilation in a way that works in Capacitor WebView.
 *
 * Problem: img.crossOrigin = 'anonymous' sends Origin: http://localhost to the CDN.
 * If the CDN's CORS policy doesn't list localhost, the img.onerror fires and
 * compilation fails with "Failed to load marker image N".
 *
 * Solution: fetch() → Blob → ObjectURL → <img>
 * ObjectURLs are same-origin so the image is never canvas-tainted, which means
 * MindAR's compiler can call getImageData() on the canvas without SecurityError.
 */
// MindAR's tracker works from downsampled feature points internally — feeding it a
// full-resolution upload (often several MB, 3000px+) just makes the compiler spend
// seconds decoding/scanning pixels that get thrown away anyway. Capping the longest
// side here cuts compile time substantially with no tracking-quality loss.
const MAX_COMPILE_DIM = 1024;

export async function fetchImageForAR(url, label) {
  // Primary: fetch → blob URL (avoids both CORS taint and CORS header dependency
  // for the img element itself)
  try {
    const resp = await fetch(url, { cache: 'default' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const blob    = await resp.blob();
    const blobUrl = URL.createObjectURL(blob);
    try {
      const img = await loadImg(blobUrl, false);
      return downscaleForCompile(img);
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  } catch (fetchErr) {
    // Fallback: direct crossOrigin load (works when CDN has Access-Control-Allow-Origin: *)
    try {
      const img = await loadImg(url, true);
      return downscaleForCompile(img);
    } catch {
      throw new Error('Failed to load marker image: ' + (label || url));
    }
  }
}

function loadImg(src, crossOrigin) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = 'anonymous';
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error('img.onerror for ' + src));
    img.src = src;
  });
}

// Returns the original <img> untouched if it's already small enough, otherwise a
// same-size-capped <canvas> (MindAR's compiler accepts either via drawImage).
function downscaleForCompile(img) {
  const w = img.naturalWidth, h = img.naturalHeight;
  const longest = Math.max(w, h);
  if (!longest || longest <= MAX_COMPILE_DIM) return img;

  const scale = MAX_COMPILE_DIM / longest;
  const canvas = document.createElement('canvas');
  canvas.width  = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}
