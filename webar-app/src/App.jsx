import { useState, useCallback, useEffect, useRef, Suspense, lazy } from 'react';
import { COMPILER_URL } from './hooks/loadMindARCompiler.js';
import { deferUntilIdleAfterLoad } from './utils/deferIdle.js';
import { API_BASE } from './config/api.js';

// Maps each view to the view that "Back" should navigate to
const BACK_MAP = {
  'signin':      'hello',
  'signup':      'hello',
  'forgot':      'signin',
  'welcome':     'home',
  'profile':     'settings',
  'settings':    'home',
  'gallery':     'home',
  'collection':  'gallery',
  'liked':       'home',
  'premium':     'home',
  'refer':       'home',
  'streak':      'home',
  'image-upload': 'home',
  'setup':       'image-upload',
  'url-setup':   'image-upload',
  'model-setup': 'image-upload',
  'anim-setup':  'home',
  'doc-setup':   'image-upload',
  'admin':       'home',
  'nfc':          'home',
  'nfc-write':    'nfc',
  'nfc-read':     'nfc',
  'nfc-clear':    'nfc',
  'nfc-history':  'nfc',
  'catalog-setup': 'home',
  'seller-dashboard': 'home',
  // Onboarding (account type → category → details → complete) now has an
  // on-screen Back button on every step, mirroring these same targets — kept
  // in sync so the hardware back button / edge-swipe gesture behaves the
  // same way instead of falling through to the isAuthenticated-fallback of
  // 'home' (the bug that used to bounce users out of setup entirely).
  // account-type is the exception: its on-screen Back intentionally signs the
  // user out (there's nowhere earlier to return to), which is too destructive
  // to risk on an accidental gesture/hardware-back press, so that one is a
  // self-mapping no-op instead.
  'account-type':        'account-type',
  'account-confirm':     'account-type',
  'business-category':   'account-confirm',
  'business-details':    'business-category',
  'business-complete':   'business-details',
  'individual-complete': 'account-confirm',
};

// Critical-path screens — needed for the very first paint, kept in the main bundle
import SplashScreen   from './components/SplashScreen.jsx';
import HomeScreen     from './components/HomeScreen.jsx';
import VideoOverlay      from './components/VideoOverlay.jsx';
import GuestScanScreen, { invalidateGuestCache } from './components/GuestScanScreen.jsx';
import PublicArView       from './components/PublicArView.jsx';
import CameraPermissionPrimer from './components/CameraPermissionPrimer.jsx';
import TermsGateModal from './components/TermsGateModal.jsx';

// Everything below is only needed after navigation — lazy-load so the
// initial bundle (and time-to-interactive) stays small.
const ARScannerScreen          = lazy(() => import('./components/ARScannerScreen.jsx'));
const Model3DSetupScreen       = lazy(() => import('./components/Model3DSetupScreen.jsx'));
const DocumentSetupScreen      = lazy(() => import('./components/DocumentSetupScreen.jsx'));
const PhotoAnimationSetupScreen = lazy(() => import('./components/PhotoAnimationSetupScreen.jsx'));
const CollectionScreen         = lazy(() => import('./components/CollectionScreen.jsx'));
const LikedSavedScreen         = lazy(() => import('./components/LikedSavedScreen.jsx'));
const NfcDashboardScreen       = lazy(() => import('./components/NfcDashboardScreen.jsx'));
const NfcWriteMenuScreen       = lazy(() => import('./components/NfcWriteMenuScreen.jsx'));
const NfcReadScreen            = lazy(() => import('./components/NfcReadScreen.jsx'));
const NfcClearScreen           = lazy(() => import('./components/NfcClearScreen.jsx'));
const NfcHistoryScreen         = lazy(() => import('./components/NfcHistoryScreen.jsx'));
const CatalogSetupScreen       = lazy(() => import('./components/CatalogSetupScreen.jsx'));
const SellerDashboardScreen    = lazy(() => import('./components/SellerDashboardScreen.jsx'));
const SetupScreen              = lazy(() => import('./components/SetupScreen.jsx'));
const SignInScreen             = lazy(() => import('./components/SignInScreen.jsx'));
const SignUpScreen             = lazy(() => import('./components/SignUpScreen.jsx'));
const WelcomeScreen            = lazy(() => import('./components/WelcomeScreen.jsx'));
const ForgotPasswordScreen     = lazy(() => import('./components/ForgotPasswordScreen.jsx'));
const HelloScreen              = lazy(() => import('./components/HelloScreen.jsx'));
const ProfileScreen            = lazy(() => import('./components/ProfileScreen.jsx'));
const GalleryScreen            = lazy(() => import('./components/GalleryScreen.jsx'));
const SettingsScreen           = lazy(() => import('./components/SettingsScreen.jsx'));
const AccountTypeScreen        = lazy(() => import('./components/AccountTypeScreen.jsx'));
const AccountConfirmScreen     = lazy(() => import('./components/AccountConfirmScreen.jsx'));
const BusinessCategoryScreen   = lazy(() => import('./components/BusinessCategoryScreen.jsx'));
const BusinessDetailsScreen    = lazy(() => import('./components/BusinessDetailsScreen.jsx'));
const BusinessDeniedScreen     = lazy(() => import('./components/BusinessDeniedScreen.jsx'));
const SetupCompleteScreen      = lazy(() => import('./components/SetupCompleteScreen.jsx'));
const ImageUploadScreen        = lazy(() => import('./components/ImageUploadScreen.jsx'));
const GoalSelectScreen         = lazy(() => import('./components/GoalSelectScreen.jsx'));
const UrlSetupScreen           = lazy(() => import('./components/UrlSetupScreen.jsx'));
const PremiumScreen            = lazy(() => import('./components/PremiumScreen.jsx'));
const ReferFriendScreen        = lazy(() => import('./components/ReferFriendScreen.jsx'));
const StreakScreen             = lazy(() => import('./components/StreakScreen.jsx'));
const ChatBotWidget            = lazy(() => import('./components/ChatBotWidget.jsx'));
const AdminScreen              = lazy(() => import('./components/AdminScreen.jsx'));

import { loadTargets, loadPublicTargets } from './hooks/useArStorage.js';
import { pingStreak } from './utils/streak.js';
import { initAdMob } from './services/AdMobService.js';
import { startCameraWarm, stopWarmStream } from './hooks/cameraWarmup.js';
import { startBackgroundPublicCompile } from './hooks/backgroundCompilePublic.js';

export default function App() {
  // Public AR view — intercept ?ar= before any auth check
  const arToken = new URLSearchParams(window.location.search).get('ar');
  if (arToken) return <PublicArView token={arToken} />;

  const hasToken = !!localStorage.getItem('memoera_token');

  const [appView, setAppView] = useState(() => hasToken ? 'home' : 'splash');
  const [currentUser, setCurrentUser] = useState(() => {
    try { const s = localStorage.getItem('memoera_user'); return s ? JSON.parse(s) : null; }
    catch { return null; }
  });

  // AR state
  const [targets,       setTargets]       = useState(null);
  const [mindFileUrl,   setMindFileUrl]   = useState(null);
  const [guestScanLoading, setGuestScanLoading] = useState(false);
  const [scanHint,      setScanHint]      = useState(false);
  const [pendingAR,     setPendingAR]     = useState(null);
  const [guestScanError, setGuestScanError] = useState('');
  // Terms & Conditions gate — 'scan' before the camera opens, 'signup' before
  // the signup form (and therefore before any account is created — declining
  // here must never leave a live, unconsented account behind). Agreement is
  // persisted so a user only has to accept once, ever, on this device — not
  // on every scan/signup.
  const [pendingTermsGate, setPendingTermsGate] = useState(null);
  const termsAgreedRef           = useRef(localStorage.getItem('memoera_terms_agreed') === 'true');
  const pendingARRef             = useRef(null);
  const activeBlobUrlsRef        = useRef([]);
  // Tracks which screen a scan was launched from ('home' or 'hello') so the
  // AR viewer's back button returns there instead of always landing on 'hello'.
  const scanOriginRef            = useRef('home');
  const prefetchedPublicTargetsRef = useRef(null);
  // True while the business-category/details screens are being reused for an
  // existing user switching account type from Profile, rather than the
  // first-time signup flow — changes what happens on completion (straight
  // back to Profile, no "welcome" fanfare/dashboard screen).
  const switchingAccountTypeRef  = useRef(false);

  const [cloudTargets,       setCloudTargets]       = useState(null);
  const appViewRef = useRef(appView);
  useEffect(() => { appViewRef.current = appView; }, [appView]);
  const [videoOverlay,       setVideoOverlay]       = useState(null);
  const [selectedVisibility, setSelectedVisibility] = useState('private');
  const [forcedContentType, setForcedContentType] = useState(null);
  const [sharedImageFile, setSharedImageFile] = useState(null);
  const [sharedImagePreviewUrl, setSharedImagePreviewUrl] = useState(null);
  const [sharedLabel, setSharedLabel] = useState('');
  const [pendingAccountType, setPendingAccountType] = useState(null);
  const [businessCategoryChoice, setBusinessCategoryChoice] = useState('');
  const [settingsInitialSection, setSettingsInitialSection] = useState(null);
  const [galleryQuery, setGalleryQuery] = useState('');

  // Pull-to-refresh (global — all views except AR scanners)
  const ptrStartY   = useRef(-1);
  const ptrDistRef  = useRef(0);
  const [ptrDist,       setPtrDist]       = useState(0);
  const [ptrRefreshing, setPtrRefreshing] = useState(false);
  const PTR_THRESHOLD = 80;
  const PTR_EXCLUDED  = ['ar', 'home']; // home has its own

  // Initialise AdMob SDK as early as possible
  useEffect(() => { initAdMob(); }, []);

  // Preload video overlay assets (~510 KB) once the page has finished loading.
  // See deferUntilIdleAfterLoad — a bare requestIdleCallback fired early enough
  // that these four videos were downloading before first contentful paint.
  useEffect(() => deferUntilIdleAfterLoad(() => {
    const VIDEOS = ['/right-mark.mp4', '/x-mark.mp4', '/wings-to-memories.mp4', '/welcome-hand.mp4'];
    VIDEOS.forEach((src) => {
      const v = document.createElement('video');
      v.src = src; v.preload = 'auto'; v.muted = true; v.load();
    });
  }), []);

  // Warm the AR libraries (~6 MB across MindAR, A-Frame and Three.js) so that
  // tapping Scan opens the camera instantly instead of stalling on a multi-MB
  // fetch.
  //
  // This MUST stay off the critical path. Previously it ran the moment Home
  // mounted and fetched each A-Frame/MindAR file twice — once via
  // <link rel=prefetch> and again via fetch() as a "belt and suspenders"
  // fallback — so ~7.7 MB competed with the app's own bundle and first API
  // calls. Measured on a simulated 4G phone that pushed first contentful paint
  // to 8.4s and made every screen feel slow to open. Now it waits for the
  // browser to go idle, issues exactly one request per file, and skips
  // entirely when the user is on a metered or slow connection.
  useEffect(() => {
    if (appView !== 'hello' && appView !== 'home') return;
    if (window.__arLibsPreloaded) return;

    // Respect Data Saver and slow links — a 6 MB speculative download is far
    // more harmful than a slower first scan for these users.
    const conn = navigator.connection;
    if (conn?.saveData || /(^|-)(2g|slow-2g)$/.test(conn?.effectiveType || '')) return;

    let cancelled = false;
    const warm = () => {
      if (cancelled || window.__arLibsPreloaded) return;
      window.__arLibsPreloaded = true;

      // 1. Compiler — used during the "Setting up…" phase.
      if (!window.MINDAR?.IMAGE?.Compiler) {
        import(/* @vite-ignore */ COMPILER_URL).catch(() => {});
      }

      // NOTE: the MindAR *Three.js* tracker (mindar-image-three.prod.js) used to
      // be preloaded here too. It is only consumed by useMindAR.js via
      // ARScene.jsx — and ARScene is not rendered anywhere; scanning goes
      // through the A-Frame build inside the /ar-scanner.html iframe instead.
      // Preloading it pulled its own copy of controller-*.js and three.module.js
      // from jsdelivr on every app open (~630 KB) for a code path that never
      // runs, and duplicated the controller chunk we already serve from /libs.

      // 2. A-Frame + MindAR's AR runtime — what the /ar-scanner.html iframe
      //    actually loads. One low-priority fetch each, straight into the HTTP
      //    cache. ar-scanner.html is no-cache but still revalidates with a fast
      //    304, so warming it moves that round-trip off the scan path.
      ['/libs/aframe.min.js', '/libs/mindar-image-aframe.prod.js', '/ar-scanner.html'].forEach((href) => {
        fetch(href, { mode: 'no-cors', cache: 'force-cache', priority: 'low' }).catch(() => {});
      });
    };

    const cancel = deferUntilIdleAfterLoad(warm);
    return () => { cancelled = true; cancel(); };
  }, [appView]);

  // Pre-warm camera as early as possible — even on splash so it's ready by hello's guest scan
  useEffect(() => {
    if (['splash', 'hello'].includes(appView)) {
      startCameraWarm();
      return;
    }
    stopWarmStream();
  }, [appView]);

  // Prefetch public targets + pre-warm the guest scan's .mind file as early as
  // possible — including during the splash screen, not just once hello/home is
  // reached — so tapping "Tap to Scan" opens instantly with zero wait instead
  // of downloading/compiling at that point. This also fires the first request
  // to the backend (which sleeps after ~15 min idle on its free hosting tier
  // and cold-starts in 30-60s+) as early as possible, since the splash screen
  // alone was costing ~4s of wasted head-start against that cold start.
  useEffect(() => {
    loadPublicTargets().then((t) => {
      prefetchedPublicTargetsRef.current = t;
      startBackgroundPublicCompile(t);
    }).catch(() => {});
  }, []);

  // Bounce to 'hello' if the session token is gone while on 'home'
  useEffect(() => {
    if (appView === 'home' && !localStorage.getItem('memoera_token')) setAppView('hello');
  }, [appView]);

  // If a scan (guest or signed-in) takes a moment to compile — first-time
  // guest scans, or a slow/re-requested camera permission on Home — show an
  // interactive popup after a short delay so the wait reads as normal
  // progress instead of the site looking frozen, and gives the user a way
  // to back out instead of just staring at a stuck screen.
  useEffect(() => {
    if (!guestScanLoading) { setScanHint(false); return; }
    const t = setTimeout(() => setScanHint(true), 1200);
    return () => { clearTimeout(t); setScanHint(false); };
  }, [guestScanLoading]);

  // Push history entry so Android back button navigates within the app
  useEffect(() => {
    window.history.pushState({ view: appView }, '');
  }, [appView]);

  useEffect(() => {
    const handlePop = () => {
      const isAuthenticated = !!localStorage.getItem('memoera_token');
      const current  = appViewRef.current;
      const fallback = isAuthenticated ? 'home' : 'hello';
      // These two screens are reused for an existing user switching account
      // type from Profile (not just first-time signup) — the hardware back
      // button should return to Profile in that case, not the signup step.
      const switchBackTarget = switchingAccountTypeRef.current &&
        (current === 'business-category' || current === 'business-details') ? 'profile' : null;
      if (switchBackTarget) switchingAccountTypeRef.current = false;
      const target = switchBackTarget ?? BACK_MAP[current] ?? fallback;
      setVideoOverlay(null);
      pendingARRef.current = null;
      // Pre-warm camera immediately so HelloScreen gets it instantly on return
      if (target === 'hello' || target === 'home') startCameraWarm();
      setAppView(target);
      window.history.pushState({ view: target }, '');
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  useEffect(() => {
    if (!hasToken) return;
    loadTargets().then(({ targets: t, hasData }) => {
      if (!hasData) return;
      setCloudTargets(t);
    }).catch(() => {});
    return () => {
      activeBlobUrlsRef.current.forEach((u) => { try { URL.revokeObjectURL(u); } catch (_) {} });
    };
  }, []);

  // Global pull-to-refresh — active on all views except AR scanners
  useEffect(() => {
    const onStart = (e) => {
      if (PTR_EXCLUDED.includes(appViewRef.current)) return;
      if (e.touches[0].clientY > 100) return; // only trigger from top 100 px
      ptrStartY.current = e.touches[0].clientY;
    };
    const onMove = (e) => {
      if (ptrStartY.current < 0) return;
      const raw = e.touches[0].clientY - ptrStartY.current;
      if (raw > 0) {
        const d = Math.min(raw * 0.45, PTR_THRESHOLD + 24);
        ptrDistRef.current = d;
        setPtrDist(d);
      } else {
        ptrStartY.current = -1;
        ptrDistRef.current = 0;
        setPtrDist(0);
      }
    };
    const onEnd = () => {
      if (ptrDistRef.current >= PTR_THRESHOLD) {
        setPtrRefreshing(true);
        setTimeout(() => window.location.reload(), 700);
      } else {
        setPtrDist(0);
      }
      ptrStartY.current = -1;
      ptrDistRef.current = 0;
    };
    document.addEventListener('touchstart', onStart,  { passive: true });
    document.addEventListener('touchmove',  onMove,   { passive: true });
    document.addEventListener('touchend',   onEnd,    { passive: true });
    document.addEventListener('touchcancel',onEnd,    { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove',  onMove);
      document.removeEventListener('touchend',   onEnd);
      document.removeEventListener('touchcancel',onEnd);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Callbacks ─────────────────────────────────────────────────────────────

  const launchAR = useCallback(({ targets: t, mindFileUrl: m }) => {
    // Don't revoke the new URL itself — it may appear in the previous list if it was freshly recreated
    activeBlobUrlsRef.current.forEach((u) => { if (u !== m) try { URL.revokeObjectURL(u); } catch (_) {} });
    activeBlobUrlsRef.current = [m, ...t.map((x) => x.videoUrl).filter(Boolean)].filter(Boolean);

    setTargets(t); setMindFileUrl(m);
    setAppView('ar');
    pingStreak();
  }, []);

  // Silently register the user in the festival backend so they receive future greeting blasts
  const registerUserForGreetings = useCallback((user) => {
    const backendUrl = import.meta.env.VITE_BACKEND_URL;
    if (!backendUrl || !user?.email) return;
    fetch(`${backendUrl}/api/users/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id:   user.email,
        user_name: user.name || user.username || user.email.split('@')[0],
        email:     user.email,
      }),
    }).catch(() => { /* non-critical — fail silently */ });
  }, []);

  // Best-effort server-side save of onboarding progress (account type chosen /
  // onboarding finished). Previously this only lived in localStorage, which is
  // wiped by sign-out — so a user who backed out of account-type selection
  // (Back there intentionally signs out, since there's no earlier step to
  // return to) and later signed back in had no record of being mid-onboarding,
  // and nextViewAfterAuth below would fall through to 'home' instead of
  // resuming account-type selection. Persisting to the backend fixes that.
  const persistOnboarding = useCallback((fields) => {
    const token = localStorage.getItem('memoera_token');
    if (!token) return;
    fetch(`${API_BASE}/api/auth/onboarding`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(fields),
    }).catch(() => { /* best-effort — local state already updated */ });
  }, []);

  // First-time post-signup onboarding: business accounts pick a category and
  // fill in business details before landing on the shared "all set" screen;
  // individual accounts go straight to that screen. Returning users who
  // already finished this (onboardingComplete) skip straight to home. Users
  // who signed up but never chose Business/Individual (backed out early)
  // resume exactly at that step instead of skipping ahead.
  const nextViewAfterAuth = useCallback((user) => {
    if (user?.onboardingComplete) return 'home';
    if (user?.accountType === 'business') return 'business-category';
    if (user?.accountType === 'individual') return 'individual-complete';
    return 'account-type';
  }, []);

  const handleSignIn  = useCallback((user) => {
    setCurrentUser(user);
    registerUserForGreetings(user);
    setAppView(nextViewAfterAuth(user));
  }, [registerUserForGreetings, nextViewAfterAuth]);
  const handleSignUp  = useCallback((user) => {
    // Terms are now gated BEFORE the account is created (see
    // handleCreateAccountTapped) — by the time signup succeeds here the
    // user has already agreed, so this just continues onboarding.
    setCurrentUser(user);
    registerUserForGreetings(user);
    setAppView('account-type');
  }, [registerUserForGreetings]);
  const handleOtpFail = useCallback(() => { setVideoOverlay({ src: '/x-mark.mp4', next: 'signup' }); }, []);

  // Gates entry to the signup form itself on agreeing to Terms & Conditions —
  // previously the account was fully created (token stored, signed in)
  // before the user ever saw the T&C prompt, and declining just stranded
  // them with a live, unconsented account. Now nothing is created until
  // they've agreed. Unlike the 'scan' gate (which only asks once ever per
  // device, via termsAgreedRef), signup always shows this prompt — every
  // new account creation is its own consent event, regardless of whether
  // this device saw it before for a different signup or for scanning.
  const handleCreateAccountTapped = useCallback(() => {
    setPendingTermsGate('signup');
  }, []);

  const handleAccountType = useCallback((accountType) => {
    setPendingAccountType(accountType);
    setAppView('account-confirm');
  }, []);

  // The user's mobile is already verified by OTP during signup — no need for
  // a second activation code/OTP step here, so Continue finalizes the
  // account type directly.
  const handleAccountConfirm = useCallback(() => {
    // Guard against continuing with no account type chosen (e.g. reached via
    // a back/forward glitch) — AccountConfirmScreen already shows a "please
    // choose" message in this case, but never let Continue silently save an
    // undefined accountType.
    if (pendingAccountType !== 'business' && pendingAccountType !== 'individual') {
      setAppView('account-type');
      return;
    }
    setCurrentUser((prev) => {
      const updated = { ...prev, accountType: pendingAccountType };
      localStorage.setItem('memoera_user', JSON.stringify(updated));
      return updated;
    });
    persistOnboarding({ accountType: pendingAccountType, onboardingComplete: false });
    setVideoOverlay({ src: '/right-mark.mp4', next: 'welcome-hand' });
  }, [pendingAccountType, persistOnboarding]);

  const handleBusinessCategory = useCallback((category) => {
    setBusinessCategoryChoice(category);
    setAppView('business-details');
  }, []);

  const handleBusinessDetails = useCallback((details) => {
    const isDenied = details?.gstin?.trim().toLowerCase() === 'deny';
    setCurrentUser((prev) => {
      const updated = { ...prev, business: { category: businessCategoryChoice, ...details },
        ...(switchingAccountTypeRef.current && !isDenied ? { accountType: 'business' } : {}) };
      localStorage.setItem('memoera_user', JSON.stringify(updated));
      return updated;
    });
    // Persist so anyone scanning this business's AR content later can see
    // how to reach them (via the scanner's "Buy Now" business-details card) —
    // previously this only ever lived in localStorage on the owner's device.
    if (!isDenied) {
      const token = localStorage.getItem('memoera_token');
      if (token) {
        fetch(`${API_BASE}/api/business/details`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(details),
        }).catch(() => {});
      }
    }
    if (switchingAccountTypeRef.current) {
      if (!isDenied) {
        persistOnboarding({ accountType: 'business', onboardingComplete: true });
        switchingAccountTypeRef.current = false;
      }
      setAppView(isDenied ? 'business-denied' : 'profile');
      return;
    }
    setAppView(isDenied ? 'business-denied' : 'business-complete');
  }, [businessCategoryChoice, persistOnboarding]);

  // Lets an existing Individual account apply to switch to Business from
  // Profile — reuses the same category/details screens as first-time signup,
  // but switchingAccountTypeRef makes handleBusinessDetails land back on
  // Profile directly instead of the signup "all set" dashboard screen.
  const handleSwitchToBusiness = useCallback(() => {
    switchingAccountTypeRef.current = true;
    setBusinessCategoryChoice(null);
    setAppView('business-category');
  }, []);

  const finishOnboarding = useCallback(() => {
    setCurrentUser((prev) => {
      const updated = { ...prev, onboardingComplete: true };
      localStorage.setItem('memoera_user', JSON.stringify(updated));
      persistOnboarding({ accountType: updated.accountType || '', onboardingComplete: true });
      return updated;
    });
  }, [persistOnboarding]);

  const handleGoToDashboard = useCallback(() => {
    finishOnboarding();
    setAppView('home');
  }, [finishOnboarding]);

  const handleCreateFirstMemory = useCallback(() => {
    finishOnboarding();
    setAppView('goal-select');
  }, [finishOnboarding]);

  const handleVideoOverlayDone = useCallback(() => {
    setVideoOverlay((v) => {
      if (!v) return null;
      if (v.next === 'welcome-hand') return { src: '/welcome-hand.mp4', next: 'home' };
      if (v.next === 'home') {
        const target = nextViewAfterAuth(currentUser);
        setTimeout(() => setAppView(target), 0);
        return null;
      }
      if (v.next === 'signup')   { setTimeout(() => setAppView('signup'),  0); return null; }
      if (v.next === 'gallery')  { setTimeout(() => setAppView('gallery'), 0); return null; }
      if (v.next === 'ar-ready') {
        const ar = pendingARRef.current;
        pendingARRef.current = null;
        setPendingAR(null);
        if (ar) setTimeout(() => launchAR(ar), 0);
        return null;
      }
      return null;
    });
  }, [launchAR, currentUser, nextViewAfterAuth]);

  // After upload: bust caches + play video + launch AR
  const handleStart = useCallback(({ targets: t, mindFileUrl: m }) => {
    scanOriginRef.current = 'home'; // uploads only happen signed-in — always return to Home
    invalidateGuestCache();
    pendingARRef.current = { targets: t, mindFileUrl: m };
    setPendingAR({ targets: t, mindFileUrl: m });
    setVideoOverlay({ src: '/wings-to-memories.mp4', next: 'ar-ready' });
  }, []);

  const handleSignOut = useCallback(() => {
    localStorage.removeItem('memoera_token');
    localStorage.removeItem('memoera_user');
    setCurrentUser(null); setTargets(null); setMindFileUrl(null);
    setCloudTargets(null);
    setAppView('hello');
  }, []);

  // Instant "Tap to Scan" (public targets) — used by both the pre-login Hello
  // screen and the signed-in Home screen's identical scan button.
  const handleGuestReady = useCallback(({ targets: t, mindFileUrl: m }) => {
    launchAR({ targets: t, mindFileUrl: m });
  }, [launchAR]);

  const triggerScan = useCallback((origin) => {
    if (!termsAgreedRef.current) {
      scanOriginRef.current = origin;
      setPendingTermsGate('scan');
      return;
    }
    scanOriginRef.current = origin;
    setGuestScanError('');
    setGuestScanLoading(true);
  }, []);

  const handleTermsAgree = useCallback(() => {
    termsAgreedRef.current = true;
    localStorage.setItem('memoera_terms_agreed', 'true');
    const gate = pendingTermsGate;
    setPendingTermsGate(null);
    if (gate === 'scan') {
      setGuestScanError('');
      setGuestScanLoading(true);
    } else if (gate === 'signup') {
      setAppView('signup');
    }
  }, [pendingTermsGate]);

  const handleTermsCancel = useCallback(() => {
    setPendingTermsGate(null);
  }, []);

  // Used by the admin "Upload Global" shortcut to jump straight into the
  // Create wizard pre-set to Public (the wizard's own Visibility step still
  // lets admin flip it back to Private if they change their mind).
  const handleGoalPublic = useCallback(() => { setSelectedVisibility('public'); setAppView('image-upload'); }, []);

  const CONTENT_TYPE_VIEWS = { video: 'setup', url: 'url-setup', '3d': 'model-setup', animation: 'anim-setup', document: 'doc-setup' };
  const handleContentSelect = useCallback(({ imageFile, imagePreviewUrl, label, visibility }, type) => {
    setSharedImageFile(imageFile);
    setSharedImagePreviewUrl(imagePreviewUrl);
    setSharedLabel(label || '');
    setSelectedVisibility(visibility === 'public' ? 'public' : 'private');
    setAppView(CONTENT_TYPE_VIEWS[type] || 'setup');
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  const isArView = appView === 'ar';

  let mainScreen;
  if (videoOverlay) {
    mainScreen = <VideoOverlay key={videoOverlay.src} src={videoOverlay.src} onDone={handleVideoOverlayDone} />;
  } else if (appView === 'splash') {
    mainScreen = <SplashScreen onDone={() => setAppView('hello')} />;
  } else if (appView === 'hello') {
    mainScreen = (
      <HelloScreen
        onCreateAccount={handleCreateAccountTapped}
        onExisting={() => setAppView('signin')}
        onGuestScan={() => triggerScan('hello')}
        errorMsg={guestScanError}
        onDismissError={() => setGuestScanError('')}
      />
    );
  } else if (appView === 'signin') {
    mainScreen = <SignInScreen onSuccess={handleSignIn} onGoForgotPassword={() => setAppView('forgot')} onBack={() => setAppView('hello')} />;
  } else if (appView === 'signup') {
    mainScreen = <SignUpScreen onSuccess={handleSignUp} onBack={() => setAppView('hello')} onOtpFail={handleOtpFail} />;
  } else if (appView === 'account-type') {
    mainScreen = <AccountTypeScreen onSelect={handleAccountType} onLogin={() => setAppView('signin')} onBack={handleSignOut} />;
  } else if (appView === 'account-confirm') {
    mainScreen = <AccountConfirmScreen accountType={pendingAccountType} onContinue={handleAccountConfirm} onBack={() => setAppView('account-type')} onNoSelection={() => setAppView('account-type')} />;
  } else if (appView === 'business-category') {
    mainScreen = <BusinessCategoryScreen onContinue={handleBusinessCategory}
      onBack={() => {
        const wasSwitching = switchingAccountTypeRef.current;
        switchingAccountTypeRef.current = false;
        setAppView(wasSwitching ? 'profile' : 'account-confirm');
      }} />;
  } else if (appView === 'business-details') {
    mainScreen = <BusinessDetailsScreen onContinue={handleBusinessDetails} onBack={() => setAppView('business-category')} />;
  } else if (appView === 'business-complete') {
    mainScreen = <SetupCompleteScreen accountType="business" onCreateMemory={handleCreateFirstMemory} onGoToDashboard={handleGoToDashboard} onBack={() => setAppView('business-details')} />;
  } else if (appView === 'business-denied') {
    mainScreen = <BusinessDeniedScreen
      onRetry={() => setAppView('business-details')}
      onGoToDashboard={() => {
        if (switchingAccountTypeRef.current) { switchingAccountTypeRef.current = false; setAppView('profile'); return; }
        handleGoToDashboard();
      }}
      onBack={() => setAppView(switchingAccountTypeRef.current ? 'profile' : 'business-details')} />
  } else if (appView === 'individual-complete') {
    mainScreen = <SetupCompleteScreen accountType="individual" onCreateMemory={handleCreateFirstMemory} onGoToDashboard={handleGoToDashboard} onBack={() => setAppView('account-confirm')} />;
  } else if (appView === 'forgot') {
    mainScreen = <ForgotPasswordScreen onBack={() => setAppView('signin')} onSuccess={handleSignIn} />;
  } else if (appView === 'welcome') {
    mainScreen = <WelcomeScreen onDone={() => setAppView('home')} user={currentUser} />;
  } else if (appView === 'profile') {
    mainScreen = <ProfileScreen user={currentUser} onBack={() => setAppView('home')}
      onUserUpdate={(u) => { setCurrentUser(u); localStorage.setItem('memoera_user', JSON.stringify(u)); }}
      onSwitchToBusiness={handleSwitchToBusiness}
      onGallery={() => setAppView('gallery')}
      onDashboard={() => setAppView('seller-dashboard')} />;
  } else if (appView === 'gallery') {
    mainScreen = <GalleryScreen onBack={() => setAppView('home')} onCollection={() => setAppView('collection')} initialQuery={galleryQuery} />;
  } else if (appView === 'collection') {
    mainScreen = <CollectionScreen onBack={() => setAppView('gallery')} />;
  } else if (appView === 'liked') {
    mainScreen = <LikedSavedScreen kind="like" onBack={() => setAppView('home')} />;
  } else if (appView === 'settings') {
    mainScreen = <SettingsScreen onBack={() => setAppView('home')} onProfile={() => setAppView('profile')} initialSection={settingsInitialSection} />;
  } else if (appView === 'premium') {
    mainScreen = <PremiumScreen onBack={() => setAppView('home')} user={currentUser} />;
  } else if (appView === 'refer') {
    mainScreen = <ReferFriendScreen onBack={() => setAppView('home')} user={currentUser} />;
  } else if (appView === 'streak') {
    mainScreen = <StreakScreen onBack={() => setAppView('home')} />;
  } else if (appView === 'goal-select') {
    mainScreen = (
      <GoalSelectScreen
        onContinue={(v) => { setSelectedVisibility(v); setAppView('image-upload'); }}
        onBack={() => { setForcedContentType(null); setAppView('home'); }}
      />
    );
  } else if (appView === 'image-upload') {
    mainScreen = (
      <ImageUploadScreen
        onSelectContent={handleContentSelect}
        onBack={() => { setForcedContentType(null); setAppView('home'); }}
        visibility={selectedVisibility}
        initialContentType={forcedContentType}
      />
    );
  } else if (appView === 'anim-setup') {
    mainScreen = (
      <PhotoAnimationSetupScreen
        onStart={handleStart}
        onBack={() => setAppView('home')}
        isPublic={selectedVisibility === 'public'}
        sharedImageFile={sharedImageFile}
        sharedImagePreviewUrl={sharedImagePreviewUrl}
        sharedLabel={sharedLabel}
      />
    );
  } else if (appView === 'url-setup') {
    mainScreen = <UrlSetupScreen onStart={handleStart} onBack={() => setAppView('image-upload')} onSignOut={handleSignOut} isPublic={selectedVisibility === 'public'}
      sharedImageFile={sharedImageFile} sharedImagePreviewUrl={sharedImagePreviewUrl} sharedLabel={sharedLabel} />;
  } else if (appView === 'model-setup') {
    mainScreen = <Model3DSetupScreen onStart={handleStart} onBack={() => setAppView('image-upload')} onSignOut={handleSignOut} isPublic={selectedVisibility === 'public'}
      sharedImageFile={sharedImageFile} sharedImagePreviewUrl={sharedImagePreviewUrl} sharedLabel={sharedLabel} />;
  } else if (appView === 'doc-setup') {
    mainScreen = <DocumentSetupScreen onStart={handleStart} onBack={() => setAppView('image-upload')} onSignOut={handleSignOut} isPublic={selectedVisibility === 'public'}
      sharedImageFile={sharedImageFile} sharedImagePreviewUrl={sharedImagePreviewUrl} sharedLabel={sharedLabel} />;
  } else if (appView === 'setup') {
    mainScreen = (
      <SetupScreen onStart={handleStart} onLaunchSaved={null} initialCards={null}
        onBack={() => setAppView('image-upload')} onSignOut={handleSignOut} user={currentUser} isPublic={selectedVisibility === 'public'}
        sharedImageFile={sharedImageFile} sharedImagePreviewUrl={sharedImagePreviewUrl} sharedLabel={sharedLabel} />
    );
  } else if (appView === 'admin') {
    mainScreen = (
      <AdminScreen
        onBack={() => setAppView('home')}
        adminKey={import.meta.env.VITE_ADMIN_KEY || ''}
        onUploadGlobal={handleGoalPublic}
      />
    );
  } else if (appView === 'nfc') {
    mainScreen = (
      <NfcDashboardScreen
        onBack={() => setAppView('home')}
        onRead={() => setAppView('nfc-read')}
        onWrite={() => setAppView('nfc-write')}
        onClear={() => setAppView('nfc-clear')}
        onHistory={() => setAppView('nfc-history')}
      />
    );
  } else if (appView === 'nfc-write') {
    mainScreen = <NfcWriteMenuScreen onBack={() => setAppView('nfc')} onHistory={() => setAppView('nfc-history')} />;
  } else if (appView === 'nfc-read') {
    mainScreen = <NfcReadScreen onBack={() => setAppView('nfc')} />;
  } else if (appView === 'nfc-clear') {
    mainScreen = <NfcClearScreen onBack={() => setAppView('nfc')} />;
  } else if (appView === 'nfc-history') {
    mainScreen = <NfcHistoryScreen onBack={() => setAppView('nfc')} />;
  } else if (appView === 'catalog-setup') {
    mainScreen = <CatalogSetupScreen onStart={handleStart} onBack={() => setAppView('home')} isPublic={selectedVisibility === 'public'} />;
  } else if (appView === 'seller-dashboard') {
    mainScreen = <SellerDashboardScreen onBack={() => setAppView('home')} />;
  } else if (appView === 'home') {
    mainScreen = !localStorage.getItem('memoera_token') ? null : (
      <>
        <HomeScreen
          onUpload={() => { setForcedContentType(null); setAppView('goal-select'); }}
          onGallery={() => { setGalleryQuery(''); setAppView('gallery'); }}
          onSearch={(q) => { setGalleryQuery(q); setAppView('gallery'); }}
          onSettings={(section) => { setSettingsInitialSection(section || null); setAppView('settings'); }}
          onPremium={() => setAppView('premium')}
          onRefer={() => setAppView('refer')}
          onStreak={() => setAppView('streak')}
          onCollection={() => setAppView('collection')}
          onNfc={() => setAppView('nfc')}
          onCatalog={() => {
            setSelectedVisibility('private');
            setAppView('catalog-setup');
          }}
          onDashboard={() => setAppView('seller-dashboard')}
          onLiked={() => setAppView('liked')}
          onAdmin={() => setAppView('admin')}
          onSignOut={handleSignOut}
          onScan={() => triggerScan('home')}
          onAnimation={() => {
            // Photo Animation already has its own built-in marker-image
            // upload, so it doesn't need the goal-select/image-upload wizard
            // in front of it — jump straight to it from Home.
            setSelectedVisibility('private');
            setSharedImageFile(null);
            setSharedImagePreviewUrl(null);
            setSharedLabel('');
            setAppView('anim-setup');
          }}
          user={currentUser}
        />
        <Suspense fallback={null}>
          <ChatBotWidget />
        </Suspense>
      </>
    );
  } else {
    // AR view — A-Frame based scanner
    mainScreen = (
      <ARScannerScreen
        targets={targets}
        mindFileUrl={mindFileUrl}
        onBack={() => setAppView(scanOriginRef.current)}
      />
    );
  }

  return (
    <>
      <Suspense fallback={<div style={{ position:'fixed', inset:0, background:'#061A1F' }} />}>
        {mainScreen}
      </Suspense>

      {pendingTermsGate && (
        <TermsGateModal onAgree={handleTermsAgree} onCancel={handleTermsCancel} />
      )}

      {/* Instant "Tap to Scan" — invisible until ready; works identically whether
          triggered from the pre-login Hello screen or the signed-in Home screen */}
      {guestScanLoading && (
        <GuestScanScreen
          silent
          onReady={(data) => { setGuestScanLoading(false); handleGuestReady(data); }}
          onBack={() => setGuestScanLoading(false)}
          onError={(msg) => { setGuestScanLoading(false); setGuestScanError(msg || 'Could not start scanning. Please try again.'); }}
          prefetchedTargets={prefetchedPublicTargetsRef.current}
          includeOwnTargets={hasToken}
        />
      )}

      {/* Interactive "still getting ready" popup — only for the pre-login
          guest scan, only once the wait has gone on long enough that it
          might read as the site being slow/frozen otherwise. Gives the user
          an explicit way to keep waiting or back out instead of a silent
          spinner with no escape hatch. Shares the same look as the camera
          permission primer for a consistent visual language app-wide. */}
      {scanHint && (
        <CameraPermissionPrimer
          spinning
          title="Still Getting Your Scanner Ready"
          body="First-time scans take a little longer to set up. You can keep waiting for it to finish, or cancel and try again."
          allowLabel="Allow — Keep Waiting"
          dismissLabel="Cancel"
          onAllow={() => setScanHint(false)}
          onDismiss={() => { setGuestScanLoading(false); setScanHint(false); }}
        />
      )}

      {/* Scan-failure toast — the Home screen (unlike HelloScreen) has nowhere
          inline to show guestScanError, so a failed "Tap to Scan" from Home
          used to fail completely silently (tap → nothing → back where you
          started). Surface it here instead. */}
      {guestScanError && appView !== 'hello' && (
        <div style={{ position: 'fixed', left: 16, right: 16, bottom: 28, zIndex: 9999,
          background: 'rgba(20,10,10,0.92)', border: '1px solid rgba(255,107,107,0.4)',
          borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 10,
          fontFamily: "'Outfit', sans-serif", boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>⚠️</span>
          <span style={{ color: '#fff', fontSize: 13.5, lineHeight: 1.4, flex: 1 }}>{guestScanError}</span>
          <button onClick={() => setGuestScanError('')}
            style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.5)',
              fontSize: 15, cursor: 'pointer', flexShrink: 0, padding: 0 }}>✕</button>
        </div>
      )}

      {/* Global pull-to-refresh indicator — hidden on AR scanner views */}
      {!isArView && (ptrDist > 8 || ptrRefreshing) && (
        <div style={{ position:'fixed', top:0, left:0, right:0, zIndex:9999,
          display:'flex', flexDirection:'column', alignItems:'center',
          paddingTop: ptrRefreshing ? 14 : Math.max(0, ptrDist - 30),
          pointerEvents:'none', transition: ptrRefreshing ? 'padding-top 0.3s ease' : 'none' }}>
          <style>{`@keyframes gptr-spin { to { transform: rotate(360deg); } }`}</style>
          <div style={{ width:40, height:40, borderRadius:'50%',
            background: ptrDist >= PTR_THRESHOLD || ptrRefreshing ? 'rgba(0,201,167,0.18)' : 'rgba(0,0,0,0.07)',
            border: `2.5px solid ${ptrDist >= PTR_THRESHOLD || ptrRefreshing ? '#00C9A7' : 'rgba(0,0,0,0.15)'}`,
            display:'flex', alignItems:'center', justifyContent:'center',
            boxShadow: ptrDist >= PTR_THRESHOLD || ptrRefreshing ? '0 0 18px rgba(0,201,167,0.5)' : 'none',
            transition:'background 0.2s, border 0.2s, box-shadow 0.2s' }}>
            <span style={{ fontSize:20, color: ptrDist >= PTR_THRESHOLD || ptrRefreshing ? '#00C9A7' : 'rgba(0,0,0,0.3)',
              display:'inline-block',
              transform: ptrRefreshing ? 'none' : `rotate(${Math.min((ptrDist / PTR_THRESHOLD) * 180, 180)}deg)`,
              animation: ptrRefreshing ? 'gptr-spin 0.65s linear infinite' : 'none',
              transition: ptrRefreshing ? 'none' : 'transform 0.05s, color 0.2s' }}>↻</span>
          </div>
          {!ptrRefreshing && ptrDist >= PTR_THRESHOLD && (
            <span style={{ marginTop:6, fontSize:10, color:'#00C9A7', fontFamily:'Outfit,sans-serif', fontWeight:700, letterSpacing:'0.05em' }}>
              Release to Refresh
            </span>
          )}
          {ptrRefreshing && (
            <span style={{ marginTop:6, fontSize:10, color:'#00C9A7', fontFamily:'Outfit,sans-serif', fontWeight:700, letterSpacing:'0.05em' }}>
              Refreshing…
            </span>
          )}
        </div>
      )}
    </>
  );
}
