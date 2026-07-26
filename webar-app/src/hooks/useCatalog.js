import { API_BASE, fetchWithRetry } from "../config/api.js";
import { uploadPresigned } from "./useArStorage.js";

function getToken() {
  return localStorage.getItem("memoera_token") || "";
}

// Uploads each item's photo (and optional video clip) then persists the
// catalog's metadata. Returns the new catalog's id — this is what a
// 'catalog' AR target's urlLink points at, exactly like Photo Animation
// points its urlLink at an animation id.
export async function saveCatalog(name, items, onProgress) {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const meRes = await fetchWithRetry(`${API_BASE}/api/me`, { headers: { Authorization: `Bearer ${token}` } });
  if (!meRes.ok) throw new Error("Failed to authenticate");
  const { id: userID } = await meRes.json();

  const ts = Date.now();
  const n = items.length;
  let done = 0;
  const report = () => { done += 1; onProgress && onProgress(Math.round((done / (n * 2)) * 100)); };

  const payloadItems = await Promise.all(
    items.map(async (item, i) => {
      let imageKey = "";
      let videoKey = "";
      if (item.imageFile) {
        imageKey = `users/${userID}/catalog/images/item-${i}-${ts}.jpg`;
        await uploadPresigned(imageKey, item.imageFile, item.imageFile.type || "image/jpeg");
      }
      report();
      if (item.videoFile) {
        videoKey = `users/${userID}/catalog/videos/item-${i}-${ts}.mp4`;
        await uploadPresigned(videoKey, item.videoFile, item.videoFile.type || "video/mp4");
      }
      report();
      return {
        title: item.title || "",
        description: item.description || "",
        price: item.price || "",
        imageKey,
        videoKey,
        urlLink: item.urlLink || "",
      };
    })
  );

  const res = await fetchWithRetry(`${API_BASE}/api/catalogs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name, items: payloadItems }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to save catalog");
  }
  const { id } = await res.json();
  return id;
}

export async function loadCatalog(id) {
  const res = await fetchWithRetry(`${API_BASE}/api/catalogs?id=${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error("Catalog not found");
  return res.json(); // { id, name, items: [{ title, description, price, imageUrl, videoUrl, urlLink }] }
}
