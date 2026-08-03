// Entrance animations shared by anything that appears after a scan or in a
// preview. Previously these lived only inside Model3DSetupScreen; the catalog
// image picker needs the same vocabulary, and two hand-kept copies would drift.
//
// The ids are the contract: ar-glb.html maps each one to a CSS keyframe
// (`mv-anim-<id>`) and useArStorage persists it as `animationEffect`, so
// renaming an id silently breaks already-saved targets.
export const AR_EFFECTS = [
  { id: 'popIn',  icon: '🎈', label: 'Bounce In',   desc: 'Scales up with a springy overshoot' },
  { id: 'fadeIn', icon: '✨', label: 'Fade In',     desc: 'Gently fades into view' },
  { id: 'spinIn', icon: '🌀', label: 'Spin In',     desc: 'Rotates a full turn while scaling up' },
  { id: 'riseUp', icon: '⬆️', label: 'Rise Up',     desc: 'Slides up from below into place' },
  { id: 'zoomIn', icon: '💫', label: 'Zoom In',     desc: 'Grows from a tiny point' },
  { id: 'rotate', icon: '🔄', label: 'Auto-Rotate', desc: 'Keeps slowly spinning in place' },
  { id: 'float',  icon: '🌊', label: 'Float',       desc: 'Gentle continuous up-down bob' },
];

export const DEFAULT_EFFECT = 'popIn';

// CSS for the same seven effects, for DOM previews (the AR viewer has its own
// copy tuned for <model-viewer>). Exported as a string so a component can drop
// it into a <style> tag without every caller re-declaring the keyframes.
export const AR_EFFECT_CSS = `
  @keyframes fx-popIn  { 0%{opacity:0;transform:scale(.4)} 65%{opacity:1;transform:scale(1.06)} 100%{opacity:1;transform:scale(1)} }
  @keyframes fx-fadeIn { from{opacity:0} to{opacity:1} }
  @keyframes fx-spinIn { 0%{opacity:0;transform:rotate(-360deg) scale(.3)} 100%{opacity:1;transform:none} }
  @keyframes fx-riseUp { 0%{opacity:0;transform:translateY(28px)} 100%{opacity:1;transform:none} }
  @keyframes fx-zoomIn { 0%{opacity:0;transform:scale(.08)} 100%{opacity:1;transform:scale(1)} }
  @keyframes fx-rotate { from{transform:rotate(0)} to{transform:rotate(360deg)} }
  @keyframes fx-float  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-7px)} }

  .fx-popIn  { animation: fx-popIn  .7s cubic-bezier(.34,1.56,.64,1) both; }
  .fx-fadeIn { animation: fx-fadeIn .8s ease both; }
  .fx-spinIn { animation: fx-spinIn .8s cubic-bezier(.34,1.4,.64,1) both; }
  .fx-riseUp { animation: fx-riseUp .6s cubic-bezier(.22,1,.36,1) both; }
  .fx-zoomIn { animation: fx-zoomIn .6s cubic-bezier(.22,1,.36,1) both; }
  /* The last two are ambient rather than entrances, so they loop. */
  .fx-rotate { animation: fx-rotate 7s linear infinite; }
  .fx-float  { animation: fx-float  3s ease-in-out infinite; }

  @media (prefers-reduced-motion: reduce) {
    .fx-popIn, .fx-fadeIn, .fx-spinIn, .fx-riseUp, .fx-zoomIn { animation: fx-fadeIn .3s ease both; }
    .fx-rotate, .fx-float { animation: none; }
  }
`;
