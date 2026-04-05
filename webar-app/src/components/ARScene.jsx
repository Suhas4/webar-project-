import { useRef } from 'react';
import { useMindAR } from '../hooks/useMindAR.js';

/**
 * ARScene — Full-screen container that hosts the MindAR + Three.js AR experience.
 *
 * MindAR.js injects two elements into the container div at runtime:
 *   • A <video> element showing the live camera feed (background)
 *   • A <canvas> element where Three.js renders the AR video overlays
 *
 * Both are absolutely positioned to fill the container.
 * Our React UI (LoadingScreen) sits above them via z-index.
 *
 * ⚠️  Do NOT render React children inside the container div.
 *     MindAR manages its own DOM children and will conflict with React's
 *     virtual DOM reconciliation.
 *
 * @param {{
 *   onStatusChange: (status: string, message?: string) => void,
 *   targets: Array|null,       — runtime targets from user uploads (null = use static config)
 *   mindFileUrl: string|null,  — blob URL or static path to .mind file
 * }} props
 */
export default function ARScene({ onStatusChange, targets, mindFileUrl }) {
  const containerRef = useRef(null);

  // The hook owns ALL MindAR + Three.js state.
  // It reads containerRef to inject the camera feed and canvas,
  // and calls onStatusChange to report lifecycle events up to App.
  // targets + mindFileUrl are passed through for runtime asset switching.
  useMindAR(containerRef, onStatusChange, targets, mindFileUrl);

  return (
    <div
      ref={containerRef}
      style={{
        // Fixed + full-viewport so the camera feed fills the screen
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        overflow: 'hidden',

        // Background layer — LoadingScreen and any future UI sit above this
        zIndex: 0,

        // Black background while camera initializes
        background: '#000',
      }}
    />
  );
}
