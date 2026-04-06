import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { AR_TARGETS, MINDAR_CONFIG } from '../config/arTargets.js';

export function useMindAR(containerRef, onStatusChange, targetsOverride, mindFileUrlOverride) {
  const mindarThreeRef = useRef(null);
  const fullscreenVideosRef = useRef([]); // fullscreen overlay <video> per target
  const isStartedRef = useRef(false);
  const activeTargetsRef = useRef(new Set());

  // ── stop() ──────────────────────────────────────────────────────────────────
  const stop = useCallback(async () => {
    if (!isStartedRef.current && !mindarThreeRef.current) return;
    isStartedRef.current = false;

    // Bug 6 fix: pause + remove all fullscreen video overlays from DOM
    fullscreenVideosRef.current.forEach((video) => {
      if (!video) return;
      video.pause();
      video.src = '';
      video.style.display = 'none';
      try { document.body.removeChild(video); } catch (_) {}
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
    activeTargetsRef.current.clear();
  }, []);

  // ── Main effect ──────────────────────────────────────────────────────────────
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

      // Bug 9 fix: Load MindAR with one automatic retry on failure
      if (!window.MINDAR?.IMAGE?.MindARThree) {
        try {
          await import('https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-three.prod.js');
        } catch {
          try {
            await new Promise((r) => setTimeout(r, 1500));
            await import('https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-three.prod.js');
          } catch {
            onStatusChange('error', 'Failed to load MindAR. Check your internet connection and reload.');
            return;
          }
        }
      }

      if (!window.MINDAR?.IMAGE?.MindARThree) {
        onStatusChange('error', 'MindAR did not initialize correctly. Please reload.');
        return;
      }

      if (cancelled) return;
      onStatusChange('loading');

      // Create MindARThree instance
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
        const { targetIndex, videoUrl, planeWidth, planeHeight, planeOffsetY, label } = targetConfig;

        // Bug 5 fix: Create a fullscreen <video> overlay instead of a Three.js plane.
        // This makes the video fill the entire screen when a target is detected.
        // Bug 6 fix: preload="none" so video does NOT play in background before detection.
        const fsVideo = document.createElement('video');
        fsVideo.src = videoUrl;
        fsVideo.loop = true;
        fsVideo.muted = false;
        fsVideo.setAttribute('playsinline', '');
        fsVideo.setAttribute('webkit-playsinline', '');
        fsVideo.preload = 'none'; // Bug 6: don't buffer/autoplay until target found
        Object.assign(fsVideo.style, {
          position: 'fixed',
          top: '0', left: '0',
          width: '100%', height: '100%',
          objectFit: 'cover',
          zIndex: '5',
          display: 'none', // hidden until target found
          background: '#000',
        });
        document.body.appendChild(fsVideo);
        fullscreenVideosRef.current[targetIndex] = fsVideo;

        // Invisible Three.js plane — only needed so MindAR has an anchor to track
        const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
        const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.y = planeOffsetY ?? 0;

        const anchor = mindarThree.addAnchor(targetIndex);
        anchor.group.add(mesh);

        // Bug 5 & 6: Show fullscreen video ONLY when target is detected
        anchor.onTargetFound = () => {
          console.log(`[useMindAR] Target found: ${label} (index ${targetIndex})`);
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

          activeTargetsRef.current.add(targetIndex);
          onStatusChange('tracking');
        };

        // Hide + pause fullscreen video when target is lost
        anchor.onTargetLost = () => {
          console.log(`[useMindAR] Target lost: ${label} (index ${targetIndex})`);
          fsVideo.pause();
          fsVideo.style.display = 'none';

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
  if (message.includes('404') || message.includes('targets.mind')) {
    return 'AR target file not found. Make sure /public/targets/targets.mind exists.';
  }
  if (message.includes('https') || message.includes('secure context')) {
    return 'Camera requires HTTPS. Please open this page over https://.';
  }
  return `AR failed to start: ${err?.message ?? String(err)}`;
}
