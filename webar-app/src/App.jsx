import { useState, useCallback, useEffect, useRef } from 'react';
import ARScene from './components/ARScene.jsx';
import LoadingScreen from './components/LoadingScreen.jsx';
import SetupScreen from './components/SetupScreen.jsx';
import SplashScreen from './components/SplashScreen.jsx';
import SignInScreen from './components/SignInScreen.jsx';
import SignUpScreen from './components/SignUpScreen.jsx';
import WelcomeScreen from './components/WelcomeScreen.jsx';
import ForgotPasswordScreen from './components/ForgotPasswordScreen.jsx';
import HelloScreen from './components/HelloScreen.jsx';
import HomeScreen from './components/HomeScreen.jsx';
import ProfileScreen from './components/ProfileScreen.jsx';
import GalleryScreen from './components/GalleryScreen.jsx';
import SettingsScreen from './components/SettingsScreen.jsx';
import GoalSelectScreen from './components/GoalSelectScreen.jsx';
import UploadTypeScreen from './components/UploadTypeScreen.jsx';
import UrlSetupScreen from './components/UrlSetupScreen.jsx';
import GuestScanScreen, { invalidateGuestCache } from './components/GuestScanScreen.jsx';
import UserScanScreen, { invalidateUserCache } from './components/UserScanScreen.jsx';
import VideoOverlay from './components/VideoOverlay.jsx';
import AdsPlaceholder from './components/AdsPlaceholder.jsx';
import PremiumScreen from './components/PremiumScreen.jsx';
import { loadTargets, loadPublicTargets } from './hooks/useArStorage.js';

export default function App() {
  const hasToken = !!localStorage.getItem('memoera_token');

  const [appView, setAppView] = useState(() => hasToken ? 'home' : 'splash');
  const [currentUser, setCurrentUser] = useState(() => {
    try { const s = localStorage.getItem('memoera_user'); return s ? JSON.parse(s) : null; }
    catch { return null; }
  });

  const [arStatus, setArStatus] = useState('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [targets, setTargets] = useState(null);
  const [mindFileUrl, setMindFileUrl] = useState(null);
  const [initialCards] = useState(null);
  const [cloudTargets, setCloudTargets] = useState(null);
  const [videoOverlay, setVideoOverlay] = useState(null);
  const [selectedVisibility, setSelectedVisibility] = useState('private');
  const [isGuest, setIsGuest] = useState(false);
  const [pendingAR, setPendingAR] = useState(null);
  const pendingARRef = useRef(null);
  const activeBlobUrlsRef = useRef([]);
  const isGuestRef = useRef(isGuest);
  const prefetchedPublicTargetsRef = useRef(null);
  useEffect(() => { isGuestRef.current = isGuest; }, [isGuest]);

  // Preload MindAR compiler while user is idle on hello/home screen
  useEffect(() => {
    if (appView !== 'hello' && appView !== 'home') return;
    if (window.MINDAR?.IMAGE?.Compiler) return;
    import('https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image.prod.js').catch(() => {});
  }, [appView]);

  // Prefetch public targets while on hello screen
  useEffect(() => {
    if (appView !== 'hello') return;
    loadPublicTargets().then((t) => { prefetchedPublicTargetsRef.current = t; }).catch(() => {});
  }, [appView]);

  // Push a history entry on every view change so the browser back
  // button triggers popstate instead of leaving the site.
  useEffect(() => {
    window.history.pushState({ view: appView }, '');
  }, [appView]);

  useEffect(() => {
    const handlePop = () => {
      const isAuthenticated = !!localStorage.getItem('memoera_token');
      if (!isAuthenticated || isGuestRef.current) {
        setAppView('hello');
        window.history.pushState({ view: 'hello' }, '');
        return;
      }
      setAppView('home');
      window.history.pushState({ view: 'home' }, '');
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  useEffect(() => {
    if (!hasToken) return;
    // Just check if the user has any targets — used only for Gallery / SetupScreen pre-fill.
    // Scanning is always done via UserScanScreen which recompiles fresh from imageUrls,
    // so cloudMindFileUrl is intentionally not used for scanning.
    loadTargets().then(({ targets: t, hasData }) => {
      if (!hasData) return;
      setCloudTargets(t);
    }).catch(() => {});
    return () => { activeBlobUrlsRef.current.forEach((u) => { try { URL.revokeObjectURL(u); } catch(_){} }); };
  }, []);

  const handleSignIn = useCallback((user) => { setCurrentUser(user); setAppView('home'); }, []);
  const handleSignUp = useCallback((user) => { setCurrentUser(user); setVideoOverlay({ src: '/right-mark.mp4', next: 'welcome-hand' }); }, []);
  const handleOtpFail = useCallback(() => { setVideoOverlay({ src: '/x-mark.mp4', next: 'signup' }); }, []);

  const launchAR = useCallback(({ targets: t, mindFileUrl: m }) => {
    activeBlobUrlsRef.current.forEach((u) => { try { URL.revokeObjectURL(u); } catch(_){} });
    activeBlobUrlsRef.current = [m, ...t.map((x) => x.videoUrl).filter(Boolean)].filter(Boolean);
    setTargets(t); setMindFileUrl(m); setArStatus('idle'); setErrorMessage('');
    setAppView('ar');
  }, []);

  const handleVideoOverlayDone = useCallback(() => {
    setVideoOverlay((v) => {
      if (!v) return null;
      if (v.next === 'welcome-hand') return { src: '/welcome-hand.mp4', next: 'home' };
      if (v.next === 'home') { setTimeout(() => setAppView('home'), 0); return null; }
      if (v.next === 'signup') { setTimeout(() => setAppView('signup'), 0); return null; }
      if (v.next === 'ar-ready') {
        const ar = pendingARRef.current;
        pendingARRef.current = null;
        setPendingAR(null);
        if (ar) setTimeout(() => launchAR(ar), 0);
        return null;
      }
      if (v.next === 'gallery') { setTimeout(() => setAppView('gallery'), 0); return null; }
      return null;
    });
  }, [launchAR]);

  const handleStart = useCallback(({ targets: t, mindFileUrl: m }) => {
    // New targets uploaded — bust caches so next scan recompiles
    invalidateGuestCache();
    invalidateUserCache();
    pendingARRef.current = { targets: t, mindFileUrl: m };
    setPendingAR({ targets: t, mindFileUrl: m });
    setVideoOverlay({ src: '/wings-to-memories.mp4', next: 'ar-ready' });
  }, []);

  const handleSignOut = useCallback(() => {
    localStorage.removeItem('memoera_token'); localStorage.removeItem('memoera_user');
    setCurrentUser(null); setTargets(null); setMindFileUrl(null);
    setCloudTargets(null);
    setArStatus('idle'); setIsGuest(false); setAppView('hello');
  }, []);

  const handleDiscLoadingDone = useCallback(() => {
    const ar = pendingARRef.current;
    pendingARRef.current = null;
    setPendingAR(null);
    if (ar) launchAR(ar);
  }, [launchAR]);

  const handleLaunchSaved = useCallback(() => {
    if (!cloudTargets || !cloudTargets.length) return;
    setIsGuest(false);
    setAppView('user-scan');
  }, [cloudTargets]);

  // Guest scan: called when GuestScanScreen finishes compiling public targets
  const handleGuestReady = useCallback(({ targets: t, mindFileUrl: m }) => {
    setIsGuest(true);
    launchAR({ targets: t, mindFileUrl: m });
  }, [launchAR]);

  // Logged-in user scan: own targets + public targets combined
  const handleUserScanReady = useCallback(({ targets: t, mindFileUrl: m }) => {
    setIsGuest(false);
    launchAR({ targets: t, mindFileUrl: m });
  }, [launchAR]);

  // Upload flow: navigate through goal-select → upload-type → setup/url-setup
  const handleGoalPrivate = useCallback(() => { setSelectedVisibility('private'); setAppView('upload-type'); }, []);
  const handleGoalPublic  = useCallback(() => { setSelectedVisibility('public');  setAppView('upload-type'); }, []);
  const handleUploadPhotoVideo = useCallback(() => { setAppView('setup'); }, []);
  const handleUploadPhotoUrl   = useCallback(() => { setAppView('url-setup'); }, []);

  if (videoOverlay) {
    return <VideoOverlay key={videoOverlay.src} src={videoOverlay.src}
      fallbackMs={videoOverlay.src.includes('welcome-hand') ? 30000 : 8000}
      onDone={handleVideoOverlayDone} />;
  }
  if (appView === 'splash') return <SplashScreen onDone={() => setAppView('hello')} />;
  if (appView === 'hello') return (
    <HelloScreen
      onCreateAccount={() => setAppView('signup')}
      onExisting={() => setAppView('signin')}
      onGuestScan={() => setAppView('guest-scan')}
    />
  );
  if (appView === 'ads') return <AdsPlaceholder onDone={handleDiscLoadingDone} />;
  if (appView === 'guest-scan') return (
    <GuestScanScreen
      onReady={handleGuestReady}
      onBack={() => setAppView('hello')}
      prefetchedTargets={prefetchedPublicTargetsRef.current}
    />
  );
  if (appView === 'user-scan') return (
    <UserScanScreen onReady={handleUserScanReady} onBack={() => setAppView('home')} />
  );
  if (appView === 'signin') return <SignInScreen onSuccess={handleSignIn} onGoForgotPassword={() => setAppView('forgot')} />;
  if (appView === 'signup') return <SignUpScreen onSuccess={handleSignUp} onBack={() => setAppView('hello')} onOtpFail={handleOtpFail} />;
  if (appView === 'forgot') return <ForgotPasswordScreen onBack={() => setAppView('signin')} onSuccess={handleSignIn} />;
  if (appView === 'welcome') return <WelcomeScreen onDone={() => setAppView('home')} user={currentUser} />;
  if (appView === 'profile') return <ProfileScreen user={currentUser} onBack={() => setAppView('home')} onUserUpdate={(u) => { setCurrentUser(u); localStorage.setItem('memoera_user', JSON.stringify(u)); }} />;
  if (appView === 'gallery') return <GalleryScreen onBack={() => setAppView('home')} />;
  if (appView === 'settings') return <SettingsScreen onBack={() => setAppView('home')} onProfile={() => setAppView('profile')} />;
  if (appView === 'premium') return <PremiumScreen onBack={() => setAppView('home')} />;
  if (appView === 'goal-select') return (
    <GoalSelectScreen
      onPrivate={handleGoalPrivate}
      onPublic={handleGoalPublic}
      onBack={() => setAppView('home')}
    />
  );
  if (appView === 'upload-type') return (
    <UploadTypeScreen
      onPhotoVideo={handleUploadPhotoVideo}
      onPhotoUrl={handleUploadPhotoUrl}
      onBack={() => setAppView('goal-select')}
      visibility={selectedVisibility}
    />
  );
  if (appView === 'url-setup') return (
    <UrlSetupScreen
      onStart={handleStart}
      onSignOut={handleSignOut}
      isPublic={selectedVisibility === 'public'}
    />
  );
  if (appView === 'setup') return (
    <SetupScreen onStart={handleStart} onLaunchSaved={null}
      initialCards={null} onSignOut={handleSignOut} user={currentUser}
      isPublic={selectedVisibility === 'public'} />
  );
  if (appView === 'home') {
    if (!localStorage.getItem('memoera_token')) {
      setTimeout(() => setAppView('hello'), 0);
      return null;
    }
    return (
    <HomeScreen
      onScan={() => setAppView('user-scan')}
      onUpload={() => setAppView('goal-select')}
      onGallery={() => setVideoOverlay({ src: '/review-our-album.mp4', next: 'gallery' })}
      onSettings={() => setAppView('settings')}
      onPremium={() => setAppView('premium')}
      onSignOut={handleSignOut}
      user={currentUser}
    />
  );
  }
  // AR view
  return (
    <div style={{ position:'relative', width:'100%', height:'100%', overflow:'hidden' }}>
      <ARScene targets={targets} mindFileUrl={mindFileUrl} onStatusChange={(s,m) => { setArStatus(s); if(m) setErrorMessage(m); }} />
      <LoadingScreen status={arStatus} errorMessage={errorMessage}
        onEdit={() => { setArStatus('idle'); setAppView(isGuest ? 'hello' : 'home'); }} />
    </div>
  );
}

function getAspectRatioLabel(h) {
  if (h<=0.57) return '16:9';
  if (h<=0.76) return '4:3';
  if (h<=1.01) return '1:1';
  return '9:16';
}
