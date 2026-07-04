// Pre-warms the rear camera so UserScanScreen / GuestScanScreen open instantly.
let _warmStream = null;
let _warming = false;
let _stopped = false;

export function startCameraWarm() {
  if (_warmStream || _warming) return;
  if (!navigator.mediaDevices?.getUserMedia) return;
  _warming = true;
  _stopped = false;
  navigator.mediaDevices
    .getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280, max: 1920 }, height: { ideal: 720, max: 1080 } }, audio: false })
    .then((s) => {
      _warming = false;
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
