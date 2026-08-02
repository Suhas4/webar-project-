import { useState, useEffect, useRef, useCallback } from 'react';
import { keyGreen } from '../utils/chromaKey.js';

// A panda that pops out of the chat bubble when the screen has gone quiet,
// waves, and tucks itself away again.
//
// Purely decorative and always dismissible — it never blocks a tap, never
// covers a control, and any interaction sends it away instantly. It also only
// runs on Home: appearing over the AR scanner or mid-form would be an
// interruption rather than a bit of charm.
//
// The video is muted and plays inline, which is what lets it autoplay at all —
// browsers block autoplay with sound. It's also decoded only when first needed,
// so a session that never goes idle never pays for it.

// Plain H.264 with the green backdrop still in it — see utils/chromaKey.js for
// why the transparency is produced at runtime instead of being baked into the
// file. One asset, decodable by every browser we target.
const VIDEO_SRC = '/panda-key.mp4';

// White sticker outline, roughly 0.5mm at the size this renders. Chained
// drop-shadows compound — each one shadows the result of the last — so four
// axis-aligned passes fill the diagonals as well. Applied to the canvas, so it
// traces the keyed silhouette rather than a rectangle, and lives in CSS so the
// thickness can be changed without re-encoding anything.
const OUTLINE = ['1.5px 0', '-1.5px 0', '0 1.5px', '0 -1.5px']
  .map((o) => `drop-shadow(${o} 0 #fff)`)
  .join(' ');
const DEPTH = 'drop-shadow(0 14px 22px rgba(0,0,0,.5))';

// Interaction that counts as "the user is still here". pointerdown rather than
// click so it reacts to the press, not the release.
const ACTIVITY = ['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll'];

export default function IdlePanda({
  idleMs = 30000,      // quiet time before the panda appears
  cooldownMs = 180000, // minimum gap between appearances
  enabled = true,
}) {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const idleTimer = useRef(null);
  const lastShown = useRef(0);
  const videoRef  = useRef(null);
  const canvasRef = useRef(null);

  const hide = useCallback(() => {
    setLeaving(true);
    // Let the exit animation finish before unmounting, otherwise it snaps away.
    setTimeout(() => { setVisible(false); setLeaving(false); }, 420);
  }, []);

  const show = useCallback(() => {
    if (Date.now() - lastShown.current < cooldownMs) return;
    // Respect a stated preference for less motion — this is pure decoration.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    // Pointless while the tab is in the background.
    if (document.hidden) return;
    lastShown.current = Date.now();
    setVisible(true);
  }, [cooldownMs]);

  // Read through a ref inside the listener rather than depending on `visible`.
  // Depending on it meant the effect re-ran the instant the panda appeared, and
  // its own setup call saw visible===true and hid it again — the panda showed
  // and vanished within a frame.
  const visibleRef = useRef(false);
  useEffect(() => { visibleRef.current = visible && !leaving; }, [visible, leaving]);

  useEffect(() => {
    if (!enabled) return undefined;

    const arm = () => {
      clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(show, idleMs);
    };
    // Only a real interaction dismisses; arming the timer must not.
    const onActivity = () => {
      if (visibleRef.current) hide();
      arm();
    };

    ACTIVITY.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    document.addEventListener('visibilitychange', arm);
    arm();

    return () => {
      clearTimeout(idleTimer.current);
      ACTIVITY.forEach((e) => window.removeEventListener(e, onActivity));
      document.removeEventListener('visibilitychange', arm);
    };
  }, [enabled, idleMs, show, hide]);

  // Play the clip, keying each decoded frame into the canvas, and tuck away on
  // its own once it has played through.
  useEffect(() => {
    if (!visible) return undefined;
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c) return undefined;

    const ctx = c.getContext('2d', { willReadFrequently: true });
    let handle = 0;
    let stopped = false;

    // requestVideoFrameCallback fires once per *decoded* frame, so a 24fps clip
    // is keyed 24 times a second instead of 60 — less than half the work of a
    // rAF loop, and never keys the same frame twice. rAF is the fallback where
    // it isn't implemented.
    const schedule = () => {
      if (stopped) return;
      handle = v.requestVideoFrameCallback
        ? v.requestVideoFrameCallback(render)
        : requestAnimationFrame(render);
    };

    const render = () => {
      if (stopped) return;
      if (v.videoWidth) {
        if (c.width !== v.videoWidth) { c.width = v.videoWidth; c.height = v.videoHeight; }
        ctx.drawImage(v, 0, 0);
        const frame = ctx.getImageData(0, 0, c.width, c.height);
        keyGreen(frame.data);
        ctx.putImageData(frame, 0, 0);
      }
      schedule();
    };

    const onEnd = () => hide();
    v.addEventListener('ended', onEnd);

    v.currentTime = 0;
    v.play().catch(() => { /* autoplay refused — the panda just sits still */ });
    schedule();

    return () => {
      stopped = true;
      v.removeEventListener('ended', onEnd);
      if (v.cancelVideoFrameCallback) v.cancelVideoFrameCallback(handle);
      else cancelAnimationFrame(handle);
    };
  }, [visible, hide]);

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      onPointerDown={hide}
      style={{
        position: 'fixed',
        // Sits just above the chat bubble (bottom 88, right 16) so it reads as
        // having climbed out of it.
        right: 8, bottom: 150,
        zIndex: 480,          // under the chat widget (500) — never covers it
        width: 'min(46vw, 190px)',
        pointerEvents: 'auto',
        transformOrigin: '85% 100%',
        animation: `${leaving ? 'pandaOut' : 'pandaIn'} .42s cubic-bezier(.34,1.4,.64,1) both`,
      }}
    >
      <style>{`
        @keyframes pandaIn {
          0%   { opacity: 0; transform: translateY(38px) scale(.55) rotate(8deg); }
          100% { opacity: 1; transform: translateY(0)    scale(1)   rotate(0deg); }
        }
        @keyframes pandaOut {
          0%   { opacity: 1; transform: translateY(0)    scale(1)   rotate(0deg); }
          100% { opacity: 0; transform: translateY(38px) scale(.55) rotate(8deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes pandaIn  { from { opacity: 0 } to { opacity: 1 } }
          @keyframes pandaOut { from { opacity: 1 } to { opacity: 0 } }
        }
      `}</style>

      {/* The canvas is what's actually seen — the video only feeds it frames.
          drop-shadow (unlike box-shadow) follows the alpha channel, so both the
          white outline and the soft depth shadow trace the keyed silhouette
          rather than a rectangle around it. */}
      <canvas
        ref={canvasRef}
        style={{
          width: '100%', height: 'auto', display: 'block',
          filter: `${OUTLINE} ${DEPTH}`,
        }}
      />

      {/* Kept in the layout but invisible rather than display:none — a hidden
          video does not reliably decode frames on mobile Safari, and with no
          frames there is nothing to key. */}
      <video
        ref={videoRef}
        src={VIDEO_SRC}
        muted
        playsInline
        preload="none"
        aria-hidden="true"
        style={{
          position: 'absolute', width: 1, height: 1,
          opacity: 0, pointerEvents: 'none',
        }}
      />
    </div>
  );
}
