import { useState, useCallback, useEffect, useRef, Suspense, lazy } from 'react';
import { COMPILER_URL } from './hooks/loadMindARCompiler.js';

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
  'premium':     'home',
  'refer':       'home',
  'goal-select': 'home',
  'upload-type': 'goal-select',
  'setup':       'upload-type',
  'url-setup':   'upload-type',
  'model-setup': 'upload-type',
  'anim-setup':  'upload-type',
  'admin':       'home',
};

// Critical-path screens — needed for the very first paint, kept in the main bundle
import SplashScreen   from './components/SplashScreen.jsx';
import HomeScreen     from './components/HomeScreen.jsx';
import VideoOverlay      from './components/VideoOverlay.jsx';
import GuestScanScreen, { invalidateGuestCache } from './components/GuestScanScreen.jsx';
import PublicArView       from './components/PublicArView.jsx';

// Everything below is only needed after navigation — lazy-load so the
// initial bundle (and time-to-interactive) stays small.
const ARScannerScreen          = lazy(() => import('./components/ARScannerScreen.jsx'));
const Model3DSetupScreen       = lazy(() => import('./components/Model3DSetupScreen.jsx'));
const DocumentSetupScreen      = lazy(() => import('./components/DocumentSetupScreen.jsx'));
const PhotoAnimationSetupScreen = lazy(() => import('./components/PhotoAnimationSetupScreen.jsx'));
const CollectionScreen         = lazy(() => import('./components/CollectionScreen.jsx'));
const SetupScreen              = lazy(() => import('./components/SetupScreen.jsx'));
const SignInScreen             = lazy(() => import('./components/SignInScreen.jsx'));
const SignUpScreen             = lazy(() => import('./components/SignUpScreen.jsx'));
const WelcomeScreen            = lazy(() => import('./components/WelcomeScreen.jsx'));
const ForgotPasswordScreen     = lazy(() => import('./components/ForgotPasswordScreen.jsx'));
const HelloScreen              = lazy(() => import('./components/HelloScreen.jsx'));
const ProfileScreen            = lazy(() => import('./components/ProfileScreen.jsx'));
const GalleryScreen            = lazy(() => import('./components/GalleryScreen.jsx'));
const SettingsScreen           = lazy(() => import('./components/SettingsScreen.jsx'));
const GoalSelectScreen         = lazy(() => import('./components/GoalSelectScreen.jsx'));
const UploadTypeScreen         = lazy(() => import('./components/UploadTypeScreen.jsx'));
const UrlSetupScreen           = lazy(() => import('./components/UrlSetupScreen.jsx'));
const PremiumScreen            = lazy(() => import('./components/PremiumScreen.jsx'));
const ReferFriendScreen        = lazy(() => import('./components/ReferFriendScreen.jsx'));
const ChatBotWidget            = lazy(() => import('./components/ChatBotWidget.jsx'));
const AdminScreen              = lazy(() => import('./components/AdminScreen.jsx'));

import { loadTargets, loadPublicTargets } from './hooks/useArStorage.js';
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
  const pendingARRef             = useRef(null);
  const activeBlobUrlsRef        = useRef([]);
  // Tracks which screen a scan was launched from ('home' or 'hello') so the
  // AR viewer's back button returns there instead of always landing on 'hello'.
  const scanOriginRef            = useRef('home');
  const prefetchedPublicTargetsRef = useRef(null);

  const [cloudTargets,       setCloudTargets]       = useState(null);
  const appViewRef = useRef(appView);
  useEffect(() => { appViewRef.current = appView; }, [appView]);
  const [videoOverlay,       setVideoOverlay]       = useState(null);
  const [selectedVisibility, setSelectedVisibility] = useState('private');

  // Pull-to-refresh (global — all views except AR scanners)
  const ptrStartY   = useRef(-1);
  const ptrDistRef  = useRef(0);
  const [ptrDist,       setPtrDist]       = useState(0);
  const [ptrRefreshing, setPtrRefreshing] = useState(false);
  const PTR_THRESHOLD = 80;
  const PTR_EXCLUDED  = ['ar', 'home']; // home has its own

  // Initialise AdMob SDK as early as possible
  useEffect(() => { initAdMob(); }, []);

  // Preload video overlay assets — deferred until the browser is idle so this
  // ~17MB of video doesn't compete with the initial app load/interactivity.
  useEffect(() => {
    const preload = () => {
      const VIDEOS = ['/right-mark.mp4', '/x-mark.mp4', '/wings-to-memories.mp4', '/welcome-hand.mp4', '/review-our-album.mp4'];
      VIDEOS.forEach((src) => {
        const v = document.createElement('video');
        v.src = src; v.preload = 'auto'; v.muted = true; v.load();
      });
    };
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(preload, { timeout: 5000 });
      return () => window.cancelIdleCallback(id);
    }
    const t = setTimeout(preload, 3000);
    return () => clearTimeout(t);
  }, []);

  // Preload BOTH MindAR scripts when idle so scans open instantly
  useEffect(() => {
    if (appView !== 'hello' && appView !== 'home') return;

    // 1. Compiler — used during "Setting up..." phase
    if (!window.MINDAR?.IMAGE?.Compiler) {
      import(/* @vite-ignore */ COMPILER_URL).catch(() => {});
    }

    // 2. Three.js tracker — used by ARScene after compilation; pre-load so it's cached
    if (!window.MINDAR?.IMAGE?.MindARThree && !document.getElementById('mindar-three-preload')) {
      const s = document.createElement('script');
      s.id   = 'mindar-three-preload';
      s.type = 'module';
      s.src  = 'https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-three.prod.js';
      s.crossOrigin = 'anonymous';
      document.head.appendChild(s);
    }

    // 3. A-Frame + MindAR's AR runtime (~3 MB combined) — these are what the
    //    /ar-scanner.html iframe actually loads when "Tap to Scan" is pressed.
    //    Warm the HTTP cache now so that load is instant instead of a fresh
    //    multi-MB fetch at the moment the user is waiting for the camera.
    if (!window.__arLibsPreloaded) {
      window.__arLibsPreloaded = true;
      // ar-scanner.html itself is marked no-cache (so edits during development
      // always reach users) — but the browser can still cache it and revalidate
      // with a fast 304 instead of a full re-fetch. Warming it now means that
      // revalidation round-trip happens while the user is still on Home, not
      // while they're staring at the scan screen.
      ['/libs/aframe.min.js', '/libs/mindar-image-aframe.prod.js', '/ar-scanner.html'].forEach((href) => {
        const link = document.createElement('link');
        link.rel  = 'prefetch';
        link.as   = href.endsWith('.html') ? 'document' : 'script';
        link.href = href;
        document.head.appendChild(link);
        // Belt-and-suspenders: some WebViews ignore prefetch hints, so also
        // issue a real fetch to force the file into HTTP cache.
        fetch(href, { mode: 'no-cors' }).catch(() => {});
      });
    }
  }, [appView]);

  // Pre-warm camera as early as possible — even on splash so it's ready by hello's guest scan
  useEffect(() => {
    if (['splash', 'hello'].includes(appView)) {
      startCameraWarm();
      return;
    }
    stopWarmStream();
  }, [appView]);

  // Prefetch public targets + pre-warm the guest scan's .mind file while on
  // hello or home, so tapping "Tap to Scan" opens instantly with zero wait
  // instead of downloading/compiling at that point.
  useEffect(() => {
    if (appView !== 'hello' && appView !== 'home') return;
    loadPublicTargets().then((t) => {
      prefetchedPublicTargetsRef.current = t;
      startBackgroundPublicCompile(t);
    }).catch(() => {});
  }, [appView]);

  // Bounce to 'hello' if the session token is gone while on 'home'
  useEffect(() => {
    if (appView === 'home' && !localStorage.getItem('memoera_token')) setAppView('hello');
  }, [appView]);

  // If a guest's first-ever scan (no cache yet) takes a moment to compile,
  // show an interactive popup after a short delay so the wait reads as
  // normal progress instead of the site looking frozen/slow, and gives the
  // user a way to back out instead of just staring at a stuck screen. Home's
  // own scan button skips this — signed-in users already have camera context.
  useEffect(() => {
    if (!guestScanLoading || scanOriginRef.current !== 'hello') { setScanHint(false); return; }
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
      const target = BACK_MAP[current] ?? fallback;
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

  const handleSignIn  = useCallback((user) => { setCurrentUser(user); registerUserForGreetings(user); setAppView('home'); }, [registerUserForGreetings]);
  const handleSignUp  = useCallback((user) => { setCurrentUser(user); registerUserForGreetings(user); setVideoOverlay({ src: '/right-mark.mp4', next: 'welcome-hand' }); }, [registerUserForGreetings]);
  const handleOtpFail = useCallback(() => { setVideoOverlay({ src: '/x-mark.mp4', next: 'signup' }); }, []);

  const handleVideoOverlayDone = useCallback(() => {
    setVideoOverlay((v) => {
      if (!v) return null;
      if (v.next === 'welcome-hand') return { src: '/welcome-hand.mp4', next: 'home' };
      if (v.next === 'home')     { setTimeout(() => setAppView('home'),    0); return null; }
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
  }, [launchAR]);

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
    scanOriginRef.current = origin;
    setGuestScanError('');
    setGuestScanLoading(true);
  }, []);

  const handleGoalPrivate      = useCallback(() => { setSelectedVisibility('private'); setAppView('upload-type'); }, []);
  const handleGoalPublic       = useCallback(() => { setSelectedVisibility('public');  setAppView('upload-type'); }, []);
  const handleUploadPhotoVideo     = useCallback(() => { setAppView('setup'); }, []);
  const handleUploadPhotoUrl       = useCallback(() => { setAppView('url-setup'); }, []);
  const handleUploadPhoto3D        = useCallback(() => { setAppView('model-setup'); }, []);
  const handleUploadPhotoAnimation = useCallback(() => { setAppView('anim-setup'); }, []);
  const handleUploadPhotoDocument  = useCallback(() => { setAppView('doc-setup'); }, []);

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
        onCreateAccount={() => setAppView('signup')}
        onExisting={() => setAppView('signin')}
        onGuestScan={() => triggerScan('hello')}
        errorMsg={guestScanError}
        onDismissError={() => setGuestScanError('')}
      />
    );
  } else if (appView === 'signin') {
    mainScreen = <SignInScreen onSuccess={handleSignIn} onGoForgotPassword={() => setAppView('forgot')} />;
  } else if (appView === 'signup') {
    mainScreen = <SignUpScreen onSuccess={handleSignUp} onBack={() => setAppView('hello')} onOtpFail={handleOtpFail} />;
  } else if (appView === 'forgot') {
    mainScreen = <ForgotPasswordScreen onBack={() => setAppView('signin')} onSuccess={handleSignIn} />;
  } else if (appView === 'welcome') {
    mainScreen = <WelcomeScreen onDone={() => setAppView('home')} user={currentUser} />;
  } else if (appView === 'profile') {
    mainScreen = <ProfileScreen user={currentUser} onBack={() => setAppView('home')} onUserUpdate={(u) => { setCurrentUser(u); localStorage.setItem('memoera_user', JSON.stringify(u)); }} />;
  } else if (appView === 'gallery') {
    mainScreen = <GalleryScreen onBack={() => setAppView('home')} onCollection={() => setAppView('collection')} />;
  } else if (appView === 'collection') {
    mainScreen = <CollectionScreen onBack={() => setAppView('gallery')} />;
  } else if (appView === 'settings') {
    mainScreen = <SettingsScreen onBack={() => setAppView('home')} onProfile={() => setAppView('profile')} />;
  } else if (appView === 'premium') {
    mainScreen = <PremiumScreen onBack={() => setAppView('home')} user={currentUser} />;
  } else if (appView === 'refer') {
    mainScreen = <ReferFriendScreen onBack={() => setAppView('home')} user={currentUser} />;
  } else if (appView === 'goal-select') {
    mainScreen = <GoalSelectScreen onPrivate={handleGoalPrivate} onPublic={handleGoalPublic} onBack={() => setAppView('home')} />;
  } else if (appView === 'upload-type') {
    mainScreen = (
      <UploadTypeScreen
        onPhotoVideo={handleUploadPhotoVideo}
        onPhotoUrl={handleUploadPhotoUrl}
        onPhoto3D={handleUploadPhoto3D}
        onPhotoAnimation={handleUploadPhotoAnimation}
        onPhotoDocument={handleUploadPhotoDocument}
        onBack={() => setAppView('goal-select')}
        visibility={selectedVisibility}
      />
    );
  } else if (appView === 'anim-setup') {
    mainScreen = (
      <PhotoAnimationSetupScreen
        onStart={handleStart}
        onBack={() => setAppView('upload-type')}
        isPublic={selectedVisibility === 'public'}
      />
    );
  } else if (appView === 'url-setup') {
    mainScreen = <UrlSetupScreen onStart={handleStart} onSignOut={handleSignOut} isPublic={selectedVisibility === 'public'} />;
  } else if (appView === 'model-setup') {
    mainScreen = <Model3DSetupScreen onStart={handleStart} onSignOut={handleSignOut} isPublic={selectedVisibility === 'public'} />;
  } else if (appView === 'doc-setup') {
    mainScreen = <DocumentSetupScreen onStart={handleStart} onSignOut={handleSignOut} isPublic={selectedVisibility === 'public'} />;
  } else if (appView === 'setup') {
    mainScreen = (
      <SetupScreen onStart={handleStart} onLaunchSaved={null} initialCards={null}
        onSignOut={handleSignOut} user={currentUser} isPublic={selectedVisibility === 'public'} />
    );
  } else if (appView === 'admin') {
    mainScreen = (
      <AdminScreen
        onBack={() => setAppView('home')}
        adminKey={import.meta.env.VITE_ADMIN_KEY || ''}
        onUploadGlobal={handleGoalPublic}
      />
    );
  } else if (appView === 'home') {
    mainScreen = !localStorage.getItem('memoera_token') ? null : (
      <>
        <HomeScreen
          onUpload={() => setAppView('goal-select')}
          onGallery={() => setVideoOverlay({ src: '/review-our-album.mp4', next: 'gallery' })}
          onSettings={() => setAppView('settings')}
          onPremium={() => setAppView('premium')}
          onRefer={() => setAppView('refer')}
          onCollection={() => setAppView('collection')}
          onAdmin={() => setAppView('admin')}
          onSignOut={handleSignOut}
          onScan={() => triggerScan('home')}
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

      {/* Instant "Tap to Scan" — invisible until ready; works identically whether
          triggered from the pre-login Hello screen or the signed-in Home screen */}
      {guestScanLoading && (
        <GuestScanScreen
          silent
          onReady={(data) => { setGuestScanLoading(false); handleGuestReady(data); }}
          onBack={() => setGuestScanLoading(false)}
          onError={(msg) => setGuestScanError(msg || 'Could not start scanning. Please try again.')}
          prefetchedTargets={prefetchedPublicTargetsRef.current}
        />
      )}

      {/* Interactive "still getting ready" popup — only for the pre-login
          guest scan, only once the wait has gone on long enough that it
          might read as the site being slow/frozen otherwise. Gives the user
          an explicit way to keep waiting or back out instead of a silent
          spinner with no escape hatch. */}
      {scanHint && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }}>
          <style>{`@keyframes scanhint-spin { to { transform: rotate(360deg); } }`}</style>
          <div style={{
            width: '100%', maxWidth: 340, borderRadius: 24, padding: '32px 24px 24px',
            background: 'linear-gradient(160deg, #0A2229 0%, #061A1F 100%)',
            border: '1px solid rgba(0,201,167,0.2)', textAlign: 'center',
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)', fontFamily: 'Outfit,sans-serif',
          }}>
            <span style={{ display: 'inline-block', width: 40, height: 40, margin: '0 auto 16px',
              border: '3px solid rgba(0,201,167,0.25)', borderTopColor: '#00C9A7', borderRadius: '50%',
              animation: 'scanhint-spin 0.8s linear infinite' }} />
            <h3 style={{ fontSize: 17, fontWeight: 700, color: '#fff', margin: '0 0 10px' }}>
              Still Getting Your Scanner Ready
            </h3>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, margin: '0 0 22px' }}>
              First-time scans take a little longer to set up. You can keep waiting for it to finish, or cancel and try again.
            </p>
            <button onClick={() => setScanHint(false)} style={{
              width: '100%', background: 'linear-gradient(135deg, #00C9A7, #00E5CC)', border: 'none',
              borderRadius: 50, color: '#040D0B', fontSize: 14, fontWeight: 700,
              padding: '13px 20px', cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,201,167,0.35)',
            }}>
              Allow — Keep Waiting
            </button>
            <button onClick={() => { setGuestScanLoading(false); setScanHint(false); }} style={{
              width: '100%', marginTop: 10, background: 'transparent', border: 'none',
              color: 'rgba(255,255,255,0.5)', fontSize: 13, padding: '8px', cursor: 'pointer',
            }}>
              Cancel
            </button>
          </div>
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
