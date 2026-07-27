import { useEffect, useRef, useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import ARGlbScreen from './ARGlbScreen.jsx';
import AnimationArOverlay from './AnimationArOverlay.jsx';
import BusinessDetailsOverlay from './BusinessDetailsOverlay.jsx';
import { loadAnimationById } from '../hooks/usePhotoAnimations.js';
import { API_BASE } from '../config/api.js';

// The AR scanner runs inside an iframe backed by a plain WebView with no
// PDF renderer, so a raw window.open() to a PDF just downloads it instead
// of previewing it. Opening it in Chrome Custom Tabs (native) reuses
// Chrome's own PDF viewer for an inline preview, and its download button
// gives the user a real "where to save" picker instead of a silent fetch.
function openExternalLink(url) {
  if (Capacitor.isNativePlatform()) {
    Browser.open({ url }).catch(() => { window.open(url, '_blank', 'noopener'); });
  } else {
    window.open(url, '_blank', 'noopener');
  }
}

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const TEAL = "#00C9A7";

// Transfers mind data to the AR iframe via postMessage instead of localStorage,
// which avoids cross-origin blob URL restrictions and localStorage quota limits.
export default function ARScannerScreen({ targets, mindFileUrl, onBack }) {
  const [error, setError]         = useState('');
  const [iframeKey, setIframeKey] = useState(0); // increment to force iframe reload
  const [spaceGlbUrl, setSpaceGlbUrl] = useState(null);
  const [spaceGlbEffect, setSpaceGlbEffect] = useState('popIn');
  const [animOverlay, setAnimOverlay] = useState(null); // { title, frames }
  const [businessOverlay, setBusinessOverlay] = useState(null); // { status: 'loading'|'ready'|'unavailable', details }
  const [reportToast, setReportToast] = useState(null); // brief confirmation text — reporting, liking/saving, or sharing content
  const iframeRef      = useRef(null);
  const bufferRef      = useRef(null);
  const targetsRef     = useRef(targets);
  const lastCloseRef   = useRef(0); // timestamp of most-recent "Scan Again" close

  useEffect(() => { targetsRef.current = targets; }, [targets]);

  // Push ArrayBuffer + targets to the iframe when it signals it's ready.
  // Also forwards the last close-time so the new iframe keeps its cooldown.
  const sendData = useCallback(() => {
    const iframe = iframeRef.current;
    const buf    = bufferRef.current;
    if (!iframe?.contentWindow || !buf) return;
    iframe.contentWindow.postMessage(
      {
        type:          'ar-mind-data',
        mindBuffer:    buf,
        targets:       targetsRef.current || [],
        lastCloseTime: lastCloseRef.current,  // carry cooldown across reloads
      },
      '*'
    );
  }, []);

  // Fetch mind file once as an ArrayBuffer (fresh blob URL, never revoked yet).
  // The iframe mounts immediately (camera shows right away) — once the buffer
  // is ready we push it through, whether the iframe announced itself first or not.
  useEffect(() => {
    let cancelled = false;
    async function prepare() {
      try {
        const res = await fetch(mindFileUrl);
        if (!res.ok) throw new Error('fetch failed');
        bufferRef.current = await res.arrayBuffer();
        if (!cancelled) sendData();
      } catch {
        if (!cancelled) setError('Failed to prepare AR scanner. Please try again.');
      }
    }
    prepare();
    return () => { cancelled = true; };
  }, [mindFileUrl, sendData]);

  useEffect(() => {
    const handler = (e) => {
      if (e.data?.type === 'ar-scanner-back') onBack();
      if (e.data?.type === 'ar-iframe-ready') sendData();
      if (e.data?.type === 'ar-scan-again') {
        lastCloseRef.current = Date.now(); // remember when the user closed
        setAnimOverlay(null);
        setBusinessOverlay(null);
        setIframeKey(k => k + 1);
      }
      if (e.data?.type === 'ar-view-in-space' && e.data?.glbUrl) {
        setSpaceGlbUrl(e.data.glbUrl);
        setSpaceGlbEffect(e.data.animationEffect || 'popIn');
      }
      if (e.data?.type === 'ar-open-link' && e.data?.url) {
        openExternalLink(e.data.url);
      }
      if (e.data?.type === 'ar-animation-triggered' && e.data?.animId) {
        const animId = e.data.animId;
        const label  = e.data.label || '';
        loadAnimationById(animId).then((anim) => {
          if (anim?.frames?.length) setAnimOverlay({ title: anim.name || label, frames: anim.frames });
        }).catch(() => {});
      }
      if (e.data?.type === 'ar-animation-lost') {
        // keep overlay visible so user can keep scrubbing
      }
      if (e.data?.type === 'ar-report-target' && e.data?.targetId) {
        fetch(`${API_BASE}/api/targets/report`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetId: e.data.targetId, reason: 'Reported from AR scanner' }),
        })
          .then(res => setReportToast(res.ok ? 'Thanks — content reported for review.' : "Couldn't submit report. Please try again."))
          .catch(() => setReportToast("Couldn't submit report. Please try again."));
        setTimeout(() => setReportToast(null), 3500);
      }
      if ((e.data?.type === 'ar-like-target' || e.data?.type === 'ar-save-target') && e.data?.targetId) {
        const kind = e.data.type === 'ar-like-target' ? 'like' : 'save';
        const token = localStorage.getItem('memoera_token');
        if (!token) {
          setReportToast('Sign in to ' + kind + ' this.');
          setTimeout(() => setReportToast(null), 3500);
          return;
        }
        const active = !!e.data.active;
        fetch(`${API_BASE}/api/targets/interaction`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify({ targetId: e.data.targetId, kind, active }),
        })
          .then((res) => {
            if (!res.ok) { setReportToast("Couldn't " + kind + " this — please try again."); setTimeout(() => setReportToast(null), 3500); return; }
            if (active) {
              setReportToast(kind === 'save' ? 'Saved! Find it under Saved on Home.' : 'Liked! Find it under Liked on Home.');
              setTimeout(() => setReportToast(null), 3500);
            }
          })
          .catch(() => { setReportToast("Couldn't " + kind + " this — please try again."); setTimeout(() => setReportToast(null), 3500); });
      }
      if (e.data?.type === 'ar-buy-now' && e.data?.targetId) {
        setBusinessOverlay({ status: 'loading', details: null });
        fetch(`${API_BASE}/api/business/by-target?targetId=${e.data.targetId}`)
          .then(async (res) => {
            if (!res.ok) { setBusinessOverlay({ status: 'unavailable', details: null }); return; }
            const details = await res.json();
            setBusinessOverlay({ status: 'ready', details });
          })
          .catch(() => setBusinessOverlay({ status: 'unavailable', details: null }));
      }
      if (e.data?.type === 'ar-share-target') {
        const label = e.data.label || 'this memory';
        const text  = `Check out "${label}" on Memoera!`;
        const url   = 'https://memoera.in';
        (async () => {
          if (navigator.share) {
            try { await navigator.share({ title: 'Memoera', text, url }); return; } catch { /* user cancelled or unsupported — fall through */ }
          }
          try {
            await navigator.clipboard.writeText(`${text} ${url}`);
            setReportToast('Link copied!');
          } catch {
            setReportToast("Couldn't share — please try again.");
          }
          setTimeout(() => setReportToast(null), 3500);
        })();
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onBack, sendData]);

  if (error) {
    return (
      <div style={{ position:'fixed', inset:0, background:'#040D0B', zIndex:200,
        display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16, padding:32 }}>
        <button onClick={onBack} style={{ position:'fixed', top:48, left:16, background:'transparent',
          border:'none', color:'rgba(255,255,255,0.7)', fontSize:14, fontWeight:600, fontFamily:FONT,
          cursor:'pointer', padding:'6px 4px', zIndex:2 }}>
          ← Back
        </button>
        <div style={{ fontSize:40 }}>⚠️</div>
        <p style={{ color:'#fff', fontFamily:FONT, fontSize:15, textAlign:'center' }}>{error}</p>
        <button onClick={onBack} style={{ background:TEAL, border:'none', borderRadius:50,
          color:'#040D0B', fontFamily:FONT, fontSize:14, fontWeight:700, padding:'12px 28px', cursor:'pointer' }}>
          ← Go Back
        </button>
      </div>
    );
  }

  // MindAR is the only scan engine now — the experimental capture-then-match
  // ('capture') and legacy ('jsfeat') engines were retired since they never
  // reliably matched targets. See the migration in SettingsScreen.jsx.
  // ar-scanner.html is a static asset the desktop/mobile browser cache can
  // hold onto indefinitely (no ETag/Last-Modified from the dev server, so
  // there's nothing for it to revalidate against) — a bare '/ar-scanner.html'
  // src risks silently serving a stale, already-fixed-in-source copy of this
  // file forever. Cache-bust with the same build stamp shown at the bottom
  // of the file's own error screen so "is this actually the new build?" is
  // answerable from a screenshot alone. Bump SCANNER_BUILD (and the matching
  // stamp in ar-scanner.html) whenever that file changes.
  const SCANNER_BUILD = '2026-07-26-1';
  const scannerSrc = `/ar-scanner.html?v=${SCANNER_BUILD}`;

  return (
    <div style={{ position:'fixed', inset:0, background:'#000', zIndex:200 }}>
      <iframe
        key={iframeKey}
        ref={iframeRef}
        src={scannerSrc}
        title="Memoera AR Scanner"
        allow="camera; autoplay; accelerometer; gyroscope"
        style={{ position:'absolute', inset:0, width:'100%', height:'100%', border:'none', display:'block' }}
      />
      {spaceGlbUrl && (
        <ARGlbScreen glbUrl={spaceGlbUrl} effect={spaceGlbEffect} onBack={onBack} />
      )}
      {animOverlay && (
        <AnimationArOverlay
          title={animOverlay.title}
          frames={animOverlay.frames}
          onClose={() => {
            setAnimOverlay(null);
            lastCloseRef.current = Date.now();
            setIframeKey(k => k + 1);
          }}
        />
      )}
      {businessOverlay && (
        <BusinessDetailsOverlay
          status={businessOverlay.status}
          details={businessOverlay.details}
          onClose={() => setBusinessOverlay(null)}
        />
      )}
      {reportToast && (
        <div style={{
          position: 'absolute', left: '50%', bottom: 90, transform: 'translateX(-50%)',
          zIndex: 10050, background: 'rgba(0,0,0,0.85)', color: '#fff',
          fontFamily: FONT, fontSize: 13, padding: '10px 18px', borderRadius: 20,
          border: `1px solid ${TEAL}55`, whiteSpace: 'nowrap',
        }}>
          {reportToast}
        </div>
      )}
    </div>
  );
}
