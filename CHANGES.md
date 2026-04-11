# WebAR App — Complete Project Documentation

## Overview
A mobile-friendly WebAR application where users sign up/sign in, upload marker images and videos via a Setup Screen. When the camera detects a marker, the corresponding video plays fullscreen. Assets are compiled in-browser, uploaded to Cloudflare R2, and metadata persisted in Neon PostgreSQL. Authentication is handled by a Go backend backed by Neon PostgreSQL.

---

## Changelog

### Session 5 — Full App Redesign + OTP Signup

#### 🎨 UI Redesign — Dark Teal Theme

All screens updated to match brand reference images with dark teal color palette:
- **Background:** `linear-gradient(160deg, #061A1F, #0A2229, #061820)`
- **Gold accent:** `#C9A84C` (nav bar border)
- **Logo watermark:** low-opacity infinity logo on background

#### 📱 Screen Changes

| Screen | Change |
|---|---|
| **SplashScreen** | Removed video, shows `splash.jpg` (logo image) for 2.5s |
| **HelloScreen** | Dark teal bg, "EXISTING ACCOUNT" button text, logo watermark |
| **HomeScreen** | Dark teal bg, real SVG nav icons, logo watermark, WhatsApp chat button |
| **ProfileScreen** | Dark teal bg |
| **SignUpScreen** | 2-step flow: form → OTP verification before account creation |
| **SignInScreen** | "WELCOME BACK" heading, mobile number only (no email) |
| **ForgotPasswordScreen** | 4-step: mobile → security question → OTP → new password |

#### 🔐 Auth Changes

- **Email removed** from signup and login — mobile number is the sole identifier
- **Date of Birth** added to signup form and profile display
- **Confirm Password** field added to signup
- **OTP before signup** via 2Factor.in SMS — account only created after OTP verified
- **Token system** switched from email-based to mobile-based JWT
- **Forgot password** now requires security question answer before sending OTP

#### 📲 New Endpoints (Backend)

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/send-signup-otp` | Send OTP to mobile before account creation |
| POST | `/api/auth/verify-security-question` | Verify security answer, then send OTP |

#### 🎬 Video Overlays

| Trigger | Video |
|---|---|
| Successful signup (OTP verified) | `right-mark.mp4` → `welcome-hand.mp4` → Home |
| Wrong OTP | `x-mark.mp4` → back to signup |
| After AR upload completes | `disc-loading.mp4` → `wings-to-memories.mp4` → AR view |

#### 🏠 Home Page

- Dark teal background matching reference
- Right-side nav bar with real SVG icons (Home, Scan, Upload, Profile, Settings)
- Gold border on nav panel (`#C9A84C`)
- Social media links: Instagram, Facebook, YouTube, Twitter
- **Chat with us** → opens WhatsApp with `+91 8660418820`
- Sign Out button

#### 👤 Profile Page

- Hexagonal avatar with user initials
- Displays: Name (caps), DOB as `DD | MM | YYYY`, mobile, security question
- EDIT and DONE buttons

#### 🖼️ Gallery

- Shows all uploaded AR targets
- Click image/video → fullscreen playback
- Delete button removes all targets

#### ⬆️ Upload Progress Fix

- Progress no longer stuck at 100% while backend finalizes
- New `finalizing` state shows "Preparing AR experience…" while `loadTargets()` runs after upload

#### 🔧 SMS OTP Provider

- Replaced Twilio with **2Factor.in**
- Env var: `TWOFACTOR_API_KEY`
- Free tier uses voice call OTP (SMS requires DLT registration in India)

#### 📁 New Files

| File | Purpose |
|---|---|
| `webar-app/public/splash.jpg` | Splash screen logo image |
| `webar-app/public/right-mark.mp4` | Success OTP animation |
| `webar-app/public/x-mark.mp4` | Failed OTP animation |
| `webar-app/public/welcome-hand.mp4` | Post-activation welcome animation |
| `webar-app/public/disc-loading.mp4` | Post-upload loading animation |
| `webar-app/public/wings-to-memories.mp4` | Pre-AR transition animation |
| `webar-app/src/components/HelloScreen.jsx` | New hello/landing screen |
| `webar-app/src/components/HomeScreen.jsx` | New home with nav + about us |
| `webar-app/src/components/ProfileScreen.jsx` | User profile page |
| `webar-app/src/components/GalleryScreen.jsx` | Uploaded targets gallery |
| `webar-app/src/components/VideoOverlay.jsx` | Full-screen video overlay component |
| `webar-app/src/components/DiscLoadingOverlay.jsx` | Disc + wings video sequence |

#### ⚙️ New Environment Variables

| Key | Description |
|---|---|
| `TWOFACTOR_API_KEY` | 2Factor.in API key for SMS OTP |

#### 🌐 Netlify — Required Environment Variable

Must be set in **Netlify → Site settings → Environment variables**:
```
VITE_API_BASE=https://webar-project-8jbi.onrender.com
```
Without this, the deployed frontend calls `http://localhost:8181` and fails on mobile.

---

### Session 4 — Cloud Storage (Neon PostgreSQL + Cloudflare R2)

#### 🗄️ Database — Neon PostgreSQL (replaces in-memory store)

**Problem:** All registered users were wiped every time Render restarted the backend (free tier sleeps after 15 min inactivity).

**Fix:** Replaced Go in-memory maps with Neon PostgreSQL.

**Schema (auto-created on first run):**
```sql
users (id, email, mobile, first_name, last_name, password_hash, security_question, security_answer, created_at)
ar_targets (id, user_id→users, target_index, label, plane_width, plane_height, plane_offset_y, image_key, video_key, mind_key, created_at)
```

**Connection:** `DATABASE_URL` env var (Neon connection string with `?sslmode=require`)

**Driver:** `github.com/jackc/pgx/v5` (pgxpool for concurrent requests)

#### ☁️ File Storage — Cloudflare R2 (replaces browser IndexedDB)

**Problem:** AR assets (marker images, videos, .mind files) stored in browser IndexedDB — lost on cache clear, not accessible from other devices, and IndexedDB has size limits.

**Fix:** Upload all assets to Cloudflare R2 (S3-compatible, zero egress fees).

**File organisation in R2:**
```
users/{userID}/images/target-{i}-{timestamp}.jpg
users/{userID}/videos/target-{i}-{timestamp}.mp4
users/{userID}/mind/targets-{timestamp}.mind
```

**Upload strategy:**
- **Images + .mind** → single presigned PUT (small files, 15-min URL expiry)
- **Videos** → S3 multipart upload in **10 MB chunks** (handles any size HD video up to 5 TB)
  - Chunks upload directly from browser to R2 via presigned part URLs
  - Backend never proxies video bytes — no memory pressure on server
  - Per-video progress tracked and shown in the upload overlay

#### 🆕 New Backend Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/me` | Bearer | Returns authenticated user's profile incl. numeric `id` |
| POST | `/api/upload/presign` | Bearer | Get presigned PUT URL for image or .mind file |
| POST | `/api/upload/multipart/init` | Bearer | Start multipart upload, returns `uploadId` |
| POST | `/api/upload/multipart/part-url` | Bearer | Get presigned URL for one chunk |
| POST | `/api/upload/multipart/complete` | Bearer | Assemble all parts on R2 |
| POST | `/api/upload/multipart/abort` | Bearer | Cancel incomplete multipart upload |
| POST | `/api/targets/save` | Bearer | Upsert target metadata + keys to DB |
| GET | `/api/targets` | Bearer | Fetch user's targets with public R2 URLs |
| DELETE | `/api/targets/delete` | Bearer | Clear all user's targets from DB |

**Key scoping:** All upload endpoints enforce `users/{userID}/` prefix on R2 keys so users can't overwrite each other.

#### 🔧 Frontend Changes

- **`src/config/api.js`** — Central `API_BASE` (reads `VITE_API_BASE` env var, defaults to `http://localhost:8181`). All three auth screens now import from here instead of hardcoded URLs.
- **`src/hooks/useArStorage.js`** — Complete rewrite: IndexedDB replaced with cloud API calls. Same exported function signatures (`saveTargets`, `loadTargets`, `clearTargets`, `hasStoredTargets`) so the rest of the app needed minimal changes.
- **`SetupScreen.jsx`** — New `onLaunchSaved` prop: when the user has previously uploaded targets, a **"Launch AR with saved files →"** button appears so they can go straight to AR without re-compiling.
- **`App.jsx`** — After loading cloud targets, stores them in `cloudTargets`/`cloudMindFileUrl` state. `handleLaunchSaved` passes these directly to the AR view.
- **`UploadProgressOverlay.jsx`** — Added `'uploading'` state with label "Uploading to cloud…". Compile progress (0→100%) is followed by upload progress (0→100%).

#### 📁 New Files

| File | Purpose |
|---|---|
| `backend/.env` | Local env vars (gitignored) |
| `backend/.env.example` | Template with all required env var names + comments |
| `webar-app/.env.local.example` | Frontend env template (`VITE_API_BASE`) |
| `webar-app/src/config/api.js` | Central API base URL config |

#### ⚙️ New Go Dependencies (run `go mod tidy` after cloning)
```bash
cd backend
go get github.com/jackc/pgx/v5@latest
go get github.com/aws/aws-sdk-go-v2/config@latest
go get github.com/aws/aws-sdk-go-v2/credentials@latest
go get github.com/aws/aws-sdk-go-v2/service/s3@latest
go mod tidy
```

#### 🔑 New Environment Variables

**Backend (`backend/.env`):**
| Key | Description |
|---|---|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | R2 API token access key |
| `R2_SECRET_ACCESS_KEY` | R2 API token secret key |
| `R2_BUCKET_NAME` | R2 bucket name (e.g. `memoera-assets`) |
| `R2_PUBLIC_URL` | Public bucket URL (e.g. `https://pub-xxx.r2.dev`) |

**Frontend (`webar-app/.env.local`):**
| Key | Description |
|---|---|
| `VITE_API_BASE` | Backend URL (default: `http://localhost:8181`) |

#### ☁️ R2 CORS Configuration (required for browser uploads)
In Cloudflare dashboard → R2 → your bucket → Settings → CORS:
```json
[{
  "AllowedOrigins": ["http://localhost:5173", "https://web-ar-suhas.netlify.app", "https://memoera.in"],
  "AllowedMethods": ["PUT", "GET"],
  "AllowedHeaders": ["*"],
  "ExposeHeaders": ["ETag"]
}]
```
> The `ETag` header must be exposed — it is required to complete the multipart upload.

#### 📋 Status
- ✅ Neon PostgreSQL — connected (`DATABASE_URL` set in `backend/.env`)
- ⏳ Cloudflare R2 — pending (card required, will set up tomorrow)

---

### Session 3 — Production AR Fix

#### 🐛 AR Error on memoera.in (production) — Root Cause & Fix

**Problem:** AR worked fine locally but showed "Failed to load MindAR" on the deployed Netlify site.

**Two root causes identified:**

1. **Import map stripped by Vite build**
   - Vite removes `<script type="importmap">` from `index.html` during production build
   - MindAR's CDN bundle uses bare `"three"` specifier — without the import map it can't resolve it in production
   - Locally, Vite dev server handles bare specifiers automatically so it worked fine
   - **Fix:** Added `injectImportMap()` custom Vite plugin in `vite.config.js` that re-injects the import map into `dist/index.html` after build

2. **COEP header blocking CDN chunk files**
   - `netlify.toml` had `Cross-Origin-Embedder-Policy: require-corp` and `Cross-Origin-Opener-Policy: same-origin`
   - These headers require every cross-origin resource to have `Cross-Origin-Resource-Policy: cross-origin`
   - MindAR's relative chunk files (`./controller-xxx.js`, `./ui-xxx.js`) were being blocked
   - MindAR 1.2.5 does **not** use SharedArrayBuffer so these headers were never needed
   - **Fix:** Removed both COEP and COOP headers from `netlify.toml`

**Files changed:**
- `webar-app/vite.config.js` — added `injectImportMap()` plugin
- `webar-app/netlify.toml` — removed COEP/COOP headers

---

### Session 2

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
