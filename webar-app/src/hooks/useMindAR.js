import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { AR_TARGETS, MINDAR_CONFIG } from '../config/arTargets.js';

const MINDAR_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-three.prod.js';

/**
 * loadMindAR — loads MindAR via <script type="module" src="CDN_URL">.
 *
 * Why not dynamic import()?
 *   MindAR's bundle has relative chunk imports like ./controller-xxx.js.
 *   When Vite intercepts dynamic import(), it resolves those relative paths
 *   against localhost:5173 — the files don't exist there → 404 → AR Error.
 *
 * Why <script type="module" src="...">?
 *   The browser resolves relative imports against the script's own src URL
 *   (the CDN), so ./controller-xxx.js correctly fetches from the CDN.
 *   MindAR sets window.MINDAR as a side effect, which we poll for.
 */
function loadMindAR(maxRetries = 3) {
  return new Promise((resolve, reject) => {
    if (window.MINDAR?.IMAGE?.MindARThree) { resolve(); return; }

    let attempt = 0;

    function tryLoad() {
      attempt++;

      const old = document.getElementById('mindar-three-script');
      if (old) old.remove();

      const script = document.createElement('script');
      script.id = 'mindar-three-script';
      script.type = 'module';
      script.src = MINDAR_SCRIPT_URL;
      script.crossOrigin = 'anonymous';

      // Poll for window.MINDAR after script loads
      script.onload = () => {
        let ticks = 0;
        const timer = setInterval(() => {
          ticks++;
          if (window.MINDAR?.IMAGE?.MindARThree) {
            clearInterval(timer);
            resolve();
          } else if (ticks > 40) { // 4s timeout
            clearInterval(timer);
            if (attempt < maxRetries) {
              console.warn(`[useMindAR] window.MINDAR not set, retry ${attempt}`);
              setTimeout(tryLoad, 1000);
            } else {
              reject(new Error('MindAR loaded but window.MINDAR not initialized'));
            }
          }
        }, 100);
      };

      script.onerror = () => {
        console.warn(`[useMindAR] Script load failed (attempt ${attempt}/${maxRetries})`);
        if (attempt < maxRetries) {
          setTimeout(tryLoad, 1200 * attempt);
        } else {
          reject(new Error('Failed to load MindAR after ' + maxRetries + ' attempts. Check internet connection.'));
        }
      };

      document.head.appendChild(script);
    }

    tryLoad();
  });
}

export function useMindAR(containerRef, onStatusChange, targetsOverride, mindFileUrlOverride) {
  const mindarThreeRef = useRef(null);
  const fullscreenVideosRef = useRef([]);
  const urlOverlaysRef = useRef([]);
  const isStartedRef = useRef(false);
  const activeTargetsRef = useRef(new Set());

  const stop = useCallback(async () => {
    if (!isStartedRef.current && !mindarThreeRef.current) return;
    isStartedRef.current = false;

    fullscreenVideosRef.current.forEach((video) => {
      if (!video) return;
      video.pause();
      video.src = '';
      video.style.display = 'none';
      try { document.body.removeChild(video); } catch (_) {}
    });

    urlOverlaysRef.current.forEach((overlay) => {
      if (!overlay) return;
      overlay.style.display = 'none';
      try { document.body.removeChild(overlay); } catch (_) {}
    });

    try {
      if (mindarThreeRef.current) {
        mindarThreeRef.current.renderer.setAnimationLoop(null);
        await mindarThreeRef.current.stop();
        mindarThreeRef.current.renderer.dispose();
      }
    } catch (err) {
      console.warn('[useMindAR] stop() warning:', err.message);
    }

    mindarThreeRef.current = null;
    fullscreenVideosRef.current = [];
    urlOverlaysRef.current = [];
    activeTargetsRef.current.clear();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (!containerRef.current) return;

      const resolvedTargets = (targetsOverride && targetsOverride.length > 0)
        ? targetsOverride : AR_TARGETS;
      const resolvedMindFileUrl = mindFileUrlOverride || MINDAR_CONFIG.imageTargetSrc;

      if (!resolvedTargets.length) {
        onStatusChange('error', 'No AR targets configured. Go back to setup and add at least one target.');
        return;
      }

      try {
        await loadMindAR(3);
      } catch (err) {
        console.error('[useMindAR] MindAR load failed:', err);
        onStatusChange('error', 'Failed to load MindAR. Check your internet connection and reload.');
        return;
      }

      if (cancelled) return;
      onStatusChange('loading');

      let mindarThree;
      try {
        mindarThree = new window.MINDAR.IMAGE.MindARThree({
          container: containerRef.current,
          ...MINDAR_CONFIG,
          imageTargetSrc: resolvedMindFileUrl,
          maxTrack: resolvedTargets.length,
          uiLoading: 'no',
          uiScanning: 'no',
          uiError: 'no',
        });
      } catch (err) {
        onStatusChange('error', `AR initialization failed: ${err.message}`);
        return;
      }

      if (cancelled) return;

      mindarThreeRef.current = mindarThree;
      const { renderer, scene, camera } = mindarThree;
      scene.add(new THREE.AmbientLight(0xffffff, 1.0));

      resolvedTargets.forEach((targetConfig) => {
        const { targetIndex, videoUrl, targetType, urlLink, planeWidth, planeHeight, planeOffsetY, label } = targetConfig;
        const isUrlTarget = targetType === 'url';

        let fsVideo = null;
        let urlOverlay = null;

        if (isUrlTarget) {
          // Create a tap-to-open overlay for URL targets
          urlOverlay = document.createElement('div');
          Object.assign(urlOverlay.style, {
            position: 'fixed', inset: '0',
            background: 'rgba(6,26,31,0.92)',
            zIndex: '6',
            display: 'none',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '20px',
          });
          const labelEl = document.createElement('p');
          Object.assign(labelEl.style, {
            color: 'rgba(255,255,255,0.7)', fontSize: '14px',
            fontFamily: 'Outfit, sans-serif', letterSpacing: '0.1em',
            margin: '0', textAlign: 'center', padding: '0 24px',
          });
          labelEl.textContent = label || 'AR Target';
          const openBtn = document.createElement('button');
          Object.assign(openBtn.style, {
            background: 'linear-gradient(135deg, #00C9A7, #00E5CC)',
            border: 'none', borderRadius: '50px',
            color: '#080C18', fontSize: '16px', fontWeight: '700',
            fontFamily: 'Outfit, sans-serif', padding: '16px 40px',
            cursor: 'pointer', letterSpacing: '0.05em',
          });
          openBtn.textContent = '🔗 OPEN LINK';
          openBtn.addEventListener('click', () => {
            const url = urlLink || '';
            if (url) window.open(url.startsWith('http') ? url : 'https://' + url, '_blank', 'noopener');
          });
          const closeBtn = document.createElement('button');
          Object.assign(closeBtn.style, {
            background: 'transparent', border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '50px', color: 'rgba(255,255,255,0.5)',
            fontSize: '13px', fontFamily: 'Outfit, sans-serif',
            padding: '10px 24px', cursor: 'pointer',
          });
          closeBtn.textContent = 'Close';
          closeBtn.addEventListener('click', () => { urlOverlay.style.display = 'none'; });
          urlOverlay.appendChild(labelEl);
          urlOverlay.appendChild(openBtn);
          urlOverlay.appendChild(closeBtn);
          document.body.appendChild(urlOverlay);
          urlOverlaysRef.current[targetIndex] = urlOverlay;
        } else {
          // Create fullscreen video element
          fsVideo = document.createElement('video');
          fsVideo.src = videoUrl;
          fsVideo.loop = true;
          fsVideo.muted = false;
          fsVideo.setAttribute('playsinline', '');
          fsVideo.setAttribute('webkit-playsinline', '');
          fsVideo.preload = 'none';
          Object.assign(fsVideo.style, {
            position: 'fixed',
            top: '0', left: '0',
            width: '100%', height: '100%',
            objectFit: 'cover',
            zIndex: '5',
            display: 'none',
            background: '#000',
          });
          document.body.appendChild(fsVideo);
          fullscreenVideosRef.current[targetIndex] = fsVideo;
        }

        const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
        const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.y = planeOffsetY ?? 0;

        const anchor = mindarThree.addAnchor(targetIndex);
        anchor.group.add(mesh);

        anchor.onTargetFound = () => {
          console.log(`[useMindAR] Target found: ${label} (index ${targetIndex})`);
          if (isUrlTarget) {
            urlOverlay.style.display = 'flex';
          } else {
            fsVideo.style.display = 'block';
            fsVideo.currentTime = 0;
            const playPromise = fsVideo.play();
            if (playPromise !== undefined) {
              playPromise.catch((err) => {
                if (err.name === 'NotAllowedError') {
                  fsVideo.muted = true;
                  fsVideo.play().catch(() => {});
                } else if (err.name !== 'AbortError') {
                  console.warn(`[useMindAR] video.play() failed:`, err.name, err.message);
                }
              });
            }
          }
          activeTargetsRef.current.add(targetIndex);
          onStatusChange('tracking');
        };

        anchor.onTargetLost = () => {
          console.log(`[useMindAR] Target lost: ${label} (index ${targetIndex})`);
          if (isUrlTarget) {
            urlOverlay.style.display = 'none';
          } else {
            fsVideo.pause();
            fsVideo.style.display = 'none';
          }
          activeTargetsRef.current.delete(targetIndex);
          if (activeTargetsRef.current.size === 0) {
            onStatusChange('ready');
          }
        };
      });

      try {
        await mindarThree.start();
      } catch (err) {
        onStatusChange('error', getCameraErrorMessage(err));
        return;
      }

      if (cancelled) {
        await stop();
        return;
      }

      isStartedRef.current = true;
      onStatusChange('ready');

      renderer.setAnimationLoop(() => {
        renderer.render(scene, camera);
      });
    }

    init();

    return () => {
      cancelled = true;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetsOverride, mindFileUrlOverride]);

  return { stop };
}

function getCameraErrorMessage(err) {
  const name = err?.name ?? '';
  const message = (err?.message ?? String(err)).toLowerCase();
  if (name === 'NotAllowedError' || message.includes('permission denied')) {
    return 'Camera access was denied. Please allow camera access in your browser settings and reload.';
  }
  if (name === 'NotFoundError' || message.includes('not found')) {
    return 'No camera found on this device. Please use a device with a rear camera.';
  }
  if (name === 'NotReadableError' || message.includes('could not start')) {
    return 'Camera is in use by another app. Close other apps using the camera and reload.';
  }
  if (message.includes('https') || message.includes('secure context')) {
    return 'Camera requires HTTPS. Please open this page over https://.';
  }
  return `AR failed to start: ${err?.message ?? String(err)}`;
}
