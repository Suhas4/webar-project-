import { useState, useEffect, useRef, useCallback } from 'react';

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

const VIDEO_WEBM = '/panda-idle.webm';
const VIDEO_MP4  = '/panda-idle.mp4';

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

  // Tuck away on its own once the clip has played through.
  useEffect(() => {
    if (!visible) return undefined;
    const v = videoRef.current;
    if (!v) return undefined;
    v.currentTime = 0;
    v.play().catch(() => { /* autoplay refused — the panda just sits still */ });
    const onEnd = () => hide();
    v.addEventListener('ended', onEnd);
    return () => v.removeEventListener('ended', onEnd);
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

      <video
        ref={videoRef}
        muted
        playsInline
        preload="none"
        style={{
          width: '100%', height: 'auto', display: 'block',
          // drop-shadow (unlike box-shadow) follows the alpha channel, so this
          // traces the panda's outline rather than a rectangle around it.
          filter: 'drop-shadow(0 14px 22px rgba(0,0,0,.5))',
        }}
      >
        {/* WebM first: VP9 with a real alpha channel, so the panda sits on the
            app background with no white box. The original clip had an off-white
            backdrop that was almost the same colour as the panda's own helmet
            and belly, so a colour key would have punched holes straight through
            it — the background was removed by flood-filling inward from the
            frame edges instead, which only clears backdrop actually connected
            to the border.
            The MP4 stays as a fallback for browsers without WebM alpha; they
            get the original clip, white background and all, rather than
            nothing. */}
        <source src={VIDEO_WEBM} type="video/webm" />
        <source src={VIDEO_MP4} type="video/mp4" />
      </video>
    </div>
  );
}
