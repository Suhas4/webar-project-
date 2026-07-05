// Tap feedback (vibration + a short shutter-click tone) for the Scan/Camera
// button, so pressing it reads as an immediate response even while the AR
// engine is still compiling in the background. Synthesized via Web Audio
// instead of a bundled audio file — no asset to ship, no licensing to track.
let audioCtx = null;

function getAudioCtx() {
  if (audioCtx) return audioCtx;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  audioCtx = new Ctx();
  return audioCtx;
}

function playShutterClick() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(1800, now);
  osc.frequency.exponentialRampToValueAtTime(600, now + 0.06);
  gain.gain.setValueAtTime(0.18, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.09);
}

export function playScanFeedback() {
  try { navigator.vibrate?.(40); } catch {}
  try { playShutterClick(); } catch {}
}
