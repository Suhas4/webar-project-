import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { AR_TARGETS, MINDAR_CONFIG } from '../config/arTargets.js';

/**
 * useMindAR — Custom hook managing the full MindAR + Three.js AR lifecycle.
 *
 * @param {React.RefObject<HTMLDivElement>} containerRef
 *   Ref to the fullscreen container div rendered by ARScene.
 *   MindAR injects its camera <video> and Three.js <canvas> into this element.
 *
 * @param {(status: string, message?: string) => void} onStatusChange
 *   Callback to report AR lifecycle state to the parent (App.jsx).
 *   Values: 'idle' | 'loading' | 'ready' | 'tracking' | 'error'
 *
 * @param {Array|null} [targetsOverride]
 *   Runtime targets array (from user uploads). If null/undefined, falls back
 *   to the static AR_TARGETS from arTargets.js.
 *
 * @param {string|null} [mindFileUrlOverride]
 *   Blob URL or path to the .mind file (from user uploads). If null/undefined,
 *   falls back to MINDAR_CONFIG.imageTargetSrc ('/targets/targets.mind').
 *
 * @returns {{ stop: () => Promise<void> }}
 *   Imperative handle — call stop() if you need to tear down AR from outside
 *   (e.g. navigating away). The hook also calls stop() automatically on unmount.
 *
 * ── Lifecycle ──────────────────────────────────────────────────────────────
 *  1. Wait for window.MINDAR to be available (CDN async load guard)
 *  2. Create MindARThree instance with our config
 *  3. Add ambient lighting to the Three.js scene
 *  4. For each target in AR_TARGETS:
 *       a. Create a hidden <video> element (offscreen in DOM)
 *       b. Create THREE.VideoTexture from that video element
 *       c. Create a PlaneGeometry mesh with the video texture
 *       d. Attach the mesh to a MindAR anchor (anchor.group.add(mesh))
 *       e. Wire anchor.onTargetFound / onTargetLost callbacks
 *  5. Call mindarThree.start() — requests camera + loads .mind file
 *  6. Start renderer.setAnimationLoop for continuous Three.js rendering
 *  7. On unmount: cancel loop, pause videos, dispose textures, stop MindAR
 */
export function useMindAR(containerRef, onStatusChange, targetsOverride, mindFileUrlOverride) {
  const mindarThreeRef = useRef(null);
  const videoElementsRef = useRef([]);   // HTMLVideoElement[] indexed by targetIndex
  const videoTexturesRef = useRef([]);   // THREE.VideoTexture[] indexed by targetIndex
  const isStartedRef = useRef(false);
  // Track which targetIndexes are currently found (for multi-target status)
  const activeTargetsRef = useRef(new Set());

  // ── stop() ─────────────────────────────────────────────────────────────────
  // Tears down everything: render loop, videos, textures, MindAR camera stream.
  // Safe to call multiple times (guards with isStartedRef).
  const stop = useCallback(async () => {
    if (!isStartedRef.current && !mindarThreeRef.current) return;
    isStartedRef.current = false;

    // Stop all video elements and release their media resources
    videoElementsRef.current.forEach((video) => {
      if (!video) return;
      video.pause();
      video.src = '';
      video.load(); // triggers the browser to release the media resource
    });

    // Dispose Three.js GPU textures (prevents memory leaks on re-mount)
    videoTexturesRef.current.forEach((texture) => {
      if (texture) texture.dispose();
    });

    // Stop MindAR — releases the camera MediaStream
    try {
      if (mindarThreeRef.current) {
        mindarThreeRef.current.renderer.setAnimationLoop(null); // cancel render loop
        await mindarThreeRef.current.stop();
        mindarThreeRef.current.renderer.dispose();
      }
    } catch (err) {
      // stop() can throw if called before start() completed — safe to ignore
      console.warn('[useMindAR] stop() warning (usually harmless):', err.message);
    }

    // Reset all refs
    mindarThreeRef.current = null;
    videoElementsRef.current = [];
    videoTexturesRef.current = [];
    activeTargetsRef.current.clear();
  }, []);

  // ── Main effect ────────────────────────────────────────────────────────────
  useEffect(() => {
    // `cancelled` guards against React 18 StrictMode double-invocation.
    // StrictMode runs effects twice in dev: mount → unmount → mount.
    // The cleanup from the first mount sets cancelled=true before the second
    // mount's async init can call mindarThree.start(), preventing a double-start.
    let cancelled = false;

    async function init() {
      if (!containerRef.current) {
        console.error('[useMindAR] containerRef is null — cannot initialize');
        return;
      }

      // Resolve targets and .mind file URL:
      // Use runtime overrides (from user uploads) if provided,
      // otherwise fall back to the static config from arTargets.js.
      const resolvedTargets = (targetsOverride && targetsOverride.length > 0)
        ? targetsOverride
        : AR_TARGETS;
      const resolvedMindFileUrl = mindFileUrlOverride || MINDAR_CONFIG.imageTargetSrc;

      if (!resolvedTargets.length) {
        onStatusChange('error', 'No AR targets configured. Go back to setup and add at least one target.');
        return;
      }

      // ── Step 1: Load window.MINDAR.IMAGE.MindARThree ─────────────────────
      // mindar-image-three.prod.js is an ES module — it cannot be loaded with
      // a plain <script> tag. We use dynamic import() which correctly resolves
      // its relative chunk dependencies from the CDN base URL.
      // The module sets window.MINDAR.IMAGE.MindARThree as a side effect.
      if (!window.MINDAR?.IMAGE?.MindARThree) {
        try {
          await import('https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-three.prod.js');
        } catch (err) {
          onStatusChange('error', 'Failed to load MindAR. Check your internet connection and reload.');
          return;
        }
      }

      if (!window.MINDAR?.IMAGE?.MindARThree) {
        onStatusChange('error', 'MindAR did not initialize correctly. Please reload.');
        return;
      }

      if (cancelled) return;

      onStatusChange('loading');

      // ── Step 2: Create MindARThree instance ───────────────────────────────
      let mindarThree;
      try {
        mindarThree = new window.MINDAR.IMAGE.MindARThree({
          container: containerRef.current,
          ...MINDAR_CONFIG,
          // Use the resolved .mind file URL (blob URL from upload, or static path)
          imageTargetSrc: resolvedMindFileUrl,
          maxTrack: resolvedTargets.length,
          // Disable MindAR's built-in loading/scanning/error UI elements
          // so our React LoadingScreen renders instead.
          uiLoading: 'no',
          uiScanning: 'no',
          uiError: 'no',
        });
      } catch (err) {
        console.error('[useMindAR] MindARThree construction failed:', err);
        onStatusChange('error', `AR initialization failed: ${err.message}`);
        return;
      }

      if (cancelled) return;

      mindarThreeRef.current = mindarThree;
      const { renderer, scene, camera } = mindarThree;

      // ── Step 3: Add ambient lighting ──────────────────────────────────────
      // MeshBasicMaterial (used for video planes) ignores lighting, but
      // ambient light is needed if you later add non-emissive 3D objects.
      const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
      scene.add(ambientLight);

      // ── Step 4: Create video elements + Three.js meshes per target ────────
      resolvedTargets.forEach((targetConfig) => {
        const { targetIndex, videoUrl, planeWidth, planeHeight, planeOffsetY, label } =
          targetConfig;

        // ── 4a: Hidden HTML <video> element ───────────────────────────────
        //
        // THREE.VideoTexture requires an HTMLVideoElement as its pixel source.
        // We create one per target, hide it offscreen, and let Three.js sample
        // its frames each render tick.
        //
        // CRITICAL mobile attributes:
        //   playsinline          — prevents iOS from hijacking video into fullscreen
        //   webkit-playsinline   — older iOS Safari (pre-10)
        //   muted                — REQUIRED for autoplay without a user gesture
        //                          (Chrome autoplay policy, iOS Safari policy)
        //   autoplay             — hint to browser; actual play() is called in onTargetFound
        //   preload="auto"       — start buffering immediately so video is ready when marker appears
        //   crossOrigin          — required when videoUrl is a CDN URL on a different origin
        //
        const video = document.createElement('video');
        video.src = videoUrl;
        video.loop = true;
        video.muted = false;  // Audio enabled — user wants sound with AR overlay
        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');
        video.setAttribute('autoplay', '');
        video.preload = 'auto';
        video.crossOrigin = 'anonymous';

        // Position offscreen — in DOM but not visible
        Object.assign(video.style, {
          position: 'absolute',
          top: '-9999px',
          left: '-9999px',
          width: '1px',
          height: '1px',
          opacity: '0',
          pointerEvents: 'none',
        });

        // Append to the AR container (not document.body) to keep it scoped
        containerRef.current.appendChild(video);
        // Trigger buffering
        video.load();

        videoElementsRef.current[targetIndex] = video;

        // ── 4b: THREE.VideoTexture ────────────────────────────────────────
        //
        // VideoTexture samples the video element on every animation frame.
        // It's "live" — no manual needsUpdate required; Three.js handles it.
        //
        const texture = new THREE.VideoTexture(video);
        texture.minFilter = THREE.LinearFilter; // no mipmaps for video
        texture.magFilter = THREE.LinearFilter;
        texture.encoding = THREE.sRGBEncoding; // correct gamma for video (Three.js r150 API)

        videoTexturesRef.current[targetIndex] = texture;

        // ── 4c: Plane mesh ────────────────────────────────────────────────
        //
        // PlaneGeometry dimensions are in Three.js world units.
        // planeWidth: 1.0 = matches the physical width of the printed marker.
        // planeHeight: set to match your video's aspect ratio (see arTargets.js).
        //
        const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);

        // MeshBasicMaterial is "unlit" — video plays at full brightness
        // regardless of scene lighting. Do NOT use MeshStandardMaterial here.
        const material = new THREE.MeshBasicMaterial({
          map: texture,
          side: THREE.FrontSide,
          transparent: false, // set true + use WebM/VP9 for alpha-channel video
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.y = planeOffsetY ?? 0;
        mesh.visible = false; // hidden until onTargetFound fires

        // ── 4d: Attach mesh to MindAR anchor ─────────────────────────────
        //
        // addAnchor(targetIndex) returns an anchor whose .group is a Three.js
        // Group that MindAR automatically positions and rotates to match the
        // detected marker in 3D space. Anything added to anchor.group moves
        // with the marker.
        //
        const anchor = mindarThree.addAnchor(targetIndex);
        anchor.group.add(mesh);

        // ── 4e: Anchor event callbacks ────────────────────────────────────

        anchor.onTargetFound = () => {
          console.log(`[useMindAR] Target found: ${label} (index ${targetIndex})`);
          mesh.visible = true;

          // Attempt to play with audio. If browser blocks unmuted autoplay,
          // fall back to muted play so the video still shows.
          const playPromise = video.play();
          if (playPromise !== undefined) {
            playPromise.catch((err) => {
              if (err.name === 'NotAllowedError') {
                // Browser blocked unmuted autoplay — retry muted
                console.warn('[useMindAR] Unmuted autoplay blocked, retrying muted');
                video.muted = true;
                video.play().catch(() => {});
              } else if (err.name !== 'AbortError') {
                console.warn(
                  `[useMindAR] video.play() failed for target ${targetIndex}:`,
                  err.name,
                  err.message
                );
              }
            });
          }

          activeTargetsRef.current.add(targetIndex);
          onStatusChange('tracking');
        };

        anchor.onTargetLost = () => {
          console.log(`[useMindAR] Target lost: ${label} (index ${targetIndex})`);
          mesh.visible = false;
          video.pause();

          activeTargetsRef.current.delete(targetIndex);
          // Only revert to 'ready' when ALL targets are lost
          if (activeTargetsRef.current.size === 0) {
            onStatusChange('ready');
          }
        };
      });

      // ── Step 5: Start MindAR ──────────────────────────────────────────────
      // start() does three things:
      //   1. Calls getUserMedia() to request camera permission
      //   2. Fetches and parses the .mind target file
      //   3. Starts the WASM tracking worker
      // It resolves when the camera feed is live and tracking has begun.
      try {
        await mindarThree.start();
      } catch (err) {
        console.error('[useMindAR] mindarThree.start() failed:', err);
        onStatusChange('error', getCameraErrorMessage(err));
        return;
      }

      // Check if StrictMode cleanup fired while we were awaiting start()
      if (cancelled) {
        await stop();
        return;
      }

      isStartedRef.current = true;
      onStatusChange('ready');

      // ── Step 6: Start Three.js render loop ───────────────────────────────
      // setAnimationLoop is the Three.js-recommended approach — it handles
      // tab visibility changes (pauses when tab is hidden, resumes on focus).
      // MindAR's internal update step is also driven by this loop.
      renderer.setAnimationLoop(() => {
        renderer.render(scene, camera);
      });
    }

    init();

    // Cleanup: runs on unmount OR on StrictMode second invocation
    return () => {
      cancelled = true;
      stop();
    };
    // Re-initialize when the targets array or .mind file URL changes.
    // This happens when the user uploads new assets and clicks "Start AR".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetsOverride, mindFileUrlOverride]);

  return { stop };
}

// ── Helpers ───────────────────────────────────────────────────────────────────



/**
 * getCameraErrorMessage — Maps raw browser/MindAR errors to user-friendly strings.
 */
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
