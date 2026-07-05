import { useState, useRef, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext.jsx';
import { LANGUAGES, T } from '../config/translations.js';
import { takeWarmStream, getCameraPermissionState, markCameraConfirmed, hasConfirmedCameraThisSession } from '../hooks/cameraWarmup.js';
import CameraPermissionPrimer from './CameraPermissionPrimer.jsx';

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";

export default function HelloScreen({ onCreateAccount, onExisting, onGuestScan, errorMsg, onDismissError }) {
  const { lang, setLang } = useLanguage();
  const s = { ...T.en, ...(T[lang] || {}) };

  const [sheetOpen, setSheetOpen]     = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [showPermissionPrimer, setShowPermissionPrimer] = useState(false);
  const videoRef      = useRef(null);
  const streamRef      = useRef(null);
  const touchStartY   = useRef(0);
  const pendingOpenRef = useRef(null);

  // Auto-dismiss the guest-scan error toast after a few seconds
  useEffect(() => {
    if (!errorMsg) return;
    const t = setTimeout(() => onDismissError?.(), 4000);
    return () => clearTimeout(t);
  }, [errorMsg, onDismissError]);

  /* â”€â”€ Start rear camera for live background â”€â”€ */
  useEffect(() => {
    let cancelled = false;

    function attachStream(s) {
      if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
      markCameraConfirmed();
      streamRef.current = s;
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        videoRef.current.onloadedmetadata = () => { if (!cancelled) setCameraReady(true); };
        videoRef.current.play().catch(() => {});
      }
    }

    function requestCameraNow() {
      if (!navigator.mediaDevices?.getUserMedia) return;
      navigator.mediaDevices
        .getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280, max: 1920 }, height: { ideal: 720, max: 1080 } }, audio: false })
        .then(attachStream)
        .catch(() => {});
    }

    // 1. Try the pre-warmed stream first (zero wait, instant)
    const warm = takeWarmStream();
    if (warm) { attachStream(warm); }
    else {
      // 2. Warm stream not ready — wait 200 ms so the AR scanner fully releases
      //    the hardware camera before we open a new stream
      const t = setTimeout(async () => {
        // Try warm stream one more time (App.jsx starts it when appView='hello')
        const warm2 = takeWarmStream();
        if (warm2) { attachStream(warm2); return; }
        if (!navigator.mediaDevices?.getUserMedia) return;

        // Permission already granted in a past visit — no need to explain again,
        // just open the camera the way this screen always has.
        const state = await getCameraPermissionState();
        if (cancelled) return;
        if (state === 'granted' || hasConfirmedCameraThisSession()) {
          requestCameraNow();
        } else {
          // First time (or previously denied) — show the friendly primer first
          // instead of surprising the visitor with a native prompt out of nowhere.
          pendingOpenRef.current = requestCameraNow;
          setShowPermissionPrimer(true);
        }
      }, 200);
      return () => {
        cancelled = true;
        clearTimeout(t);
        streamRef.current?.getTracks().forEach((tk) => tk.stop());
        streamRef.current = null;
      };
    }

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  const handleAllowCamera = () => {
    setShowPermissionPrimer(false);
    pendingOpenRef.current?.();
  };

  /* â”€â”€ Swipe gesture for account sheet â”€â”€ */
  const handleTouchStart = (e) => { touchStartY.current = e.touches[0].clientY; };
  const handleTouchEnd   = (e) => {
    const dy = touchStartY.current - e.changedTouches[0].clientY;
    if (!sheetOpen && dy > 40) setSheetOpen(true);
    if (sheetOpen  && dy < -40) setSheetOpen(false);
  };

  return (
    <div
      style={st.screen}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes scanLine {
          0%   { transform: translateY(-130px); opacity: 0; }
          10%  { opacity: 0.8; }
          90%  { opacity: 0.6; }
          100% { transform: translateY(130px); opacity: 0; }
        }
        @keyframes swipeChevron {
          0%,100% { transform: translateY(0);    opacity: 0.4; }
          50%     { transform: translateY(-10px); opacity: 1;   }
        }
        @keyframes swipeChevron2 {
          0%,100% { transform: translateY(0);    opacity: 0.2; }
          50%     { transform: translateY(-10px); opacity: 0.7; }
        }
        @keyframes sheetGlow {
          0%,100% { box-shadow: 0 -8px 40px rgba(0,201,167,0.15); }
          50%     { box-shadow: 0 -8px 60px rgba(0,201,167,0.3);  }
        }
        @keyframes tapPulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(0,201,167,0.55), 0 4px 24px rgba(0,201,167,0.45); }
          50%     { box-shadow: 0 0 0 14px rgba(0,201,167,0), 0 4px 32px rgba(0,201,167,0.7); }
        }
        @keyframes helloFloat {
          0%,100% { transform: translateY(0); }
          50%      { transform: translateY(-5px); }
        }
        @keyframes helloGlow {
          0%,100% { box-shadow: 0 -8px 40px rgba(0,201,167,0.15), 0 0 0 0 rgba(0,201,167,0.3); }
          50%     { box-shadow: 0 -8px 60px rgba(0,201,167,0.35), 0 0 40px rgba(0,201,167,0.08); }
        }
        @keyframes scanRing {
          0%   { transform:scale(1);  opacity:0.6; }
          100% { transform:scale(1.8);opacity:0;   }
        }
      ` }} />

      {/* Live camera background */}
      <video
        ref={videoRef}
        autoPlay playsInline muted
        style={{ ...st.cameraFeed, opacity: cameraReady ? 1 : 0 }}
      />

      {/* Dark overlay so UI is readable */}
      <div style={st.overlay} />

      {/* Top bar: brand + language */}
      <div style={st.topBar}>
        <div style={st.brand}>
          <img src="/logo1.png" alt="Memoera" style={st.brandLogo} />
          <span style={st.brandName}>Memoera</span>
        </div>
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value)}
          style={st.langSelect}
        >
          {Object.entries(LANGUAGES).map(([k, v]) => (
            <option key={k} value={k} style={{ background: '#0a1a1f' }}>{v}</option>
          ))}
        </select>
      </div>

      {/* Centre: scanner box + TAP TO SCAN button */}
      <div style={st.scannerArea}>
        {/* Pulsing ring behind the viewfinder */}
        <div style={{ position:'absolute', width:300, height:300, borderRadius:24,
          border:'1.5px solid rgba(0,201,167,0.45)',
          animation:'scanRing 2.4s ease-out 0.2s infinite', pointerEvents:'none', zIndex:3 }} />
        <div style={{ position:'absolute', width:300, height:300, borderRadius:24,
          border:'1px solid rgba(0,153,204,0.3)',
          animation:'scanRing 2.4s ease-out 1.1s infinite', pointerEvents:'none', zIndex:3 }} />

        {/* Viewfinder box */}
        <div style={st.scannerBox}>
          <div style={{ ...st.corner, top: -4, left: -4,  borderTopColor: '#00C9A7', borderLeftColor: '#00C9A7',   borderTopWidth: 6, borderLeftWidth: 6,  borderTopLeftRadius: 16 }} />
          <div style={{ ...st.corner, top: -4, right: -4, borderTopColor: '#00C9A7', borderRightColor: '#00C9A7',  borderTopWidth: 6, borderRightWidth: 6, borderTopRightRadius: 16 }} />
          <div style={{ ...st.corner, bottom: -4, left: -4,  borderBottomColor: '#00C9A7', borderLeftColor: '#00C9A7',  borderBottomWidth: 6, borderLeftWidth: 6,  borderBottomLeftRadius: 16 }} />
          <div style={{ ...st.corner, bottom: -4, right: -4, borderBottomColor: '#00C9A7', borderRightColor: '#00C9A7', borderBottomWidth: 6, borderRightWidth: 6, borderBottomRightRadius: 16 }} />
          <div style={st.scanLine} />
        </div>

        <p style={st.scanText}>Point camera at a Memoera target</p>

        {/* Highlighted TAP TO SCAN button */}
        {onGuestScan && (
          <button
            onClick={onGuestScan}
            style={st.tapScanBtn}>
            <CameraIcon /> TAP TO SCAN
          </button>
        )}
      </div>

      {/* Guest-scan error toast */}
      {errorMsg && (
        <div onClick={() => onDismissError?.()} style={st.errorToast}>
          <span style={{ marginRight: 8 }}>⚠️</span>{errorMsg}
        </div>
      )}

      {/* Friendly camera permission primer — shown before the native prompt */}
      {showPermissionPrimer && (
        <CameraPermissionPrimer
          onAllow={handleAllowCamera}
          onDismiss={() => setShowPermissionPrimer(false)}
        />
      )}

      {/* Swipe-up indicator */}
      <div
        style={{ ...st.swipeHint, opacity: sheetOpen ? 0 : 1, pointerEvents: sheetOpen ? 'none' : 'auto' }}
        onClick={() => setSheetOpen(true)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <svg width="28" height="16" viewBox="0 0 28 16" fill="none"
            style={{ animation: 'swipeChevron 1.4s ease-in-out infinite' }}>
            <path d="M4 12 L14 4 L24 12" stroke="#00C9A7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <svg width="28" height="16" viewBox="0 0 28 16" fill="none"
            style={{ animation: 'swipeChevron2 1.4s ease-in-out 0.2s infinite' }}>
            <path d="M4 12 L14 4 L24 12" stroke="#00C9A7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <span style={st.swipeLabel}>Swipe up to Create Account</span>
      </div>

      {/* Dim backdrop */}
      {sheetOpen && <div style={st.backdrop} onClick={() => setSheetOpen(false)} />}

      {/* Bottom sheet */}
      <div style={{
        ...st.sheet,
        transform: sheetOpen ? 'translateY(0)' : 'translateY(100%)',
        animation: sheetOpen ? 'sheetGlow 3s ease-in-out infinite' : 'none',
      }}>
        <div style={st.handle} />
        <div style={st.sheetHeader}>
          <img src="/logo1.png" alt="Memoera" style={st.sheetLogo} />
          <div>
            <p style={st.sheetTitle}>Welcome to Memoera</p>
            <p style={st.sheetSub}>Your AR memory platform</p>
          </div>
        </div>
        <div style={st.sheetBtns}>
          <button style={st.createBtn}
            onClick={() => { setSheetOpen(false); setTimeout(onCreateAccount, 120); }}>
            {s.createAccount}
          </button>
          <button style={st.existingBtn}
            onClick={() => { setSheetOpen(false); setTimeout(onExisting, 120); }}>
            {s.existingAccount}
          </button>
        </div>
        <p style={st.sheetNote}>By continuing you agree to our Terms &amp; Privacy Policy</p>
      </div>
    </div>
  );
}

function CameraIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
      style={{ display:'inline-block', verticalAlign:'middle', marginRight:8 }}>
      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
  );
}

const st = {
  screen: {
    position: 'fixed', inset: 0, background: '#000',
    display: 'flex', flexDirection: 'column',
    overflow: 'hidden', userSelect: 'none',
  },

  /* Live camera */
  cameraFeed: {
    position: 'absolute', inset: 0,
    width: '100%', height: '100%',
    objectFit: 'cover', zIndex: 1,
    transition: 'opacity 0.5s ease',
  },
  overlay: {
    position: 'absolute', inset: 0,
    background: 'rgba(0,0,0,0.5)',
    zIndex: 2,
    pointerEvents: 'none', // purely visual — must not block taps on scanner area
  },

  /* Top bar */
  topBar: {
    position: 'relative', zIndex: 3,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '52px 20px 12px',
  },
  brand: { display: 'flex', alignItems: 'center', gap: 10 },
  brandLogo: { width: 36, height: 36, objectFit: 'contain', borderRadius: 8 },
  brandName: { color: '#fff', fontSize: 18, fontWeight: 700, fontFamily: FONT, letterSpacing: '0.02em' },
  langSelect: {
    border: '1px solid rgba(0,201,167,0.4)', borderRadius: 16, fontSize: 12,
    fontFamily: FONT, padding: '5px 22px 5px 10px', cursor: 'pointer', outline: 'none',
    color: 'rgba(255,255,255,0.85)', background: 'rgba(0,0,0,0.5)',
    backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
    WebkitAppearance: 'none', appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='rgba(255,255,255,0.6)'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center',
    maxWidth: 90,
  },

  /* Scanner */
  scannerArea: {
    flex: 1, position: 'relative', zIndex: 3,
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    gap: 24,
  },
  scannerBox: {
    width: 260, height: 260, position: 'relative',
    boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
    borderRadius: 12,
  },
  corner: {
    position: 'absolute', width: 45, height: 45,
    borderStyle: 'solid', borderWidth: 0, borderColor: 'transparent',
  },
  scanLine: {
    position: 'absolute', left: '5%', right: '5%', height: 2,
    background: 'linear-gradient(90deg, transparent, rgba(0,201,167,0.9) 50%, transparent)',
    animation: 'scanLine 2s ease-in-out infinite', zIndex: 5,
  },
  scanText: {
    color: '#fff', textAlign: 'center',
    fontSize: 14, lineHeight: 1.5, fontFamily: FONT,
    textShadow: '0 1px 4px rgba(0,0,0,0.8)',
    margin: 0, zIndex: 3,
  },

  /* Highlighted Tap to Scan button */
  tapScanBtn: {
    background: 'linear-gradient(135deg, #00C9A7 0%, #00E5CC 100%)',
    border: 'none', borderRadius: 50,
    color: '#040D0B', fontSize: 15, fontWeight: 800,
    fontFamily: FONT, padding: '16px 42px', cursor: 'pointer',
    letterSpacing: '0.08em', zIndex: 3,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    animation: 'tapPulse 2s ease-in-out infinite, helloFloat 3s ease-in-out infinite',
  },

  /* Guest-scan error toast */
  errorToast: {
    position: 'absolute', bottom: 100, left: 20, right: 20, zIndex: 8,
    background: 'rgba(20,0,0,0.75)', border: '1px solid rgba(255,90,90,0.4)',
    borderRadius: 14, padding: '12px 16px', color: '#fff', fontSize: 13,
    fontFamily: FONT, textAlign: 'center', cursor: 'pointer',
    backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
  },

  /* Swipe indicator */
  swipeHint: {
    zIndex: 3, flexShrink: 0,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
    paddingBottom: 36, cursor: 'pointer',
    transition: 'opacity 0.3s ease',
  },
  swipeLabel: {
    fontSize: 11, color: 'rgba(255,255,255,0.65)', fontFamily: FONT,
    letterSpacing: '0.16em', textTransform: 'uppercase',
  },

  backdrop: {
    position: 'fixed', inset: 0, zIndex: 10,
    background: 'rgba(0,0,0,0.4)',
    backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
  },

  sheet: {
    position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 20,
    background: 'linear-gradient(180deg, #0A1A20 0%, #061418 100%)',
    borderRadius: '28px 28px 0 0',
    padding: '10px 28px 44px',
    transition: 'transform 0.42s cubic-bezier(0.16, 1, 0.3, 1)',
  },
  handle: { width: 44, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.2)', margin: '0 auto 22px' },
  sheetHeader: { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 },
  sheetLogo:   { width: 44, height: 44, objectFit: 'contain', borderRadius: 10 },
  sheetTitle:  { fontSize: 18, fontWeight: 700, fontFamily: FONT, color: '#fff', margin: 0 },
  sheetSub:    { fontSize: 12, fontFamily: FONT, color: 'rgba(255,255,255,0.45)', margin: '2px 0 0' },
  sheetBtns:   { display: 'flex', flexDirection: 'column', gap: 14 },
  createBtn: {
    background: 'linear-gradient(135deg, #00C9A7, #00E5CC)',
    border: 'none', borderRadius: 50, fontSize: 15, fontWeight: 700,
    fontFamily: FONT, padding: '16px 24px', cursor: 'pointer',
    color: '#040D0B', letterSpacing: '0.06em',
    boxShadow: '0 4px 24px rgba(0,201,167,0.35)',
  },
  existingBtn: {
    background: '#fff', border: 'none', borderRadius: 50,
    fontSize: 15, fontWeight: 700, fontFamily: FONT,
    padding: '16px 24px', cursor: 'pointer',
    color: '#040D0B', letterSpacing: '0.06em',
    boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
  },
  sheetNote: {
    fontSize: 10, fontFamily: FONT, textAlign: 'center',
    color: 'rgba(255,255,255,0.3)', marginTop: 16, letterSpacing: '0.03em',
  },
};
