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
import GoalSelectScreen from './components/GoalSelectScreen.jsx';
import UploadTypeScreen from './components/UploadTypeScreen.jsx';
import UrlSetupScreen from './components/UrlSetupScreen.jsx';
import GuestScanScreen from './components/GuestScanScreen.jsx';
import UserScanScreen from './components/UserScanScreen.jsx';
import DiscLoadingOverlay from './components/DiscLoadingOverlay.jsx';
import VideoOverlay from './components/VideoOverlay.jsx';
import { loadTargets } from './hooks/useArStorage.js';

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
  const [initialCards, setInitialCards] = useState(null);
  const [cloudTargets, setCloudTargets] = useState(null);
  const [cloudMindFileUrl, setCloudMindFileUrl] = useState(null);
  const [videoOverlay, setVideoOverlay] = useState(null); // { src, next }
  const [showDiscLoading, setShowDiscLoading] = useState(false);
  // Upload flow: visibility + type chosen before SetupScreen
  const [selectedVisibility, setSelectedVisibility] = useState('private'); // 'public' | 'private'
  // Guest mode: AR exit returns to 'hello' instead of 'home'
  const [isGuest, setIsGuest] = useState(false);
  const activeBlobUrlsRef = useRef([]);

  useEffect(() => {
    if (!hasToken) return;
    loadTargets().then(({ targets: t, mindFileUrl: m, hasData, imagePreviewUrls }) => {
      if (!hasData) return;
      setCloudTargets(t); setCloudMindFileUrl(m);
      setInitialCards(t.map((x, i) => ({
        label: x.label || `Target ${i+1}`, imageFile: null,
        imagePreviewUrl: x._imagePreviewUrl || null,
        videoFile: null, videoName: x.videoUrl ? 'Saved to cloud' : null,
        videoSize: null, aspectRatio: getAspectRatioLabel(x.planeHeight),
      })));
    }).catch(() => {});
    return () => { activeBlobUrlsRef.current.forEach((u) => { try { URL.revokeObjectURL(u); } catch(_){} }); };
  }, []);

  const handleSignIn = useCallback((user) => { setCurrentUser(user); setAppView('home'); }, []);
  const handleSignUp = useCallback((user) => { setCurrentUser(user); setVideoOverlay({ src: '/right-mark.mp4', next: 'welcome-hand' }); }, []);
  const handleOtpFail = useCallback(() => { setVideoOverlay({ src: '/x-mark.mp4', next: 'signup' }); }, []);
  const handleVideoOverlayDone = useCallback(() => {
    setVideoOverlay((v) => {
      if (!v) return null;
      if (v.next === 'welcome-hand') return { src: '/welcome-hand.mp4', next: 'home' };
      if (v.next === 'home') { setTimeout(() => setAppView('home'), 0); return null; }
      if (v.next === 'signup') { setTimeout(() => setAppView('signup'), 0); return null; }
      return null;
    });
  }, []);

  const handleSignOut = useCallback(() => {
    localStorage.removeItem('memoera_token'); localStorage.removeItem('memoera_user');
    setCurrentUser(null); setTargets(null); setMindFileUrl(null);
    setInitialCards(null); setCloudTargets(null); setCloudMindFileUrl(null);
    setArStatus('idle'); setIsGuest(false); setAppView('hello');
  }, []);

  const handleStart = useCallback(({ targets: t, mindFileUrl: m }) => {
    activeBlobUrlsRef.current.forEach((u) => { try { URL.revokeObjectURL(u); } catch(_){} });
    activeBlobUrlsRef.current = [m, ...t.map((x) => x.videoUrl).filter(Boolean)].filter(Boolean);
    setTargets(t); setMindFileUrl(m); setArStatus('idle'); setErrorMessage('');
    setShowDiscLoading(true);
  }, []);

  const handleDiscLoadingDone = useCallback(() => {
    setShowDiscLoading(false); setAppView('ar');
  }, []);

  const handleLaunchSaved = useCallback(() => {
    if (!cloudTargets || !cloudMindFileUrl) return;
    setIsGuest(false);
    handleStart({ targets: cloudTargets, mindFileUrl: cloudMindFileUrl });
  }, [cloudTargets, cloudMindFileUrl, handleStart]);

  // Guest scan: called when GuestScanScreen finishes compiling public targets
  const handleGuestReady = useCallback(({ targets: t, mindFileUrl: m }) => {
    setIsGuest(true);
    handleStart({ targets: t, mindFileUrl: m });
  }, [handleStart]);

  // Logged-in user scan: own targets + public targets combined
  const handleUserScanReady = useCallback(({ targets: t, mindFileUrl: m }) => {
    setIsGuest(false);
    handleStart({ targets: t, mindFileUrl: m });
  }, [handleStart]);

  // Upload flow: navigate through goal-select → upload-type → setup/url-setup
  const handleGoalPrivate = useCallback(() => { setSelectedVisibility('private'); setAppView('upload-type'); }, []);
  const handleGoalPublic  = useCallback(() => { setSelectedVisibility('public');  setAppView('upload-type'); }, []);
  const handleUploadPhotoVideo = useCallback(() => { setAppView('setup'); }, []);
  const handleUploadPhotoUrl   = useCallback(() => { setAppView('url-setup'); }, []);

  if (videoOverlay) {
    return <VideoOverlay key={videoOverlay.src} src={videoOverlay.src} onDone={handleVideoOverlayDone} />;
  }
  if (showDiscLoading) {
    return <DiscLoadingOverlay onDone={handleDiscLoadingDone} />;
  }
  if (appView === 'splash') return <SplashScreen onDone={() => setAppView('hello')} />;
  if (appView === 'hello') return (
    <HelloScreen
      onCreateAccount={() => setAppView('signup')}
      onExisting={() => setAppView('signin')}
      onGuestScan={() => setAppView('guest-scan')}
    />
  );
  if (appView === 'guest-scan') return (
    <GuestScanScreen onReady={handleGuestReady} onBack={() => setAppView('hello')} />
  );
  if (appView === 'user-scan') return (
    <UserScanScreen onReady={handleUserScanReady} onBack={() => setAppView('home')} />
  );
  if (appView === 'signin') return <SignInScreen onSuccess={handleSignIn} onGoForgotPassword={() => setAppView('forgot')} />;
  if (appView === 'signup') return <SignUpScreen onSuccess={handleSignUp} onBack={() => setAppView('hello')} onOtpFail={handleOtpFail} />;
  if (appView === 'forgot') return <ForgotPasswordScreen onBack={() => setAppView('signin')} onSuccess={handleSignIn} />;
  if (appView === 'welcome') return <WelcomeScreen onDone={() => setAppView('home')} user={currentUser} />;
  if (appView === 'profile') return <ProfileScreen user={currentUser} onBack={() => setAppView('home')} />;
  if (appView === 'gallery') return <GalleryScreen onBack={() => setAppView('home')} />;
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
    <SetupScreen onStart={handleStart} onLaunchSaved={cloudTargets ? handleLaunchSaved : null}
      initialCards={initialCards} onSignOut={handleSignOut} user={currentUser}
      isPublic={selectedVisibility === 'public'} />
  );
  if (appView === 'home') return (
    <HomeScreen
      onScan={() => setAppView('user-scan')}
      onUpload={() => setAppView('goal-select')}
      onProfile={() => setAppView('profile')}
      onGallery={() => setAppView('gallery')}
      onSignOut={handleSignOut}
      user={currentUser}
    />
  );
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
