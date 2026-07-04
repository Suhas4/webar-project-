import { useState, useEffect, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_BACKEND_URL || '';

export function useFestivalNotifications(userId) {
  const [festivalNotifs, setFestivalNotifs] = useState([]);

  const fetchNotifs = useCallback(async () => {
    if (!userId || !API_BASE) return;
    try {
      const res = await fetch(`${API_BASE}/api/notifications/${encodeURIComponent(userId)}`);
      if (!res.ok) return;
      const data = await res.json();
      setFestivalNotifs(Array.isArray(data) ? data : []);
    } catch { /* silently ignore network errors */ }
  }, [userId]);

  useEffect(() => { fetchNotifs(); }, [fetchNotifs]);

  const markRead = useCallback(async (notifId) => {
    if (!API_BASE) return;
    try {
      await fetch(`${API_BASE}/api/notifications/${notifId}/read`, { method: 'PATCH' });
      setFestivalNotifs((prev) =>
        prev.map((n) => (n.id === notifId ? { ...n, is_read: true } : n))
      );
    } catch {}
  }, []);

  const unreadCount = festivalNotifs.filter((n) => !n.is_read).length;

  return { festivalNotifs, unreadCount, refetch: fetchNotifs, markRead };
}
