import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Plugin to inject the Three.js import map into the built index.html.
// Vite strips <script type="importmap"> during build, but MindAR's CDN bundle
// uses bare "three" specifier — without the import map it fails in production.
function injectImportMap() {
  const importMap = `<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.150.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.150.0/examples/jsm/"
  }
}
</script>`;

  return {
    name: 'inject-import-map',
    transformIndexHtml(html) {
      // Inject import map as the very first tag inside <head>
      return html.replace('<head>', `<head>\n    ${importMap}`);
    },
  };
}

export default defineConfig({
  plugins: [react(), injectImportMap()],

  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    headers: {
      'ngrok-skip-browser-warning': 'true',
    },
    watch: {
      // android/ is Capacitor build output, rewritten wholesale by `npx cap sync`/
      // `cap copy` — watching it serves no purpose and on Windows this collided
      // with that copy mid-write (EBUSY on a locked file), crashing the dev server.
      ignored: ['**/android/**'],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:8181',
        changeOrigin: true,
      },
      // Poster/festival backend on Railway. Proxying in dev makes the browser
      // call a same-origin path, so Railway's CORS origin allowlist (which only
      // permits localhost:5173 + prod domains) never blocks it on other ports.
      '/festival-api': {
        target: 'https://memoera-festival-backend-production.up.railway.app',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/festival-api/, ''),
      },
    },
  },

  optimizeDeps: {
    exclude: ['three'],
  },

  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      external: ['three'],
      output: {
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
