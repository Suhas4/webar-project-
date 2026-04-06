# WebAR App — Complete Project Documentation

## Overview
A mobile-friendly WebAR application where users sign up/sign in, upload marker images and videos via a Setup Screen. When the camera detects a marker, the corresponding video plays fullscreen. Assets are compiled in-browser and persisted in IndexedDB. Authentication is handled by a Go backend with in-memory user store.

---

## Changelog

### Latest Changes (Session 2)

#### 🖼️ Logo
- Replaced all text-based "memo**era**" logos with `App Memo Era New.png` (transparent RGBA PNG)
- Logo used in: SplashScreen (via video), SignInScreen, SignUpScreen, WelcomeScreen, SetupScreen header
- File: `/webar-app/public/logo.png`

#### 🎬 Splash Video
- Replaced SplashScreen text animation with fullscreen video (`/public/splash.mp4`)
- Video plays muted, autoPlay, playsInline on every app open (when no token)
- `playbackRate` set to `duration / 3` so video always finishes in exactly 3 seconds
- Fallback: if autoplay blocked → 3s timeout; if video fails → 2.5s timeout
- If user has token → skips splash, goes straight to Setup

#### 📷 Camera / Files Picker (TargetCard)
- Tapping image or video drop zone shows a bottom sheet with two options:
  - **📷 Camera** — opens `capture="environment"` (rear camera)
  - **📁 Files** — opens normal file picker
- Separate hidden `<input>` elements for camera and files
- Styled bottom sheet with backdrop blur, handle bar, Cancel button

#### 🐛 Bug Fixes

| # | Bug | Fix |
|---|---|---|
| 1 | File read permission error on scan | Re-read each `File` into fresh `ArrayBuffer → Blob` right before compilation |
| 2 | "Scan" button label | Renamed to **"Upload →"** |
| 3 | Progress shows 0% then jumps to 100% | Yield to browser on each progress update via `Promise + setTimeout(0)`; SVG transition reduced to `0.15s linear` |
| 4 | File size limits | Image: 50MB hard block; Video: 100MB hard block (was just a warning) |
| 5 | Video only on small AR plane | Replaced Three.js plane with fullscreen `<video>` overlay (`position:fixed, 100%×100%, objectFit:cover`) |
| 6 | Video playing before target detected | `preload="none"` — video only loads/plays on `onTargetFound`, pauses on `onTargetLost` |
| 7 | Error adding Target 2+ | Re-read all File refs into fresh blobs before `saveTargets` |
| 8 | Splash video too long | `playbackRate = duration / 3` — always finishes in 3s |
| 9 | AR Error: Failed to load MindAR | Load MindAR via `<script type="module" src="CDN_URL">` with 3 retries + polling for `window.MINDAR` |

#### 🔐 Forgot Password (OTP Flow)
- New 3-step screen: `ForgotPasswordScreen.jsx`
- **Step 1**: Enter email or mobile → OTP sent to both email AND SMS
- **Step 2**: Enter 6-digit OTP (10-min expiry, 30s resend cooldown, masked email/mobile shown)
- **Step 3**: Set new password → auto sign-in on success
- Backend: 3 new endpoints added to `main.go`:
  - `POST /api/auth/forgot-password` — generates OTP, sends via SMTP + Twilio
  - `POST /api/auth/verify-otp` — validates OTP, returns 15-min reset token
  - `POST /api/auth/reset-password` — updates password, returns auth token
- OTP stored in-memory with expiry; cleared after successful reset
- In dev (no env vars): OTP printed to backend terminal log

#### 🔧 IndexedDB Fix
- `useArStorage.js`: Convert `File` objects to plain `Blob` via `arrayBuffer()` before storing
- Fixes `InvalidBlob` error on iOS Safari and Android when saving to IndexedDB

#### 🌐 Local Testing Setup
- `API_BASE` in `SignInScreen.jsx` and `SignUpScreen.jsx` set to `http://192.168.31.193:8181` for local WiFi testing
- Protected with `git update-index --skip-worktree` so changes are never committed
- Production URL: `https://webar-project-8jbi.onrender.com`

---

## Environment Variables

### Backend (Render)
| Key | Value |
|---|---|
| `JWT_SECRET` | `memoera-secret-key-2024-xyz` |
| `FRONTEND_ORIGIN` | `https://web-ar-suhas.netlify.app` |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | your Gmail address |
| `SMTP_PASS` | Gmail App Password |
| `SMTP_FROM` | your Gmail address |
| `TWILIO_ACCOUNT_SID` | from twilio.com/console |
| `TWILIO_AUTH_TOKEN` | from twilio.com/console |
| `TWILIO_FROM_NUMBER` | your Twilio number e.g. `+1234567890` |

---

---

## Final Project Structure

```
webar-project/
├── webar-app/                          ← React + Vite frontend
│   ├── public/
│   │   ├── targets/README.txt          ← instructions for static .mind files
│   │   └── videos/README.txt           ← instructions for static video files
│   ├── src/
│   │   ├── components/
│   │   │   ├── ARScene.jsx             ← fullscreen camera container
│   │   │   ├── LoadingScreen.jsx       ← idle/loading/ready/tracking/error UI
│   │   │   ├── SetupScreen.jsx         ← upload UI + compilation flow
│   │   │   ├── TargetCard.jsx          ← per-target image + video upload card
│   │   │   ├── SplashScreen.jsx        ← app launch screen (2.5s auto-advance)
│   │   │   ├── SignInScreen.jsx        ← email/mobile + password login
│   │   │   ├── SignUpScreen.jsx        ← full registration form
│   │   │   ├── WelcomeScreen.jsx       ← post-login welcome (2s auto-advance)
│   │   │   └── UploadProgressOverlay.jsx ← full-screen circular compile progress
│   │   ├── config/
│   │   │   └── arTargets.js            ← static fallback target config
│   │   ├── hooks/
│   │   │   ├── useMindAR.js            ← MindAR + Three.js AR lifecycle
│   │   │   └── useArStorage.js         ← IndexedDB read/write (idb-keyval)
│   │   ├── App.jsx                     ← root, view routing (6 views)
│   │   ├── main.jsx
│   │   └── index.css
│   ├── index.html                      ← import map for Three.js + MindAR
│   ├── vite.config.js
│   ├── netlify.toml
│   └── package.json
└── backend/                            ← Go auth + API server
    ├── main.go
    ├── go.mod
    ├── Makefile
    └── render.yaml
```

---

## Screen Flow

```
App Load
  ├─ token in localStorage? → SetupScreen (skip auth)
  └─ no token →
       SplashScreen (2.5s)
         └─ SignInScreen
               ├─ "Sign Up" → SignUpScreen → SignInScreen (with success msg)
               └─ Sign In success → WelcomeScreen (2s) → SetupScreen

SetupScreen
  ├─ Upload marker image (JPG/PNG) per target
  ├─ Upload video (MP4) per target
  ├─ Select aspect ratio (16:9 / 4:3 / 1:1 / 9:16)
  ├─ Click "Scan →"
  │     ├─ UploadProgressOverlay shown (circular ring 0→100%)
  │     ├─ dynamic import() → mindar-image.prod.js (compiler)
  │     ├─ Compile marker images → .mind ArrayBuffer
  │     ├─ Save everything to IndexedDB
  │     ├─ Create blob URLs for .mind + videos
  │     └─ Switch to AR view
  │
AR View
  ├─ dynamic import() → mindar-image-three.prod.js (tracker)
  ├─ MindARThree starts camera + loads .mind blob URL
  ├─ Three.js VideoTexture overlays video on detected marker
  ├─ Video plays WITH AUDIO when marker visible, pauses when lost
  └─ ✏️ button (top-right) → back to SetupScreen
```

---

## App View States (App.jsx)

| View | Component | Trigger |
|---|---|---|
| `'splash'` | SplashScreen | App load (no token) |
| `'signin'` | SignInScreen | After splash / sign out |
| `'signup'` | SignUpScreen | "Sign Up" link |
| `'welcome'` | WelcomeScreen | Successful sign in |
| `'setup'` | SetupScreen | After welcome / has token |
| `'ar'` | ARScene + LoadingScreen | "Scan →" button |

---

## Authentication

### Frontend
- Token stored in `localStorage` as `memoera_token`
- User object stored as `memoera_user` (JSON)
- On app load: checks `localStorage` → skips to `'setup'` if token exists
- Sign Out: clears both keys → navigates to `'signin'`

### Backend (Go — `backend/main.go`)
- Port: **8181** (avoids conflict with other services)
- In-memory user store: `map[string]User{}` keyed by email
- Mobile index: `map[string]string{}` mobile → email (for signin by mobile)
- Password hashing: SHA-256 with random salt (`salt:hash` format)
- Token: Base64(JSON payload) + "." + HMAC-SHA256 signature (stdlib only, no external JWT lib)
- Token expiry: 30 days

### Auth Endpoints

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/auth/signup` | `{firstName, lastName, mobile, email, password, securityQuestion, securityAnswer}` | `{token, user}` |
| POST | `/api/auth/signin` | `{identifier, password}` (identifier = email or mobile) | `{token, user}` |

### Sign Up Fields
- First Name, Last Name
- Mobile Number (10 digits)
- Email ID
- Create Password (min 6 chars)
- Security Question (dropdown, 5 options)
- Security Answer

---

## Color Theme (Memoera Brand)

Based on `logo.pdf` and `REFRENCE-1.pdf`:

| Token | Value | Usage |
|---|---|---|
| `BG` | `#080C18` | Deep dark navy background |
| `TEAL` | `#00C9A7` | Primary accent (logo color) |
| `CYAN` | `#00E5CC` | Secondary accent / gradient end |
| `FONT` | `"Outfit"` | Google Fonts, all text |
| Card bg | `rgba(0,201,167,0.04)` | Glassmorphism cards |
| Card border | `rgba(0,201,167,0.25)` | Subtle teal border |
| Button text | `#080C18` | Dark text on teal buttons |

**Gradient:** `linear-gradient(135deg, #00C9A7, #00E5CC)`
**Glow shadow:** `0 4px 24px rgba(0,201,167,0.35)`

> ⚠️ Pink (`#E91E8C`) and purple (`#7B2FBE`) have been fully removed. All accents use teal/cyan only.

---

## Dependencies

### Frontend (`package.json`)
```json
{
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "three": "0.150.0",
    "idb-keyval": "^6.2.2"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "vite": "^5.3.1"
  }
}
```

> ⚠️ `three` must be **exactly `0.150.0`** — MindAR 1.2.5 uses `sRGBEncoding` which was removed in Three.js r152.

### Backend (`go.mod`)
```
module webar-backend
go 1.22
```
No external Go dependencies — uses stdlib only (`crypto/hmac`, `crypto/sha256`, `encoding/base64`, `sync`, etc.)

---

## Key Technical Decisions & Fixes

### 1. MindAR Loading — Dynamic `import()` not `<script>` tag
Both MindAR dist files are **ES modules with relative chunk imports**. A plain `<script src="...">` tag silently fails.

**Fix:** Load both via dynamic `import()` inside the app code:
```js
// useMindAR.js — loads tracker when AR view starts
await import('https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-three.prod.js');

// SetupScreen.jsx — loads compiler when "Scan →" is clicked
await import('https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image.prod.js');
```

### 2. Import Map — Required for bare `"three"` specifier
MindAR's tracker does `import { Matrix4 } from "three"`. Browsers cannot resolve bare specifiers without an import map.

**Fix:** Add import map as the **very first tag in `<head>`** in `index.html`:
```html
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.150.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.150.0/examples/jsm/"
  }
}
</script>
```

### 3. Three.js Externalized in Vite
To prevent two copies of Three.js (one from npm bundle + one from CDN via import map):
```js
optimizeDeps: { exclude: ['three'] },
build: {
  rollupOptions: {
    external: ['three'],
    output: {
      paths: {
        three: 'https://cdn.jsdelivr.net/npm/three@0.150.0/build/three.module.js'
      }
    }
  }
}
```

### 4. Three.js API — `encoding` not `colorSpace`
In Three.js r150, the correct texture API is:
```js
texture.encoding = THREE.sRGBEncoding;  // r150 ✅
// NOT: texture.colorSpace = THREE.SRGBColorSpace;  // r152+ only ❌
```

### 5. MindAR Compiler — Separate Bundle
The compiler (`window.MINDAR.IMAGE.Compiler`) is in `mindar-image.prod.js`.
The tracker (`window.MINDAR.IMAGE.MindARThree`) is in `mindar-image-three.prod.js`.
They are **two separate files**.

### 6. Vite `allowedHosts: true` — Required for ngrok
Without this, Vite rejects ngrok tunnel requests with 403 Forbidden.
> Note: In Vite 5, use `allowedHosts: true` (not `'all'`).

### 7. ngrok Browser Warning Bypass
ngrok shows an interstitial warning page (ERR_NGROK_6024) on free accounts.

**Fix:** Add response header in `vite.config.js`:
```js
server: {
  headers: { 'ngrok-skip-browser-warning': 'true' }
}
```

### 8. AR Video Audio
Videos play **with audio** when a marker is detected. If the browser blocks unmuted autoplay (mobile policy), the hook automatically retries muted so the video still shows:
```js
video.muted = false;
playPromise.catch((err) => {
  if (err.name === 'NotAllowedError') {
    video.muted = true;
    video.play().catch(() => {});
  }
});
```

### 9. Backend Port 8181
The Go backend runs on port **8181** (not 8080) to avoid conflicts with other local services.

---

## IndexedDB Storage Schema

| Key | Type | Contents |
|---|---|---|
| `ar-targets` | JSON array | target metadata (label, planeWidth, planeHeight, planeOffsetY) |
| `ar-mind-file` | ArrayBuffer | compiled .mind binary |
| `ar-video-{i}` | Blob | video file for target index i |
| `ar-image-{i}` | Blob | marker image for target index i |

---

## Running Locally

### Prerequisites
- Node.js v18+
- Go v1.22+

### Frontend
```bash
cd webar-project/webar-app
npm install
npm run dev        # http://localhost:5173
```

### Backend
```bash
cd webar-project/backend
go run main.go     # http://localhost:8181
```

### Mobile Testing (camera requires HTTPS)
```bash
# Install ngrok: https://ngrok.com/download
ngrok config add-authtoken YOUR_TOKEN
ngrok http 5173
# Open the https://xxxxx.ngrok-free.app URL on your phone
```

> **Note for mobile + backend:** When testing on mobile via ngrok, update `API_BASE` in `SignInScreen.jsx` and `SignUpScreen.jsx` to your machine's local IP or a second ngrok tunnel for port 8181.

---

## Deployment

### Netlify (frontend)
- Base directory: `webar-app`
- Build command: `npm run build`
- Publish directory: `dist`
- `netlify.toml` handles headers (`Permissions-Policy: camera=(*)`) + SPA routing

### Render (backend)
- Build: `go build -o webar-backend .`
- Start: `./webar-backend`
- Set env vars:
  - `FRONTEND_ORIGIN=https://your-app.netlify.app`
  - `JWT_SECRET=your-random-secret-here`
  - `PORT` (set automatically by Render)
- Health check path: `/health`

---

## Adding New Targets

1. Go to https://hiukim.github.io/mind-ar-js-doc/tools/compile
2. Upload all marker images **in order** (index 0 first)
3. Download `targets.mind` → place at `public/targets/targets.mind`
4. Update `src/config/arTargets.js` with new entries

Or via the Upload UI — just add another TargetCard and re-compile.

---

## Video Optimization (ffmpeg)

```bash
ffmpeg -i input.mp4 \
  -vcodec libx264 \
  -crf 28 \
  -preset fast \
  -movflags +faststart \
  -vf "scale='min(1280,iw)':-2" \
  output.mp4
```

> Note: Remove `-an` flag (which strips audio) if you want audio to play in AR.

| Flag | Purpose |
|---|---|
| `-crf 28` | Quality (18=best, 28=good web, 35=low) |
| `-movflags +faststart` | Stream before fully downloaded |
| `-vf scale` | Max 1280px wide, preserve aspect ratio |

**Target:** H.264 MP4, max 720p, under 10MB per video.

---

## Aspect Ratio → planeHeight Reference

| Ratio | planeHeight | Use case |
|---|---|---|
| 16:9 | 0.5625 | Landscape video (most common) |
| 4:3 | 0.75 | Older landscape format |
| 1:1 | 1.0 | Square video |
| 9:16 | 1.7778 | Portrait / vertical video |

---

## Mobile Compatibility Notes

| Requirement | Why | How |
|---|---|---|
| HTTPS | Camera API blocked on HTTP | ngrok / Netlify / `npm run dev:https` |
| `playsinline` on video | Prevents iOS fullscreen hijack | Set in `useMindAR.js` |
| Audio fallback | Browser may block unmuted autoplay | Retry muted on `NotAllowedError` |
| `crossOrigin="anonymous"` | Required for CDN video URLs | Set in `useMindAR.js` |
| `allowedHosts: true` | ngrok 403 fix | Set in `vite.config.js` |
| `ngrok-skip-browser-warning` | ngrok interstitial bypass | Set in `vite.config.js` headers |

---

## Known Dev-Mode Warning

```
WARNING: Multiple instances of Three.js being imported.
```

This appears in **development only**. Safe to ignore — production build uses only the CDN copy.

---

## Deployment Details

### Live URLs
| Service | URL |
|---|---|
| Frontend (Netlify) | https://web-ar-suhas.netlify.app |
| Backend (Render) | https://webar-project-8jbi.onrender.com |
| Health Check | https://webar-project-8jbi.onrender.com/health |
| Custom Domain | https://memoera.in (pending DNS propagation) |

### GitHub Repository
- URL: https://github.com/Suhas4/webar-project-.git
- Branch: `main`

### Render Environment Variables
| Key | Value |
|---|---|
| `JWT_SECRET` | `memoera-secret-key-2024-xyz` |
| `FRONTEND_ORIGIN` | `https://web-ar-suhas.netlify.app` |

### Netlify Build Settings
| Field | Value |
|---|---|
| Base directory | `webar-app` |
| Build command | `npm run build` |
| Publish directory | `webar-app/dist` |

### Custom Domain Setup (memoera.in) — ⏳ IN PROGRESS
- Domain purchased from GoDaddy
- Netlify nameservers added in GoDaddy
- DNS propagation in progress (can take up to 24 hours)

#### ✅ Pending Next Steps:
1. Check DNS propagation at https://dnschecker.org/#NS/memoera.in
2. Wait until Netlify nameservers (dns1.p0X.nsone.net) show green ✅ globally
3. Go to Netlify → Domain management → HTTPS → Click "Verify DNS configuration"
4. Click "Provision certificate" to enable HTTPS on memoera.in
5. Update `FRONTEND_ORIGIN` on Render to `https://memoera.in`

---

## Playwright Test Results

| Test | Result |
|---|---|
| Splash screen renders + auto-advances | ✅ |
| Sign Up form — all fields, validation, duplicate detection | ✅ |
| Sign In — email/mobile + password, success message | ✅ |
| Welcome screen renders + auto-advances | ✅ |
| Upload screen renders with Sign Out button | ✅ |
| Token persistence — refresh skips to upload | ✅ |
| Upload marker image → thumbnail preview | ✅ |
| Upload video → filename + size shown | ✅ |
| Circular progress overlay during compile | ✅ |
| AR view launches → "Ready to Scan" | ✅ |
| ✏️ Edit button → returns to Setup | ✅ |
| IndexedDB persistence → pre-populated on return | ✅ |
| Console errors | ✅ 0 errors |
