/**
 * useArStorage - Cloud storage for AR assets.
 *
 * Replaces IndexedDB with:
 *   Cloudflare R2  - images, videos, .mind compiled file
 *   Neon PostgreSQL - target metadata (via Go backend)
 */
import { API_BASE } from "../config/api.js";

function getToken() {
  return localStorage.getItem("memoera_token") || "";
}

async function uploadPresigned(key, blob, contentType) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/api/upload/presign`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
    body: JSON.stringify({ key, contentType }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to get upload URL");
  }
  const { url } = await res.json();
  const uploadRes = await fetch(url, { method: "PUT", body: blob, headers: { "Content-Type": contentType } });
  if (!uploadRes.ok) throw new Error(`R2 upload failed: ${uploadRes.status}`);
}

const CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB

async function uploadMultipart(key, blob, contentType, onProgress) {
  const token = getToken();
  const auth = { "Content-Type": "application/json", "Authorization": `Bearer ${token}` };

  const initRes = await fetch(`${API_BASE}/api/upload/multipart/init`, {
    method: "POST", headers: auth,
    body: JSON.stringify({ key, contentType }),
  });
  if (!initRes.ok) {
    const err = await initRes.json().catch(() => ({}));
    throw new Error(err.error || "Failed to initiate upload");
  }
  const { uploadId } = await initRes.json();

  const totalChunks = Math.ceil(blob.size / CHUNK_SIZE);
  const parts = [];

  try {
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const chunk = blob.slice(start, Math.min(start + CHUNK_SIZE, blob.size));
      const partNumber = i + 1;

      const partRes = await fetch(`${API_BASE}/api/upload/multipart/part-url`, {
        method: "POST", headers: auth,
        body: JSON.stringify({ key, uploadId, partNumber }),
      });
      if (!partRes.ok) throw new Error(`Failed to get URL for part ${partNumber}`);
      const { url } = await partRes.json();

      const uploadRes = await fetch(url, { method: "PUT", body: chunk, headers: { "Content-Type": contentType } });
      if (!uploadRes.ok) throw new Error(`Part ${partNumber} upload failed: ${uploadRes.status}`);

      const etag = (uploadRes.headers.get("ETag") || "").replace(/"/g, "");
      parts.push({ partNumber, etag });
      onProgress && onProgress(Math.round(((i + 1) / totalChunks) * 100));
    }

    const completeRes = await fetch(`${API_BASE}/api/upload/multipart/complete`, {
      method: "POST", headers: auth,
      body: JSON.stringify({ key, uploadId, parts }),
    });
    if (!completeRes.ok) throw new Error("Failed to complete upload");

  } catch (err) {
    fetch(`${API_BASE}/api/upload/multipart/abort`, {
      method: "POST", headers: auth,
      body: JSON.stringify({ key, uploadId }),
    }).catch(() => {});
    throw err;
  }
}

/**
 * saveTargets — uploads images, videos (or URL targets), .mind file, then saves metadata.
 *
 * @param {Array}       targetsMeta  — each item: { label, planeWidth, planeHeight, planeOffsetY, targetType, urlLink }
 * @param {ArrayBuffer} mindBuffer
 * @param {Array|null}  videoBlobs   — null/empty for URL-type targets (no video upload)
 * @param {Array}       imageBlobs
 * @param {Function}    onProgress
 * @param {boolean}     isPublic     — whether targets are visible to all users when scanning
 */
export async function saveTargets(targetsMeta, mindBuffer, videoBlobs, imageBlobs, onProgress, isPublic = false) {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const meRes = await fetch(`${API_BASE}/api/me`, { headers: { "Authorization": `Bearer ${token}` } });
  if (!meRes.ok) throw new Error("Failed to authenticate");
  const { id: userID } = await meRes.json();

  const ts = Date.now();
  const n = targetsMeta.length;
  const hasVideos = videoBlobs && videoBlobs.length > 0;
  let overallProgress = 0;
  const imageWeight = (0.2 / (n + 1)) * 100;
  const mindWeight  = (0.2 / (n + 1)) * 100;
  const videoWeight = hasVideos ? (0.8 / n) * 100 : 0;
  const report = (delta) => {
    overallProgress = Math.min(100, overallProgress + delta);
    onProgress && onProgress(Math.round(overallProgress));
  };

  const imageKeys = await Promise.all(
    imageBlobs.map(async (blob, i) => {
      const key = `users/${userID}/images/target-${i}-${ts}.jpg`;
      await uploadPresigned(key, blob, blob.type || "image/jpeg");
      report(imageWeight);
      return key;
    })
  );

  const videoKeys = [];
  if (hasVideos) {
    for (let i = 0; i < videoBlobs.length; i++) {
      const blob = videoBlobs[i];
      const key = `users/${userID}/videos/target-${i}-${ts}.mp4`;
      await uploadMultipart(key, blob, blob.type || "video/mp4", null);
      report(videoWeight);
      videoKeys.push(key);
    }
  } else {
    targetsMeta.forEach(() => videoKeys.push(""));
  }

  const mindKey = `users/${userID}/mind/targets-${ts}.mind`;
  await uploadPresigned(mindKey, new Blob([mindBuffer], { type: "application/octet-stream" }), "application/octet-stream");
  report(mindWeight);

  const saveRes = await fetch(`${API_BASE}/api/targets/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
    body: JSON.stringify({
      targets: targetsMeta.map((meta, i) => ({
        targetIndex: i,
        label: meta.label,
        planeWidth: meta.planeWidth,
        planeHeight: meta.planeHeight,
        planeOffsetY: meta.planeOffsetY,
        imageKey: imageKeys[i],
        videoKey: videoKeys[i],
        targetType: meta.targetType || "video",
        urlLink: meta.urlLink || "",
      })),
      mindKey,
      isPublic,
    }),
  });
  if (!saveRes.ok) {
    const err = await saveRes.json().catch(() => ({}));
    throw new Error(err.error || "Failed to save target metadata");
  }
}

export async function loadTargets() {
  const token = getToken();
  if (!token) return { targets: null, mindFileUrl: null, hasData: false, imagePreviewUrls: [] };

  let data;
  try {
    const res = await fetch(`${API_BASE}/api/targets`, { headers: { "Authorization": `Bearer ${token}` } });
    if (!res.ok) return { targets: null, mindFileUrl: null, hasData: false, imagePreviewUrls: [] };
    data = await res.json();
  } catch {
    return { targets: null, mindFileUrl: null, hasData: false, imagePreviewUrls: [] };
  }

  if (!data.hasData || !data.targets?.length) {
    return { targets: null, mindFileUrl: null, hasData: false, imagePreviewUrls: [] };
  }

  const imagePreviewUrls = data.targets.map((t) => t.imageUrl).filter(Boolean);
  const targets = data.targets.map((t) => ({
    label: t.label,
    targetIndex: t.targetIndex,
    planeWidth: t.planeWidth,
    planeHeight: t.planeHeight,
    planeOffsetY: t.planeOffsetY,
    videoUrl: t.videoUrl,
    targetType: t.targetType || "video",
    urlLink: t.urlLink || "",
    _imagePreviewUrl: t.imageUrl,
    _videoBlob: null,
    _imageBlob: null,
  }));

  return { targets, mindFileUrl: data.mindUrl, hasData: true, imagePreviewUrls };
}

/**
 * loadPublicTargets — fetches all public targets (no auth required).
 * Used by the guest scanner to compile a combined .mind and scan all public markers.
 */
export async function loadPublicTargets() {
  try {
    const res = await fetch(`${API_BASE}/api/targets/public`);
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.targets?.length) return [];
    return data.targets.map((t) => ({
      label: t.label,
      planeWidth: t.planeWidth,
      planeHeight: t.planeHeight,
      planeOffsetY: t.planeOffsetY,
      imageUrl: t.imageUrl,
      videoUrl: t.videoUrl,
      targetType: t.targetType || "video",
      urlLink: t.urlLink || "",
    }));
  } catch {
    return [];
  }
}

export async function clearTargets() {
  const token = getToken();
  if (!token) return;
  await fetch(`${API_BASE}/api/targets/delete`, {
    method: "DELETE",
    headers: { "Authorization": `Bearer ${token}` },
  }).catch(() => {});
}

export async function hasStoredTargets() {
  const { hasData } = await loadTargets();
  return hasData;
}
