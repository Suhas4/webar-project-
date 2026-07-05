// Pre-warms the rear camera so GuestScanScreen opens instantly.
let _warmStream = null;
let _warming = false;
let _stopped = false;

// Tracks whether the user has already granted (or been asked about) camera
// access once during this app session. The browser's Permissions API is
// unreliable on Android WebViews — it can still report 'prompt'/'unknown'
// moments after a grant — so screens should check this flag too before
// showing the in-app CameraPermissionPrimer again, or the user gets asked
// on every screen that opens the camera instead of just once per session.
let _confirmedThisSession = false;
export function markCameraConfirmed() { _confirmedThisSession = true; }
export function hasConfirmedCameraThisSession() { return _confirmedThisSession; }

// Reads OS/browser camera permission state without prompting. Safari doesn't support
// querying 'camera' via the Permissions API, so this resolves 'unknown' there — callers
// should treat 'unknown' the same as 'prompt' (i.e. permission has not been confirmed yet).
export async function getCameraPermissionState() {
  try {
    if (!navigator.permissions?.query) return 'unknown';
    const status = await navigator.permissions.query({ name: 'camera' });
    return status.state; // 'granted' | 'denied' | 'prompt'
  } catch {
    return 'unknown';
  }
}

// Only silently pre-warms when permission was already granted in a past visit — never
// fires a surprise native permission prompt in the background before the user has done
// anything. First-time/undecided visitors get the friendly on-screen primer instead,
// shown by HelloScreen/GuestScanScreen right before they call getUserMedia.
export async function startCameraWarm() {
  if (_warmStream || _warming) return;
  if (!navigator.mediaDevices?.getUserMedia) return;
  const state = await getCameraPermissionState();
  if (state !== 'granted') return;

  _warming = true;
  _stopped = false;
  navigator.mediaDevices
    .getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280, max: 1920 }, height: { ideal: 720, max: 1080 } }, audio: false })
    .then((s) => {
      _warming = false;
      _confirmedThisSession = true;
      // If stopWarmStream() was called while getUserMedia was in-flight,
      // stop the stream immediately so it doesn't hold the camera open.
      if (_stopped) { s.getTracks().forEach((t) => t.stop()); }
      else { _warmStream = s; }
    })
    .catch(() => { _warming = false; });
}

// Claim the pre-warmed stream (caller owns it and must stop it when done).
export function takeWarmStream() {
  const s = _warmStream;
  _warmStream = null;
  _warming = false;
  return s;
}

// Stop and discard the warm stream (called when user navigates away without scanning).
export function stopWarmStream() {
  _stopped = true;
  if (_warmStream) {
    _warmStream.getTracks().forEach((t) => t.stop());
    _warmStream = null;
  }
  _warming = false;
}
