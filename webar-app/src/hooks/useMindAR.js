import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { AR_TARGETS, MINDAR_CONFIG } from '../config/arTargets.js';

const MINDAR_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-three.prod.js';

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

      script.onload = () => {
        let ticks = 0;
        const timer = setInterval(() => {
          ticks++;
          if (window.MINDAR?.IMAGE?.MindARThree) {
            clearInterval(timer);
            resolve();
          } else if (ticks > 40) {
            clearInterval(timer);
            if (attempt < maxRetries) {
              setTimeout(tryLoad, 1000);
            } else {
              reject(new Error('MindAR loaded but window.MINDAR not initialized'));
            }
          }
        }, 100);
      };

      script.onerror = () => {
        if (attempt < maxRetries) {
          setTimeout(tryLoad, 1200 * attempt);
        } else {
          reject(new Error('Failed to load MindAR after ' + maxRetries + ' attempts.'));
        }
      };

      document.head.appendChild(script);
    }

    tryLoad();
  });
}

export function useMindAR(containerRef, onStatusChange, targetsOverride, mindFileUrlOverride) {
  const mindarThreeRef   = useRef(null);
  const fullscreenVideosRef = useRef([]);
  const urlOverlaysRef   = useRef([]);
  const modelOverlaysRef = useRef([]);
  const isStartedRef     = useRef(false);
  const activeTargetsRef = useRef(new Set());
  const lockedRef        = useRef(false);

  const pauseAllVideos = useCallback(() => {
    fullscreenVideosRef.current.forEach((v) => { if (!v) return; v.pause(); v.style.display = 'none'; });
    urlOverlaysRef.current.forEach((o) => { if (!o) return; o.style.display = 'none'; });
    activeTargetsRef.current.clear();
  }, []);

  const stop = useCallback(async () => {
    isStartedRef.current = false;
    lockedRef.current = false;

    fullscreenVideosRef.current.forEach((video) => {
      if (!video) return;
      video.pause(); video.src = ''; video.style.display = 'none';
      try { document.body.removeChild(video); } catch (_) {}
    });

    urlOverlaysRef.current.forEach((overlay) => {
      if (!overlay) return;
      overlay.style.display = 'none';
      try { document.body.removeChild(overlay); } catch (_) {}
    });

    modelOverlaysRef.current.forEach((overlay) => {
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
    } catch (_) {}

    mindarThreeRef.current = null;
    fullscreenVideosRef.current = [];
    urlOverlaysRef.current = [];
    modelOverlaysRef.current = [];
    activeTargetsRef.current.clear();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (!containerRef.current) return;

      // Safety sweep — remove orphaned DOM elements from previous sessions
      document.querySelectorAll('video[data-mindar]').forEach((v) => {
        try { v.pause(); v.src = ''; v.remove(); } catch (_) {}
      });
      document.querySelectorAll('div[data-mindar-overlay]').forEach((d) => {
        try { d.remove(); } catch (_) {}
      });

      const resolvedTargets    = (targetsOverride && targetsOverride.length > 0) ? targetsOverride : AR_TARGETS;
      const resolvedMindFileUrl = mindFileUrlOverride || MINDAR_CONFIG.imageTargetSrc;

      if (!resolvedTargets.length) {
        onStatusChange('error', 'No AR targets configured. Go back to setup and add at least one target.');
        return;
      }

      try {
        await loadMindAR(3);
      } catch (err) {
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

      // ── Lighting setup ──────────────────────────────────────────────────────
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
      scene.add(ambientLight);

      // Two colored point lights whose HSL colours cycle continuously
      const dynLight1 = new THREE.PointLight(0x00ffaa, 4, 6);
      const dynLight2 = new THREE.PointLight(0xff6600, 3, 6);
      scene.add(dynLight1);
      scene.add(dynLight2);

      // ── Target setup ────────────────────────────────────────────────────────
      resolvedTargets.forEach((targetConfig) => {
        const { targetIndex, videoUrl, targetType, urlLink, label } = targetConfig;
        const planeWidth   = targetConfig.planeWidth   ?? 1;
        const planeHeight  = targetConfig.planeHeight  ?? 0.5625;
        const planeOffsetY = targetConfig.planeOffsetY ?? 0;

        const isUrlTarget = targetType === 'url';

        let fsVideo    = null;
        let urlOverlay = null;

        if (isUrlTarget) {
          // ── URL target — "OPEN LINK" overlay ───────────────────────────────
          urlOverlay = document.createElement('div');
          Object.assign(urlOverlay.style, {
            position: 'fixed', inset: '0',
            background: 'rgba(6,26,31,0.92)',
            zIndex: '6', display: 'none',
            flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: '20px',
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
          urlOverlay.dataset.mindarOverlay = '1';
          document.body.appendChild(urlOverlay);
          urlOverlaysRef.current[targetIndex] = urlOverlay;

          const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
          const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 });
          const mesh     = new THREE.Mesh(geometry, material);
          mesh.position.y = planeOffsetY;

          const anchor = mindarThree.addAnchor(targetIndex);
          anchor.group.add(mesh);

          anchor.onTargetFound = () => {
            urlOverlay.style.display = 'flex';
            activeTargetsRef.current.add(targetIndex);
            onStatusChange('tracking');
          };
          anchor.onTargetLost = () => {
            urlOverlay.style.display = 'none';
            activeTargetsRef.current.delete(targetIndex);
            if (activeTargetsRef.current.size === 0) onStatusChange('ready');
          };

        } else {
          // ── Video target ────────────────────────────────────────────────────
          fsVideo = document.createElement('video');
          fsVideo.dataset.mindar = '1';
          fsVideo.src = videoUrl;
          fsVideo.loop = true;
          fsVideo.muted = false;
          fsVideo.setAttribute('playsinline', '');
          fsVideo.setAttribute('webkit-playsinline', '');
          fsVideo.preload = 'auto';
          fsVideo.load();
          Object.assign(fsVideo.style, {
            position: 'fixed', top: '0', left: '0',
            width: '100%', height: '100%',
            objectFit: 'cover', zIndex: '5',
            display: 'none', background: '#000',
          });
          document.body.appendChild(fsVideo);
          fullscreenVideosRef.current[targetIndex] = fsVideo;

          const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
          const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 });
          const mesh     = new THREE.Mesh(geometry, material);
          mesh.position.y = planeOffsetY;

          const anchor = mindarThree.addAnchor(targetIndex);
          anchor.group.add(mesh);

          anchor.onTargetFound = () => {
            fsVideo.style.display = 'block';
            if (fsVideo.currentTime > 0.3) fsVideo.currentTime = 0;
            const p = fsVideo.play();
            if (p !== undefined) {
              p.catch((err) => {
                if (err.name === 'NotAllowedError') {
                  fsVideo.muted = true; fsVideo.play().catch(() => {});
                }
              });
            }
            activeTargetsRef.current.add(targetIndex);
            onStatusChange('tracking');
          };

          anchor.onTargetLost = () => {
            if (lockedRef.current) return;
            fsVideo.pause(); fsVideo.style.display = 'none';
            activeTargetsRef.current.delete(targetIndex);
            if (activeTargetsRef.current.size === 0) onStatusChange('ready');
          };
        }
      });

      try {
        await mindarThree.start();
      } catch (err) {
        onStatusChange('error', getCameraErrorMessage(err));
        return;
      }

      if (cancelled) { await stop(); return; }

      isStartedRef.current = true;
      onStatusChange('ready');

      // ── Render + animation loop ──────────────────────────────────────────────
      renderer.setAnimationLoop(() => {
        const t = Date.now() / 1000;

        // Cycle light hues around the colour wheel — creates live environment effect
        dynLight1.color.setHSL(t * 0.12 % 1, 0.9, 0.6);
        dynLight2.color.setHSL((t * 0.12 + 0.5) % 1, 0.9, 0.55);
        dynLight1.position.set(Math.cos(t * 0.8) * 2,  1.5, Math.sin(t * 0.8) * 2);
        dynLight2.position.set(Math.cos(t * 0.8 + Math.PI) * 1.8, -0.5, Math.sin(t * 0.8 + Math.PI) * 1.8);

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

  return { stop, lockedRef, pauseAllVideos };
}

function getCameraErrorMessage(err) {
  const name    = err?.name ?? '';
  const message = (err?.message ?? String(err)).toLowerCase();
  if (name === 'NotAllowedError' || message.includes('permission denied'))
    return 'Camera access was denied. Please allow camera access in your device settings.';
  if (name === 'NotFoundError' || message.includes('not found'))
    return 'No camera found on this device. Please use a device with a rear camera.';
  if (name === 'NotReadableError' || message.includes('could not start'))
    return 'Camera is in use by another app. Close other apps using the camera and reload.';
  if (message.includes('https') || message.includes('secure context'))
    return 'Camera requires HTTPS. Please open this page over https://.';
  return `AR failed to start: ${err?.message ?? String(err)}`;
}
