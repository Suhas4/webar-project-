const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';

// SHA-256 hash of the exact file bytes — used to detect the exact same photo
// being uploaded by a different account.
export async function hashImageFile(file) {
  const buf  = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

// Returns true if this exact image is already registered to a DIFFERENT user.
export async function isImageOwnedByAnotherUser(file, userId) {
  if (!BACKEND_URL || !userId) return false; // fail-open if not configured
  try {
    const imageHash = await hashImageFile(file);
    const res = await fetch(`${BACKEND_URL}/api/content-safety/check-duplicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageHash, userId }),
    });
    if (!res.ok) return false; // fail-open on backend error
    const data = await res.json();
    return !!data.duplicate;
  } catch {
    return false; // fail-open on network error — never block uploads due to our own outage
  }
}

// Returns { flagged, categories } for explicit/illegal content detection.
export async function checkImageModeration(file) {
  if (!BACKEND_URL) return { flagged: false, categories: [] };
  try {
    const imageBase64 = await fileToDataUrl(file);
    const res = await fetch(`${BACKEND_URL}/api/content-safety/check-moderation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64 }),
    });
    if (!res.ok) return { flagged: false, categories: [] };
    return await res.json();
  } catch {
    return { flagged: false, categories: [] };
  }
}

// Grabs a single representative frame from a video file as a JPEG File, for
// running moderation checks against video uploads too.
export function extractVideoThumbnail(videoFile) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url   = URL.createObjectURL(videoFile);
    video.src         = url;
    video.muted       = true;
    video.playsInline = true;
    video.preload     = 'metadata';
    video.onerror     = () => { URL.revokeObjectURL(url); reject(new Error('Could not read video')); };
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(1, (video.duration || 1) * 0.1);
    };
    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      canvas.width  = video.videoWidth  || 480;
      canvas.height = video.videoHeight || 480;
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        if (!blob) return reject(new Error('Thumbnail extraction failed'));
        resolve(new File([blob], 'thumb.jpg', { type: 'image/jpeg' }));
      }, 'image/jpeg', 0.85);
    };
  });
}
