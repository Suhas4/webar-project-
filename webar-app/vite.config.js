import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  server: {
    host: '0.0.0.0',
    port: 5173,
    // Required for ngrok — allows requests from any ngrok tunnel URL.
    allowedHosts: true,
    // Add ngrok-skip-browser-warning header to bypass ngrok's interstitial
    // warning page (ERR_NGROK_6024) on all responses.
    headers: {
      'ngrok-skip-browser-warning': 'true',
    },
  },

  optimizeDeps: {
    // Exclude three from Vite's pre-bundling — it is provided by the
    // import map in index.html (CDN ESM build). Bundling it separately
    // would create two copies of Three.js and break MindAR.
    exclude: ['three'],
  },

  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      // Mark three as external so Rollup does NOT bundle it.
      // At runtime the import map resolves "three" to the CDN ESM build,
      // which is the same copy MindAR uses — no duplicate instances.
      external: ['three'],
      output: {
        // Map the external "three" bare specifier to the CDN URL
        // so the built HTML works without an import map at runtime too.
        // (The import map in index.html handles this for the browser.)
        paths: {
          three: 'https://cdn.jsdelivr.net/npm/three@0.150.0/build/three.module.js',
        },
      },
    },
  },

  define: {
    global: 'globalThis',
  },
});
