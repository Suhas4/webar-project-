import { useState, useCallback, useEffect, useRef } from 'react';
import ARScene from './components/ARScene.jsx';
import LoadingScreen from './components/LoadingScreen.jsx';
import SetupScreen from './components/SetupScreen.jsx';
import HelloScreen from './components/HelloScreen.jsx';
import SignInScreen from './components/SignInScreen.jsx';
import SignUpScreen from './components/SignUpScreen.jsx';
import WelcomeScreen from './components/WelcomeScreen.jsx';
import ForgotPasswordScreen from './components/ForgotPasswordScreen.jsx';
import HomeScreen from './components/HomeScreen.jsx';
import ProfileScreen from './components/ProfileScreen.jsx';
import GalleryScreen from './components/GalleryScreen.jsx';
import VideoOverlay from './components/VideoOverlay.jsx';
import DiscLoadingOverlay from './components/DiscLoadingOverlay.jsx';
import { loadTargets } from './hooks/useArStorage.js';

export default function App() {
  const hasToken = !!localStorage.getItem('memoera_token');

  const [appView, setAppView] = useState(() => hasToken ? 'home' : 'hello');
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
    setArStatus('idle'); setAppView('hello');
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
    handleStart({ targets: cloudTargets, mindFileUrl: cloudMindFileUrl });
  }, [cloudTargets, cloudMindFileUrl, handleStart]);

  if (videoOverlay) {
    return <VideoOverlay key={videoOverlay.src} src={videoOverlay.src} onDone={handleVideoOverlayDone} />;
  }
  if (showDiscLoading) {
    return <DiscLoadingOverlay onDone={handleDiscLoadingDone} />;
  }
  if (appView === 'hello') return <HelloScreen onCreateAccount={() => setAppView('signup')} onExisting={() => setAppView('signin')} />;
  if (appView === 'signin') return <SignInScreen onSuccess={handleSignIn} onGoForgotPassword={() => setAppView('forgot')} />;
  if (appView === 'signup') return <SignUpScreen onSuccess={handleSignUp} onBack={() => setAppView('hello')} onOtpFail={handleOtpFail} />;
  if (appView === 'forgot') return <ForgotPasswordScreen onBack={() => setAppView('signin')} onSuccess={handleSignIn} />;
  if (appView === 'welcome') return <WelcomeScreen onDone={() => setAppView('home')} user={currentUser} />;
  if (appView === 'profile') return <ProfileScreen user={currentUser} onBack={() => setAppView('home')} />;
  if (appView === 'gallery') return <GalleryScreen onBack={() => setAppView('home')} />;
  if (appView === 'setup') return (
    <SetupScreen onStart={handleStart} onLaunchSaved={cloudTargets ? handleLaunchSaved : null}
      initialCards={initialCards} onSignOut={handleSignOut} user={currentUser} />
  );
  if (appView === 'home') return (
    <HomeScreen
      onScan={handleLaunchSaved || (() => setAppView('setup'))}
      onUpload={() => setAppView('setup')}
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
      <LoadingScreen status={arStatus} errorMessage={errorMessage} onEdit={() => { setArStatus('idle'); setAppView('home'); }} />
    </div>
  );
}

function getAspectRatioLabel(h) {
  if (h<=0.57) return '16:9';
  if (h<=0.76) return '4:3';
  if (h<=1.01) return '1:1';
  return '9:16';
}
