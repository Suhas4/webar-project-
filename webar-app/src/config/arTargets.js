/**
 * AR Target Configuration
 * ────────────────────────────────────────────────────────────────────────────
 *
 * AR_TARGETS — one entry per image marker.
 *
 *   targetIndex  Must match the order images were uploaded to the MindAR
 *                compiler (0-based). The first image you uploaded = index 0,
 *                the second = index 1, and so on.
 *
 *   videoUrl     Path relative to /public  OR  an absolute CDN URL.
 *                Local:  '/videos/demo1.mp4'
 *                CDN:    'https://cdn.example.com/videos/demo1.mp4'
 *                To switch from local to CDN, just change this string —
 *                nothing else in the codebase needs to change.
 *
 *   label        Human-readable name used in console logs and debug UI.
 *
 *   planeWidth   Width of the Three.js overlay plane in world units.
 *                1.0 = matches the physical width of the printed marker.
 *                Increase to make the video appear larger than the marker.
 *
 *   planeHeight  Height of the overlay plane. Set this to match your video's
 *                aspect ratio:
 *                  16:9  →  0.5625   (1920×1080, 1280×720 — most common)
 *                  4:3   →  0.75     (1024×768)
 *                  1:1   →  1.0      (square)
 *                  9:16  →  1.7778   (portrait / vertical video)
 *
 *   planeOffsetY Vertical offset in world units (0 = centered on marker).
 *                Positive = shift up, negative = shift down.
 *                Useful if you want the video to float above the marker card.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * HOW TO ADD A NEW TARGET:
 *   1. Add your new marker image to the MindAR compiler alongside existing ones.
 *      Re-export targets.mind and replace /public/targets/targets.mind.
 *   2. Add a new entry here with the correct targetIndex (next sequential number).
 *   3. Place the video at /public/videos/ (or use a CDN URL).
 *   4. Update maxTrack in MINDAR_CONFIG to match AR_TARGETS.length.
 * ────────────────────────────────────────────────────────────────────────────
 */
export const AR_TARGETS = [
  {
    targetIndex: 0,
    videoUrl: '/videos/demo1.mp4',
    label: 'Demo Target 1',
    planeWidth: 1,
    planeHeight: 0.5625, // 16:9
    planeOffsetY: 0,
  },
  {
    targetIndex: 1,
    videoUrl: '/videos/demo2.mp4',
    label: 'Demo Target 2',
    planeWidth: 1,
    planeHeight: 0.5625, // 16:9
    planeOffsetY: 0,
  },
];

/**
 * MINDAR_CONFIG — passed directly to new window.MINDAR.IMAGE.MindARThree()
 *
 *   imageTargetSrc   Path to the compiled .mind file.
 *                    Generate it at: https://hiukim.github.io/mind-ar-js-doc/tools/compile
 *
 *   maxTrack         Maximum number of targets tracked simultaneously.
 *                    Higher values = more CPU/GPU usage. Keep ≤ AR_TARGETS.length.
 *
 *   filterMinCF      Minimum confidence filter (0.001 – 1).
 *                    Lower = more responsive but jittery.
 *                    Higher = smoother but slower to acquire the target.
 *
 *   filterBeta       Smoothing factor (0.001 – 1000).
 *                    Lower = smoother overlay but more lag.
 *                    Higher = snappier but may jitter.
 *
 *   warmupTolerance  Frames to wait before confirming a target is found.
 *                    Prevents false positives on fast camera movement.
 *
 *   missTolerance    Frames to wait before confirming a target is lost.
 *                    Prevents flickering when the marker is briefly occluded.
 */
export const MINDAR_CONFIG = {
  imageTargetSrc: '/targets/targets.mind',
  maxTrack: AR_TARGETS.length,
  filterMinCF: 0.1,
  filterBeta: 10,
  warmupTolerance: 5,
  missTolerance: 5,
};
