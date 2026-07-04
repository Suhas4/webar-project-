// Bundled locally (public/libs/) — no CDN round-trip on every fresh compile.
// mindar-image.prod.js imports two sibling chunk files by relative path
// (controller-mGt1s8dJ.js, ui-fBadYuor.js) — both bundled alongside it so
// the relative imports resolve against our own origin instead of jsdelivr.
//
// In dev, Vite's transform middleware refuses to serve a /public .js file as an
// ES module ("This file is in /public ... should not be imported from source
// code"). So dev loads the compiler from the CDN instead; the production build
// copies /public as-is, so it uses the bundled local copy.
export const COMPILER_URL = import.meta.env.DEV
  ? 'https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image.prod.js'
  : '/libs/mindar-image.prod.js';

/**
 * Loads the MindAR image compiler via <script type="module">.
 *
 * Mirrors the same pattern used in useMindAR.js for MindARThree.
 */
export function loadMindARCompiler(maxRetries = 3) {
  return new Promise((resolve, reject) => {
    if (window.MINDAR?.IMAGE?.Compiler) { resolve(); return; }

    let attempt = 0;

    function tryLoad() {
      attempt++;
      const old = document.getElementById('mindar-compiler-script');
      if (old) old.remove();

      const script = document.createElement('script');
      script.id = 'mindar-compiler-script';
      script.type = 'module';
      script.src = COMPILER_URL;
      script.crossOrigin = 'anonymous';

      script.onload = () => {
        let ticks = 0;
        const timer = setInterval(() => {
          ticks++;
          if (window.MINDAR?.IMAGE?.Compiler) {
            clearInterval(timer);
            resolve();
          } else if (ticks > 50) {
            clearInterval(timer);
            if (attempt < maxRetries) {
              setTimeout(tryLoad, 1000);
            } else {
              reject(new Error('MindAR Compiler loaded but not initialized'));
            }
          }
        }, 100);
      };

      script.onerror = () => {
        if (attempt < maxRetries) {
          setTimeout(tryLoad, 1200 * attempt);
        } else {
          reject(new Error('Failed to load MindAR Compiler. Check internet connection.'));
        }
      };

      document.head.appendChild(script);
    }

    tryLoad();
  });
}
