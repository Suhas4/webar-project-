import { useState, useCallback, useEffect, useRef } from 'react';
import ARScene from './components/ARScene.jsx';
import LoadingScreen from './components/LoadingScreen.jsx';
import SetupScreen from './components/SetupScreen.jsx';
import SplashScreen from './components/SplashScreen.jsx';
import SignInScreen from './components/SignInScreen.jsx';
import SignUpScreen from './components/SignUpScreen.jsx';
import WelcomeScreen from './components/WelcomeScreen.jsx';
import ForgotPasswordScreen from './components/ForgotPasswordScreen.jsx';
import { loadTargets } from './hooks/useArStorage.js';

/**
 * App — Root component.
 *
 * Views:
 *   'splash'  → SplashScreen (2.5s auto-advance)
 *   'signin'  → SignInScreen
 *   'signup'  → SignUpScreen
 *   'welcome' → WelcomeScreen (2s auto-advance after login)
 *   'setup'   → SetupScreen (upload marker images + videos)
 *   'ar'      → Live AR camera view
 */
export default function App() {
  // ── Determine initial view ────────────────────────────────────────────────────
  // If a valid token exists, skip auth and go straight to setup.
  // Otherwise always play the splash video before signin.
  const hasToken = !!localStorage.getItem('memoera_token');

  const [appView, setAppView] = useState(() => {
    if (hasToken) return 'setup';
    return 'splash';
  });
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const stored = localStorage.getItem('memoera_user');
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });

  // ── Sign-up success message (passed from SignUp → SignIn) ─────────────────────
  const [signUpSuccessMsg, setSignUpSuccessMsg] = useState('');

  // ── AR status (for LoadingScreen) ────────────────────────────────────────────
  const [arStatus, setArStatus] = useState('idle');
  const [errorMessage, setErrorMessage] = useState('');

  // ── Runtime AR assets ────────────────────────────────────────────────────────
  const [targets, setTargets] = useState(null);
  const [mindFileUrl, setMindFileUrl] = useState(null);

  // ── Pre-populated setup cards (from IndexedDB) ────────────────────────────────
  const [initialCards, setInitialCards] = useState(null);

  // ── Blob URL tracking ─────────────────────────────────────────────────────────
  const activeBlobUrlsRef = useRef([]);

  // ── Load persisted assets on mount ───────────────────────────────────────────
  useEffect(() => {
    async function restoreFromStorage() {
      try {
        const { targets: storedTargets, mindFileUrl: storedMindUrl, hasData, imagePreviewUrls } =
          await loadTargets();

        if (!hasData) return;

        activeBlobUrlsRef.current = [
          storedMindUrl,
          ...storedTargets.map((t) => t.videoUrl).filter(Boolean),
          ...imagePreviewUrls,
        ].filter(Boolean);

        const cards = storedTargets.map((t, i) => ({
          label: t.label || `Target ${i + 1}`,
          imageFile: t._imageBlob ? new File([t._imageBlob], `image-${i}.jpg`, { type: 'image/jpeg' }) : null,
          imagePreviewUrl: t._imagePreviewUrl || null,
          videoFile: t._videoBlob ? new File([t._videoBlob], `video-${i}.mp4`, { type: 'video/mp4' }) : null,
          videoName: t._videoBlob ? `video-${i}.mp4` : null,
          videoSize: t._videoBlob ? formatFileSize(t._videoBlob.size) : null,
          aspectRatio: getAspectRatioLabel(t.planeHeight),
        }));

        setInitialCards(cards);
      } catch (err) {
        console.warn('[App] Failed to restore from IndexedDB:', err);
      }
    }

    restoreFromStorage();

    return () => {
      activeBlobUrlsRef.current.forEach((url) => {
        try { URL.revokeObjectURL(url); } catch (_) {}
      });
    };
  }, []);

  // ── Auth handlers ─────────────────────────────────────────────────────────────

  const handleSplashDone = useCallback(() => {
    setAppView('signin');
  }, []);

  const handleSignIn = useCallback((user) => {
    setCurrentUser(user);
    setSignUpSuccessMsg('');
    setAppView('welcome');
  }, []);

  const handleSignUp = useCallback((successMessage) => {
    setSignUpSuccessMsg(successMessage);
    setAppView('signin');
  }, []);

  const handleGoSignUp = useCallback(() => {
    setSignUpSuccessMsg('');
    setAppView('signup');
  }, []);

  const handleGoForgotPassword = useCallback(() => {
    setAppView('forgot');
  }, []);

  const handleForgotPasswordSuccess = useCallback((user) => {
    setCurrentUser(user);
    setAppView('welcome');
  }, []);

  const handleGoSignIn = useCallback(() => {
    setAppView('signin');
  }, []);

  const handleWelcomeDone = useCallback(() => {
    setAppView('setup');
  }, []);

  const handleSignOut = useCallback(() => {
    localStorage.removeItem('memoera_token');
    localStorage.removeItem('memoera_user');
    setCurrentUser(null);
    setTargets(null);
    setMindFileUrl(null);
    setInitialCards(null);
    setArStatus('idle');
    setAppView('signin');
  }, []);

  // ── AR handlers ───────────────────────────────────────────────────────────────

  const handleStatusChange = useCallback((status, message = '') => {
    setArStatus(status);
    if (message) setErrorMessage(message);
  }, []);

  const handleStart = useCallback(({ targets: newTargets, mindFileUrl: newMindUrl }) => {
    activeBlobUrlsRef.current.forEach((url) => {
      try { URL.revokeObjectURL(url); } catch (_) {}
    });

    activeBlobUrlsRef.current = [
      newMindUrl,
      ...newTargets.map((t) => t.videoUrl).filter(Boolean),
    ].filter(Boolean);

    setTargets(newTargets);
    setMindFileUrl(newMindUrl);
    setArStatus('idle');
    setErrorMessage('');
    setAppView('ar');
  }, []);

  const handleEditTargets = useCallback(() => {
    setArStatus('idle');
    setAppView('setup');
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────────

  if (appView === 'splash') {
    return <SplashScreen onDone={handleSplashDone} />;
  }

  if (appView === 'signin') {
    return (
      <SignInScreen
        onSuccess={handleSignIn}
        onGoSignUp={handleGoSignUp}
        onGoForgotPassword={handleGoForgotPassword}
        successMessage={signUpSuccessMsg}
      />
    );
  }

  if (appView === 'forgot') {
    return (
      <ForgotPasswordScreen
        onBack={handleGoSignIn}
        onSuccess={handleForgotPasswordSuccess}
      />
    );
  }

  if (appView === 'signup') {
    return (
      <SignUpScreen
        onSuccess={handleSignUp}
        onGoSignIn={handleGoSignIn}
      />
    );
  }

  if (appView === 'welcome') {
    return <WelcomeScreen onDone={handleWelcomeDone} user={currentUser} />;
  }

  if (appView === 'setup') {
    return (
      <SetupScreen
        onStart={handleStart}
        initialCards={initialCards}
        onSignOut={handleSignOut}
        user={currentUser}
      />
    );
  }

  // AR view
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <ARScene
        targets={targets}
        mindFileUrl={mindFileUrl}
        onStatusChange={handleStatusChange}
      />
      <LoadingScreen
        status={arStatus}
        errorMessage={errorMessage}
        onEdit={handleEditTargets}
      />
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getAspectRatioLabel(planeHeight) {
  if (planeHeight <= 0.57) return '16:9';
  if (planeHeight <= 0.76) return '4:3';
  if (planeHeight <= 1.01) return '1:1';
  return '9:16';
}
