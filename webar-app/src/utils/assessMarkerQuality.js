// Cheap client-side heuristic for "will this photo have enough visual detail
// to be recognized reliably as an AR marker?" — flat logos, plain-color
// backgrounds, and low-contrast scans tend to scan poorly because the
// recognition engines (MindAR and the in-house ORB engine alike) both work by
// matching distinctive corner/edge features, not raw pixels. This doesn't
// replicate that matching — it's a fast proxy (average local gradient
// magnitude over a downscaled grayscale copy) good enough to warn upload-time,
// without paying for a real corner-detection pass on every image pick.
const SAMPLE_SIZE = 160;
const LOW_DETAIL_THRESHOLD = 8; // empirical — busy photos score 20-60+, flat logos score 1-6

export function assessMarkerQuality(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = SAMPLE_SIZE;
        canvas.height = SAMPLE_SIZE;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
        const { data } = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

        const gray = new Float32Array(SAMPLE_SIZE * SAMPLE_SIZE);
        for (let i = 0; i < gray.length; i++) {
          const o = i * 4;
          gray[i] = data[o] * 0.299 + data[o + 1] * 0.587 + data[o + 2] * 0.114;
        }

        let gradSum = 0;
        for (let y = 1; y < SAMPLE_SIZE - 1; y++) {
          for (let x = 1; x < SAMPLE_SIZE - 1; x++) {
            const i = y * SAMPLE_SIZE + x;
            const gx = gray[i + 1] - gray[i - 1];
            const gy = gray[i + SAMPLE_SIZE] - gray[i - SAMPLE_SIZE];
            gradSum += Math.sqrt(gx * gx + gy * gy);
          }
        }
        const score = gradSum / (SAMPLE_SIZE * SAMPLE_SIZE);
        URL.revokeObjectURL(url);
        resolve({ score, isLowDetail: score < LOW_DETAIL_THRESHOLD });
      } catch {
        URL.revokeObjectURL(url);
        resolve(null); // never block upload on this check failing
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}
