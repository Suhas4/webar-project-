// Run speculative/prefetch work strictly after the page has finished loading.
//
// requestIdleCallback on its own is NOT enough for this. It measures *main
// thread* idleness, and during a network-bound first load the main thread is
// idle almost immediately — so a bare requestIdleCallback fires while the
// app's own bundle and images are still downloading, and the speculative
// fetches land right back on the critical path. Measured on a throttled 4G
// phone, the AR-library and video preloads were both completing before first
// contentful paint for exactly this reason.
//
// Waiting for the `load` event first guarantees every critical resource is
// done; only then do we ask for idle time (with a short timeout, since the
// page is already interactive by that point).
//
// Returns a cancel function suitable for returning directly from a useEffect.
export function deferUntilIdleAfterLoad(fn, { timeout = 3000, fallbackDelay = 1500 } = {}) {
  let cancelled = false;
  let handle = null;

  const schedule = () => {
    if (cancelled) return;
    if ('requestIdleCallback' in window) {
      handle = window.requestIdleCallback(() => { if (!cancelled) fn(); }, { timeout });
    } else {
      handle = setTimeout(() => { if (!cancelled) fn(); }, fallbackDelay);
    }
  };

  if (document.readyState === 'complete') {
    schedule();
  } else {
    window.addEventListener('load', schedule, { once: true });
  }

  return () => {
    cancelled = true;
    window.removeEventListener('load', schedule);
    if (handle == null) return;
    if ('cancelIdleCallback' in window) window.cancelIdleCallback(handle);
    clearTimeout(handle);
  };
}
