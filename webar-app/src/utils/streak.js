import { API_BASE } from '../config/api.js';

// Local calendar date (YYYY-MM-DD), not UTC — a streak is defined by the
// user's own midnight, so we always send the client's local date rather
// than letting the server derive it from its own clock/timezone.
function localDateString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Fire-and-forget — call this from every streak-qualifying action (scan,
// upload, like/save, share, create album). Silently does nothing if the
// user isn't signed in or the request fails; never blocks the caller.
export function pingStreak() {
  const token = localStorage.getItem('memoera_token');
  if (!token) return;
  fetch(`${API_BASE}/api/streak/ping`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ localDate: localDateString() }),
  }).catch(() => {});
}

export async function fetchStreakStatus() {
  const token = localStorage.getItem('memoera_token');
  if (!token) return null;
  try {
    const res = await fetch(`${API_BASE}/api/streak/status`, {
      headers: { Authorization: 'Bearer ' + token },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
