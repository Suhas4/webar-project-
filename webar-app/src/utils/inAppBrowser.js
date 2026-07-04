// Detects known in-app browsers (Instagram, Facebook, etc.) that sandbox their
// embedded WebView and block getUserMedia/camera access outright — no amount
// of permission-prompting on our end can fix this, since the host app itself
// refuses to grant camera access to pages it embeds. The only real fix is for
// the visitor to open the link in a real browser (Safari/Chrome/etc).
export function detectInAppBrowser() {
  const ua = navigator.userAgent || '';
  if (/Instagram/i.test(ua)) return 'Instagram';
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return 'Facebook';
  if (/Line\//i.test(ua)) return 'LINE';
  if (/MicroMessenger/i.test(ua)) return 'WeChat';
  if (/Snapchat/i.test(ua)) return 'Snapchat';
  if (/TikTok/i.test(ua)) return 'TikTok';
  return null;
}

// Builds a camera-error message that's actionable when we can identify the
// cause, instead of a generic "check permissions" that doesn't help when the
// real problem is the host app's WebView itself.
export function buildCameraErrorMessage(err) {
  const inApp = detectInAppBrowser();
  if (inApp) {
    return `Camera access is blocked by the ${inApp} in-app browser — this is a restriction ${inApp} applies to every site it opens, not a Memoera problem. Tap the ••• or ⋮ menu at the top/bottom of this screen and choose "Open in Browser" (Safari or Chrome), then try again.`;
  }
  if (err?.name === 'NotAllowedError') {
    return 'Camera permission denied. Please allow camera access in your device settings.';
  }
  return 'Camera unavailable. Please check your device settings.';
}
