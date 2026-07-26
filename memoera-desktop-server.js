// Memoera Desktop Server
// Serves the built app locally so it works in any desktop browser.
// Run: node memoera-desktop-server.js

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const os    = require('os');
const path  = require('path');
const { exec } = require('child_process');

const PORT       = 3456;
const HTTPS_PORT = 3457;
const DIST       = path.join(__dirname, 'webar-app', 'dist');
const CERT_KEY   = path.join(__dirname, 'certs', 'key.pem');
const CERT_CRT   = path.join(__dirname, 'certs', 'cert.pem');
// Camera access (getUserMedia) is blocked by mobile browsers on any origin
// that isn't localhost or HTTPS — a phone hitting the plain http://<lan-ip>
// address below can load the app fine but the AR scanner's camera silently
// never starts. The self-signed HTTPS server on HTTPS_PORT is the one to use
// from a phone; accept the one-time "not private" warning on first visit.

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg':  'image/svg+xml',
  '.mp4':  'video/mp4',
  '.webm': 'video/webm',
  '.mind': 'application/octet-stream',
  '.json': 'application/json',
  '.ico':  'image/x-icon',
  '.wasm': 'application/wasm',
};

function handleRequest(req, res) {
  // Strip query string
  let urlPath = req.url.split('?')[0];

  // Decode URI
  try { urlPath = decodeURIComponent(urlPath); } catch (_) {}

  let filePath = path.join(DIST, urlPath);

  // Security: stay inside dist
  if (!filePath.startsWith(DIST)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  // If directory, serve index.html inside it
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  // SPA fallback — unknown routes → index.html
  if (!fs.existsSync(filePath)) {
    filePath = path.join(DIST, 'index.html');
  }

  const ext  = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';

  // Range request support for videos
  const stat = fs.statSync(filePath);
  const range = req.headers['range'];

  if (range && (mime.startsWith('video/') || mime.startsWith('audio/'))) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end   = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
    const chunk = end - start + 1;
    res.writeHead(206, {
      'Content-Range':  `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges':  'bytes',
      'Content-Length': chunk,
      'Content-Type':   mime,
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
    return;
  }

  res.writeHead(200, {
    'Content-Type':   mime,
    'Content-Length': stat.size,
    // A dev tool should never let the browser reuse a stale copy of a file
    // that's actively being edited — 'no-cache' alone can still get served
    // from cache on some mobile WebViews when there's no ETag/Last-Modified
    // to revalidate against, so force a real re-fetch every time.
    'Cache-Control':  'no-store, no-cache, must-revalidate',
    'Pragma':         'no-cache',
  });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(handleRequest);

const hasCert = fs.existsSync(CERT_KEY) && fs.existsSync(CERT_CRT);
const httpsServer = hasCert
  ? https.createServer({ key: fs.readFileSync(CERT_KEY), cert: fs.readFileSync(CERT_CRT) }, handleRequest)
  : null;

function onError(label, port) {
  return (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n  ❌  Port ${port} (${label}) is already in use. Close the other instance and try again.\n`);
    } else {
      console.error(err);
    }
    process.exit(1);
  };
}

server.listen(PORT, '0.0.0.0', () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\n  ✅  Memoera (HTTP) is running at ${url}`);

  const nets = os.networkInterfaces();
  const lanIPs = [];
  for (const iface of Object.values(nets)) {
    for (const net of iface || []) {
      if (net.family === 'IPv4' && !net.internal) lanIPs.push(net.address);
    }
  }
  for (const ip of lanIPs) {
    console.log(`  📱  On your phone (same Wi-Fi, no camera): http://${ip}:${PORT}`);
  }

  if (httpsServer) {
    httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
      console.log(`  🔒  Memoera (HTTPS) is running at https://localhost:${HTTPS_PORT}`);
      for (const ip of lanIPs) {
        console.log(`  📷  On your phone (same Wi-Fi, camera works): https://${ip}:${HTTPS_PORT}`);
      }
      console.log('      (Self-signed cert — accept the browser warning once on first visit.)');
      console.log('      Press Ctrl+C to stop.\n');
    });
    httpsServer.on('error', onError('HTTPS', HTTPS_PORT));
  } else {
    console.log('      No certs/key.pem + certs/cert.pem found — HTTPS server skipped (camera will not work over the LAN link).');
    console.log('      Press Ctrl+C to stop.\n');
  }

  // Open browser (Windows / macOS / Linux)
  const cmd = process.platform === 'win32' ? `start "" "${url}"`
            : process.platform === 'darwin' ? `open "${url}"`
            : `xdg-open "${url}"`;
  exec(cmd);
});

server.on('error', onError('HTTP', PORT));
