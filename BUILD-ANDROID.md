# Build Memoera Android APK

## Prerequisites (install once)

| Tool | Download |
|------|----------|
| Android Studio | https://developer.android.com/studio |
| JDK 17+ | Bundled with Android Studio |
| Node.js 18+ | https://nodejs.org |

---

## Step 1 — Build the web app

Open a terminal in the `webar-app/` folder:

```bash
cd webar-app
npm install          # first time only
npm run build        # creates the dist/ folder
```

---

## Step 2 — Sync web assets to Android

```bash
npx cap sync android
```

This copies `dist/` into the Android project at `android/app/src/main/assets/public/`.

---

## Step 3 — Open in Android Studio

```bash
npx cap open android
```

This launches Android Studio with the `android/` project.

---

## Step 4 — Build the APK in Android Studio

1. Wait for Gradle sync to finish (bottom status bar).
2. Menu → **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
3. When done, click **Locate** in the notification.
4. APK is saved at:
   ```
   android/app/build/outputs/apk/debug/app-debug.apk
   ```

---

## Step 5 — Install on Redmi Note

**Option A — USB cable (recommended)**

1. On the Redmi: Settings → Developer options → Enable USB debugging.
2. Connect via USB. In Android Studio, select your device from the toolbar.
3. Click the green ▶ Run button — it builds and installs directly.

**Option B — Transfer APK manually**

1. Copy `app-debug.apk` to the phone via USB / Google Drive / WhatsApp.
2. On the Redmi: Settings → Privacy → Install unknown apps → allow your file manager.
3. Tap the APK file and install.

---

## Release APK (for Play Store / distribution)

1. **Build → Generate Signed Bundle / APK → APK**
2. Create a new keystore (keep the `.jks` file safe forever).
3. Choose **release** build variant.
4. The signed APK will be in `android/app/build/outputs/apk/release/`.

---

## Re-deploy after code changes

```bash
# In webar-app/
npm run android:build   # = npm run build + npx cap sync android
# Then rebuild in Android Studio or run: npx cap run android
```

---

## Permissions already configured

The `AndroidManifest.xml` has:
- `INTERNET` — API calls, CDN assets
- `CAMERA` — AR scanning
- `READ_EXTERNAL_STORAGE` / `WRITE_EXTERNAL_STORAGE` — gallery access
- `VIBRATE` — haptic feedback on scan

---

## Razorpay key (for payments)

Before release, replace the placeholder key in `SettingsScreen.jsx`:

```js
key: 'rzp_test_REPLACE_WITH_YOUR_KEY'
// → your actual Razorpay key from https://dashboard.razorpay.com
```

Use `rzp_test_...` for testing and `rzp_live_...` for production.
