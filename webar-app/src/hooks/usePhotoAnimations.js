const DB_NAME = 'memoera_photo_anim';
const STORE   = 'animations';

async function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => e.target.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess  = (e) => resolve(e.target.result);
    req.onerror    = reject;
  });
}

async function resizeToDataURL(file, maxW = 1200) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale  = Math.min(1, maxW / img.width);
      const w = Math.round(img.width  * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.80));
    };
    img.src = url;
  });
}

export async function saveAnimation(name, files) {
  const db     = await openDB();
  const frames = await Promise.all(Array.from(files).map((f) => resizeToDataURL(f)));
  const id     = Date.now().toString();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).add({ id, name, frames, createdAt: new Date().toISOString() });
    tx.oncomplete = () => resolve(id);
    tx.onerror    = reject;
  });
}

export async function loadAnimations() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = (e) => resolve(e.target.result || []);
    req.onerror   = reject;
  });
}

export async function deleteAnimation(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror    = reject;
  });
}

export async function loadAnimationById(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = (e) => resolve(e.target.result || null);
    req.onerror   = reject;
  });
}
