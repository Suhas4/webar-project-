import { API_BASE, R2_PUBLIC_URL } from "../config/api.js";

function getToken() {
  return localStorage.getItem("memoera_token") || "";
}

export async function uploadPresigned(key, blob, contentType) {
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

const CHUNK_SIZE = 10 * 1024 * 1024;

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

export async function saveTargets(targetsMeta, mindBuffer, videoBlobs, imageBlobs, onProgress, isPublic = false, glbBlobs = null) {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const meRes = await fetch(`${API_BASE}/api/me`, { headers: { "Authorization": `Bearer ${token}` } });
  if (!meRes.ok) throw new Error("Failed to authenticate");
  const { id: userID } = await meRes.json();

  const ts = Date.now();
  const n = targetsMeta.length;
  const hasVideos = videoBlobs && videoBlobs.length > 0;
  const hasGlbs   = glbBlobs   && glbBlobs.length   > 0;
  let overallProgress = 0;
  const imageWeight = (0.2 / (n + 1)) * 100;
  const mindWeight  = (0.2 / (n + 1)) * 100;
  const videoWeight = hasVideos ? (0.8 / n) * 100 : 0;
  const glbWeight   = hasGlbs   ? (0.4 / n) * 100 : 0;
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

  // Upload 3D model / document files and build their R2 public URLs — keep the
  // original extension so the AR viewer (or browser, for documents) knows what
  // it's looking at. PDF in particular MUST get the right content-type, or the
  // browser downloads it instead of rendering it inline on window.open().
  const MODEL_CONTENT_TYPES = {
    glb: "model/gltf-binary", gltf: "model/gltf+json", obj: "text/plain", fbx: "application/octet-stream",
    pdf: "application/pdf", psd: "image/vnd.adobe.photoshop", cdr: "application/x-coreldraw",
    ai: "application/postscript", doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
  const glbUrls = [];
  if (hasGlbs) {
    for (let i = 0; i < glbBlobs.length; i++) {
      const blob = glbBlobs[i];
      if (blob) {
        const ext = (blob.name || "").split(".").pop().toLowerCase() || "glb";
        const key = `users/${userID}/models/target-${i}-${ts}.${ext}`;
        await uploadPresigned(key, blob, MODEL_CONTENT_TYPES[ext] || "application/octet-stream");
        glbUrls.push(`${R2_PUBLIC_URL}/${key}`);
        report(glbWeight);
      } else {
        glbUrls.push("");
      }
    }
  } else {
    targetsMeta.forEach(() => glbUrls.push(""));
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
        urlLink: glbUrls[i] || meta.urlLink || "",
        animationEffect: meta.animationEffect || "",
        fileSizeBytes: (imageBlobs[i]?.size || 0) + (hasVideos ? (videoBlobs[i]?.size || 0) : 0) + (hasGlbs ? (glbBlobs[i]?.size || 0) : 0) + Math.round(mindBuffer.byteLength / n),
        fileName: meta.fileName || "",
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

function resolveCreatedAt(iso, imageUrl) {
  // Accept backend date only if it's a real date (not Go zero-time "0001-01-01")
  if (iso) {
    try {
      const d = new Date(iso);
      if (!isNaN(d.getTime()) && d.getFullYear() >= 2020) return iso;
    } catch {}
  }
  // Fall back: extract the ms timestamp embedded in the image filename
  // e.g. https://.../users/1/images/target-0-1716537891234.jpg
  if (imageUrl) {
    const m = imageUrl.match(/-(\d{13})\./);
    if (m) {
      const ts = parseInt(m[1], 10);
      if (ts > 1_000_000_000_000) return new Date(ts).toISOString();
    }
  }
  return null;
}

export async function loadTargets() {
  const token = getToken();
  if (!token) return { targets: null, mindFileUrl: null, hasData: false, imagePreviewUrls: [] };
  try {
    const res = await fetch(`${API_BASE}/api/targets`, { headers: { "Authorization": `Bearer ${token}` } });
    if (!res.ok) return { targets: null, mindFileUrl: null, hasData: false, imagePreviewUrls: [] };
    const data = await res.json();
    if (!data.hasData || !data.targets?.length) return { targets: null, mindFileUrl: null, hasData: false, imagePreviewUrls: [] };
    return {
      targets: data.targets.map((t) => ({ id:t.id||null, label:t.label, targetIndex:t.targetIndex, planeWidth:t.planeWidth, planeHeight:t.planeHeight, planeOffsetY:t.planeOffsetY, videoUrl:t.videoUrl, targetType:t.targetType||"video", urlLink:t.urlLink||"", animationEffect:t.animationEffect||"popIn", isPublic:t.isPublic??false, createdAt:resolveCreatedAt(t.createdAt, t.imageUrl), _imagePreviewUrl:t.imageUrl, _videoBlob:null, _imageBlob:null, fileName:t.fileName||"", previewUrl:t.previewUrl||"" })),
      mindFileUrl: data.mindUrl,
      hasData: true,
      imagePreviewUrls: data.targets.map((t) => t.imageUrl).filter(Boolean),
    };
  } catch { return { targets: null, mindFileUrl: null, hasData: false, imagePreviewUrls: [] }; }
}

export async function loadPublicTargets() {
  try {
    const res = await fetch(`${API_BASE}/api/targets/public`);
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.targets?.length) return [];
    return data.targets.map((t) => ({ label:t.label, planeWidth:t.planeWidth, planeHeight:t.planeHeight, planeOffsetY:t.planeOffsetY, imageUrl:t.imageUrl, videoUrl:t.videoUrl, targetType:t.targetType||"video", urlLink:t.urlLink||"", animationEffect:t.animationEffect||"popIn", fileName:t.fileName||"", previewUrl:t.previewUrl||"" }));
  } catch { return []; }
}

export async function clearTargets() {
  const token = getToken();
  if (!token) return;
  await fetch(`${API_BASE}/api/targets/delete`, { method:"DELETE", headers:{"Authorization":`Bearer ${token}`} }).catch(() => {});
}

export async function hasStoredTargets() {
  const { hasData } = await loadTargets();
  return hasData;
}

export async function uploadPublicCombinedMind(mindBuffer, fingerprint) {
  const token = getToken();
  if (!token) return;
  try {
    const res = await fetch(`${API_BASE}/api/upload/presign-public-mind`, { method:'POST', headers:{ Authorization:`Bearer ${token}` } });
    if (!res.ok) return;
    const { mindUrl, fingerprintUrl } = await res.json();
    await Promise.all([
      fetch(mindUrl, { method:'PUT', body:new Blob([mindBuffer],{type:'application/octet-stream'}), headers:{'Content-Type':'application/octet-stream'} }),
      fetch(fingerprintUrl, { method:'PUT', body:fingerprint, headers:{'Content-Type':'text/plain'} }),
    ]);
  } catch {}
}
