import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../context/LanguageContext.jsx';
import { LANGUAGES, T } from '../config/translations.js';
import { useTheme } from '../context/ThemeContext.jsx';
import { API_BASE } from '../config/api.js';
import { showRewardedAd, showBanner, removeBanner } from '../services/AdMobService.js';
import { useFestivalNotifications } from '../hooks/useFestivalNotifications.js';
import { playScanFeedback } from '../utils/feedback.js';

const AD_BONUS_KEY = 'memoera_ad_bonus_mb';
const AD_COOLDOWN_KEY = 'memoera_ad_last';
const AD_COOLDOWN_MS = 30 * 60 * 1000; // 30-min cooldown between ads

const COLLECTION_TOTAL = 93;

export default function HomeScreen({ onUpload, onGallery, onSettings, onPremium, onSignOut, onRefer, onCollection, onAdmin, onScan, user }) {
  const { lang, setLang } = useLanguage();
  const { theme, toggleTheme, colors } = useTheme();
  const tr = { ...T.en, ...(T[lang] || {}) };
  const whatsappUrl = "https://wa.me/918660418820";

  const [infoSlide,    setInfoSlide]    = useState(0);   // 0=About Us  1=Company Details
  const [infoExpanded, setInfoExpanded] = useState(false);
  const slideStartX  = useRef(0);
  const slideStartY  = useRef(0);
  const [adModalOpen,      setAdModalOpen]      = useState(false);
  const [storageAlert,     setStorageAlert]     = useState(null);
  const [storageDismissed, setStorageDismissed] = useState(false);
  const [notifOpen,  setNotifOpen]  = useState(false);
  const [notifs, setNotifs] = useState([
    { id: 1, icon: '🎉', title: 'Welcome to Memoera!', body: 'Start uploading your AR targets and bring memories to life.', time: 'Just now' },
    { id: 2, icon: '📸', title: 'Scan your first target', body: 'Point your camera at an uploaded image to trigger AR content.', time: '5 min ago' },
    { id: 3, icon: '👾', title: 'Free storage: 500 MB', body: 'You have 500 MB of free storage. Upgrade for more.', time: 'Today' },
  ]);

  // Festival greeting notifications from the backend
  const { festivalNotifs, unreadCount: festivalUnread, markRead: markFestivalRead } =
    useFestivalNotifications(user?.email);
  const [adWatching, setAdWatching] = useState(false);
  const [bonusMB, setBonusMB] = useState(() => parseInt(localStorage.getItem(AD_BONUS_KEY) || '0', 10));
  const [adMsg, setAdMsg] = useState('');

  // Fetch storage on mount and trigger upgrade prompt when >= 500 MB
  useEffect(() => {
    const token = localStorage.getItem('memoera_token');
    if (!token) return;
    fetch(API_BASE + '/api/storage', { headers: { Authorization: 'Bearer ' + token } })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        const totalBytes = (d.privateBytes || 0) + (d.publicBytes || 0);
        const LIMIT = 500 * 1024 * 1024;
        if (totalBytes >= LIMIT) setStorageAlert('full');
        else if (totalBytes >= LIMIT * 0.9) setStorageAlert('warning');
      })
      .catch(() => {});
  }, []);

  const handleWatchAd = useCallback(async () => {
    const last = parseInt(localStorage.getItem(AD_COOLDOWN_KEY) || '0', 10);
    const now = Date.now();
    if (now - last < AD_COOLDOWN_MS) {
      const mins = Math.ceil((AD_COOLDOWN_MS - (now - last)) / 60000);
      setAdMsg(`Please wait ${mins} min before watching another ad.`);
      return;
    }
    setAdWatching(true);
    setAdMsg('');
    // Show a real Google AdMob rewarded ad
    const reward = await showRewardedAd();
    if (reward !== null) {
      // User watched the ad and earned the reward
      const newBonus = bonusMB + 50;
      setBonusMB(newBonus);
      localStorage.setItem(AD_BONUS_KEY, String(newBonus));
      localStorage.setItem(AD_COOLDOWN_KEY, String(Date.now()));
      setAdMsg('+50 MB earned! Storage updated.');
    } else {
      setAdMsg('Ad not available right now. Try again later.');
    }
    setAdWatching(false);
  }, [bonusMB]);

  const isDark = theme === 'dark';

  // ── Pull-to-refresh ──────────────────────────────────────────────────────
  const contentRef    = useRef(null);
  const pullStartY    = useRef(-1);
  const pullDistRef   = useRef(0);
  const [pullDist,    setPullDist]    = useState(0);
  const [refreshing,  setRefreshing]  = useState(false);
  const PULL_THRESHOLD = 80;

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const onStart = (e) => {
      if (el.scrollTop === 0) pullStartY.current = e.touches[0].clientY;
    };
    const onMove = (e) => {
      if (pullStartY.current < 0) return;
      const raw = e.touches[0].clientY - pullStartY.current;
      if (raw > 0 && el.scrollTop === 0) {
        const d = Math.min(raw * 0.45, PULL_THRESHOLD + 24);
        pullDistRef.current = d;
        setPullDist(d);
        e.preventDefault();
      } else {
        pullStartY.current = -1;
        pullDistRef.current = 0;
        setPullDist(0);
      }
    };
    const onEnd = () => {
      if (pullDistRef.current >= PULL_THRESHOLD) {
        setRefreshing(true);
        setTimeout(() => window.location.reload(), 700);
      } else {
        setPullDist(0);
      }
      pullStartY.current = -1;
      pullDistRef.current = 0;
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove',  onMove,  { passive: false });
    el.addEventListener('touchend',   onEnd,   { passive: true });
    el.addEventListener('touchcancel',onEnd,   { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove',  onMove);
      el.removeEventListener('touchend',   onEnd);
      el.removeEventListener('touchcancel',onEnd);
    };
  }, []);

  // (preview canvas handles its own animation — see HomePreviewCanvas below)


  // Show AdMob banner while on home screen, remove when leaving
  useEffect(() => {
    showBanner();
    return () => { removeBanner(); };
  }, []);

  return (
    <div className="memoera-screen" style={{ ...styles.screen, background: colors.bg }}>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes homeFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
        @keyframes homeBrandGlow_${theme} {
          0%,100%{text-shadow:0 0 12px ${colors.accent}55}
          50%{text-shadow:0 0 26px ${colors.accent}cc,0 0 50px ${colors.accent}33}
        }
        @keyframes homeLogoGlow_${theme} {
          0%,100%{box-shadow:0 0 10px ${colors.accent}44}
          50%{box-shadow:0 0 22px ${colors.accent}aa,0 0 40px ${colors.accent}28}
        }
        @keyframes goldGlow {
          0%,100%{box-shadow:-4px 0 20px rgba(0,0,0,0.4),0 0 8px rgba(201,168,76,0.3)}
          50%{box-shadow:-4px 0 20px rgba(0,0,0,0.4),0 0 22px rgba(201,168,76,0.65),0 0 40px rgba(201,168,76,0.18)}
        }
        @keyframes adPulse_${theme} {
          0%,100%{box-shadow:0 0 0 0 ${colors.accent}66}
          50%{box-shadow:0 0 0 6px ${colors.accent}00}
        }
        @keyframes bannerScroll {
          0%{transform:translateX(100%)} 100%{transform:translateX(-100%)}
        }
        .nav-btn-hover:hover { background: rgba(201,168,76,0.12) !important; }
        .social-icon-hover:hover { filter: brightness(1.25) !important; transform: scale(1.08) !important; }

        @keyframes scanNavPulse {
          0%,100%{box-shadow:0 0 0 0 rgba(0,201,167,0.6)}
          50%{box-shadow:0 0 0 7px rgba(0,201,167,0)}
        }
        @keyframes ptr-spin {
          to { transform: rotate(360deg); }
        }

      ` }} />

      <div style={styles.watermark}>
        <img src="/logo.png" alt="" style={{ ...styles.watermarkImg, filter: isDark ? 'brightness(10) saturate(0)' : 'brightness(0) saturate(0)' }} />
      </div>

      {/* â"€â"€ Header — logo only â"€â"€ */}
      <div style={styles.header}>
        <div style={{ ...styles.logoCircle, animation: `homeLogoGlow_${theme} 3s ease-in-out infinite`, flexShrink: 0,
          background:'transparent', boxShadow:'0 0 0 2px rgba(0,201,167,0.35)' }}>
          <img src="/logo-icon.png" alt="Memoera" style={styles.logo} />
        </div>
      </div>

      {/* â"€â"€ Utility strip — dead-end right, fixed â"€â"€ */}
      <div style={{ ...styles.utilityStrip, background: isDark ? 'rgba(6,20,24,0.85)' : 'rgba(255,255,255,0.88)' }}>
        {/* Bell */}
        <button
          onClick={() => setNotifOpen(o => !o)}
          style={styles.utilityStripBtn}
        >
          <BellIcon size={22} color={colors.text} />
          {(notifs.length + festivalUnread) > 0 && (
            <span style={{ position: 'absolute', top: 4, right: 4, width: 7, height: 7, borderRadius: '50%', background: '#FF6B6B', border: `1.5px solid ${colors.bg}` }} />
          )}
        </button>

        <div style={{ ...styles.utilityStripDivider, background: colors.border }} />

        {/* Theme toggle */}
        <button onClick={toggleTheme} title="Toggle theme" style={styles.utilityStripBtn}>
          {theme === 'dark' ? <SunIcon size={18} color={colors.text} /> : <MoonIcon size={17} color={colors.text} />}
        </button>

        <div style={{ ...styles.utilityStripDivider, background: colors.border }} />

        {/* Language */}
        <select value={lang} onChange={(e) => setLang(e.target.value)}
          style={{ ...styles.utilityStripLang, color: colors.text, background: colors.surface }}>
          {Object.entries(LANGUAGES).map(([k, v]) => (
            <option key={k} value={k} style={{ background: colors.bgSolid, color: colors.text }}>{v}</option>
          ))}
        </select>

        <div style={{ ...styles.utilityStripDivider, background: colors.border }} />

        {/* Admin Panel — only visible to the admin email */}
        {user?.email === import.meta.env.VITE_ADMIN_EMAIL && onAdmin && (
          <>
            <div style={{ ...styles.utilityStripDivider, background: colors.border }} />
            <button onClick={onAdmin} title="Admin Panel" style={styles.utilityStripBtn}>
              <span style={{ fontSize:15 }}>⚙</span>
            </button>
          </>
        )}

        {/* Sign out */}
        <button onClick={onSignOut} title="Sign Out" style={styles.utilityStripBtn}>
          <PowerIcon color={colors.text} />
        </button>
      </div>

      {/* â"€â"€ Notification panel — dropdown from bell â"€â"€ */}
      {notifOpen && (
        <div style={{ position: 'fixed', top: 78, right: 58, width: 290, borderRadius: 16, zIndex: 25,
          background: colors.bgSolid, border: '1px solid ' + colors.border,
          boxShadow: '0 8px 32px rgba(0,0,0,0.35)', overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px 8px', borderBottom: '1px solid ' + colors.border,
            display: 'flex', alignItems: 'center', gap: 8 }}>
            <BellIcon size={20} color={colors.text} />
            <span style={{ fontSize: 14, fontWeight: 700, color: colors.text, fontFamily: FONT }}>
              Notifications {(notifs.length + festivalUnread) > 0 && <span style={{ fontSize: 11, background: '#FF6B6B', color: '#fff', borderRadius: 10, padding: '1px 6px', marginLeft: 4 }}>{notifs.length + festivalUnread}</span>}
            </span>
            <button onClick={() => setNotifOpen(false)}
              style={{ marginLeft: 'auto', background: 'transparent', border: 'none',
                color: colors.textMuted, fontSize: 16, cursor: 'pointer', padding: '0 2px' }}>✕</button>
          </div>
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {/* Festival greeting image cards — newest first */}
            {festivalNotifs.map((fn) => (
              <div key={fn.id}
                onClick={() => markFestivalRead(fn.id)}
                style={{ position: 'relative', cursor: 'pointer' }}>
                <img src={fn.image_url} alt={fn.festival_name}
                  style={{ width: '100%', display: 'block', maxHeight: 160, objectFit: 'cover' }} />
                {!fn.is_read && (
                  <span style={{ position: 'absolute', top: 8, right: 8, background: '#FF6B6B',
                    color: '#fff', fontSize: 9, fontWeight: 700, borderRadius: 8,
                    padding: '2px 7px', fontFamily: FONT }}>NEW</span>
                )}
                <div style={{ padding: '8px 14px 10px',
                  background: isDark ? 'rgba(0,201,167,0.07)' : 'rgba(0,201,167,0.05)',
                  borderBottom: '1px solid ' + colors.border }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#00C9A7', fontFamily: FONT }}>
                    🎉 Happy {fn.festival_name}!
                  </div>
                  <div style={{ fontSize: 10, color: colors.textMuted, fontFamily: FONT, marginTop: 2 }}>
                    {new Date(fn.created_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short' })}
                  </div>
                </div>
              </div>
            ))}

            {/* Regular app notifications */}
            {notifs.length === 0 && festivalNotifs.length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
                <div style={{ fontSize: 13, color: colors.textMuted, fontFamily: FONT }}>All caught up!</div>
              </div>
            ) : (
              notifs.map((n, i) => (
                <div key={n.id}
                  onClick={() => setNotifs(prev => prev.filter(x => x.id !== n.id))}
                  style={{ padding: '10px 16px',
                    borderBottom: i < notifs.length - 1 ? '1px solid ' + colors.border : 'none',
                    display: 'flex', gap: 12, alignItems: 'flex-start',
                    cursor: 'pointer', transition: 'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <span style={{ fontSize: 20, flexShrink: 0 }}>{n.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: colors.text, fontFamily: FONT }}>{n.title}</div>
                    <div style={{ fontSize: 11, color: colors.textMuted, fontFamily: FONT, marginTop: 2, lineHeight: 1.5 }}>{n.body}</div>
                  </div>
                  <span style={{ fontSize: 10, color: colors.textMuted, fontFamily: FONT, flexShrink: 0 }}>{n.time}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* â"€â"€ Storage upgrade alert â"€â"€ */}
      {storageAlert && !storageDismissed && (
        <div style={{
          margin: '0 16px 2px', borderRadius: 14, padding: '12px 16px',
          background: storageAlert === 'full'
            ? 'linear-gradient(135deg,rgba(255,80,80,0.18),rgba(255,120,60,0.12))'
            : 'linear-gradient(135deg,rgba(255,180,0,0.15),rgba(255,120,0,0.10))',
          border: `1px solid ${storageAlert === 'full' ? 'rgba(255,80,80,0.4)' : 'rgba(255,160,0,0.4)'}`,
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, zIndex: 1,
        }}>
          <span style={{ fontSize: 20, flexShrink: 0 }}>{storageAlert === 'full' ? 'ðŸ"´' : '🟡'}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: colors.text, fontFamily: FONT }}>
              {storageAlert === 'full' ? 'Storage Full — 500 MB Used' : 'Storage Almost Full'}
            </div>
            <div style={{ fontSize: 11, color: colors.textMuted, fontFamily: FONT, marginTop: 2 }}>
              {storageAlert === 'full'
                ? 'You cannot upload new targets. Upgrade to Premium for up to 2 GB.'
                : 'You have used 90%+ of your free 500 MB. Upgrade to keep uploading.'}
            </div>
          </div>
          <button onClick={onPremium} style={{
            background: `linear-gradient(135deg,${colors.accent || '#00C9A7'},${colors.accent || '#00C9A7'}cc)`,
            border: 'none', borderRadius: 20, color: '#000',
            fontSize: 11, fontWeight: 700, fontFamily: FONT,
            padding: '7px 13px', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap',
          }}>Upgrade</button>
          <button onClick={() => setStorageDismissed(true)} style={{
            background: 'transparent', border: 'none', color: colors.textMuted,
            fontSize: 16, cursor: 'pointer', padding: '0 2px', flexShrink: 0,
          }}>✕</button>
        </div>
      )}

      {/* ── Pull-to-refresh indicator ── */}
      {(pullDist > 8 || refreshing) && (
        <div style={{ position:'fixed', top:0, left:0, right:0, zIndex:50,
          display:'flex', flexDirection:'column', alignItems:'center',
          paddingTop: refreshing ? 14 : Math.max(0, pullDist - 30),
          pointerEvents:'none', transition: refreshing ? 'padding-top 0.3s ease' : 'none' }}>
          <div style={{ width:40, height:40, borderRadius:'50%',
            background: pullDist >= PULL_THRESHOLD || refreshing ? 'rgba(0,201,167,0.18)' : isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)',
            border: `2.5px solid ${pullDist >= PULL_THRESHOLD || refreshing ? '#00C9A7' : isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.15)'}`,
            display:'flex', alignItems:'center', justifyContent:'center',
            boxShadow: pullDist >= PULL_THRESHOLD || refreshing ? '0 0 18px rgba(0,201,167,0.5)' : 'none',
            transition:'background 0.2s, border 0.2s, box-shadow 0.2s' }}>
            <span style={{ fontSize:20, color: pullDist >= PULL_THRESHOLD || refreshing ? '#00C9A7' : isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.3)',
              display:'inline-block',
              transform: refreshing ? 'none' : `rotate(${Math.min((pullDist / PULL_THRESHOLD) * 180, 180)}deg)`,
              animation: refreshing ? 'ptr-spin 0.65s linear infinite' : 'none',
              transition: refreshing ? 'none' : 'transform 0.05s, color 0.2s' }}>↻</span>
          </div>
          {!refreshing && pullDist >= PULL_THRESHOLD && (
            <span style={{ marginTop:6, fontSize:10, color:'#00C9A7', fontFamily:'Outfit,sans-serif', fontWeight:700, letterSpacing:'0.05em' }}>
              Release to Refresh
            </span>
          )}
          {refreshing && (
            <span style={{ marginTop:6, fontSize:10, color:'#00C9A7', fontFamily:'Outfit,sans-serif', fontWeight:700, letterSpacing:'0.05em' }}>
              Refreshing…
            </span>
          )}
        </div>
      )}

      {/* ── Scrollable content ── */}
      <div ref={contentRef} className="memoera-content" style={styles.content}>

        {/* â"€â"€ Watch Ad modal â"€â"€ portaled to <body> (see review modal note below) */}
        {adModalOpen && createPortal(
          <div style={styles.adModalOverlay} onClick={() => !adWatching && setAdModalOpen(false)}>
            <div style={{ ...styles.adModal, background: colors.surface }} onClick={e => e.stopPropagation()}>
              <div style={styles.adModalIcon}>ðŸ"º</div>
              <div style={{ ...styles.adTitle, color: colors.text, textAlign:'center' }}>Watch Ad &amp; Earn Storage</div>
              <div style={{ ...styles.adSub, color: colors.textMuted, textAlign:'center', marginBottom:16 }}>
                Get +50 MB per ad Â· Bonus earned: <strong style={{ color: '#00C9A7' }}>{bonusMB} MB</strong>
              </div>
              <button onClick={handleWatchAd} disabled={adWatching} style={{
                ...styles.adBtn,
                opacity: adWatching ? 0.7 : 1,
              }}>
                {adWatching ? <><Spinner /> Watching...</> : 'Watch Ad Now'}
              </button>
              {adMsg && <p style={{ ...styles.adMsg, color: adMsg.startsWith('+') ? '#00C9A7' : colors.textMuted }}>{adMsg}</p>}
              {!adWatching && <button onClick={() => setAdModalOpen(false)} style={{ ...styles.adCloseBtn, color: colors.textMuted }}>Close</button>}
            </div>
          </div>,
          document.body
        )}

        {/* Greeting hero card */}
        <GreetingHero user={user} colors={colors} isDark={isDark} />

        {/* Demo video → then "How It Works" steps, in one combined card */}
        <DemoAndHowItWorksCard colors={colors} isDark={isDark} />

        {/* Animated "Happy Customers" reviews */}
        <HappyCustomersCard colors={colors} isDark={isDark} user={user} />

      </div>

      {/* â"€â"€ About Us (top) + Company Details (bottom) — portrait stacked â"€â"€ */}
      <div className="memoera-info-section" style={{ padding: '4px 80px 12px 16px', flexShrink: 0, zIndex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>

        {/* 1. About Us */}
        <div style={{ ...styles.card, background: colors.surface, border: '1px solid ' + colors.border, overflow: 'hidden' }}>
          <button
            onClick={() => setInfoSlide(infoSlide === 0 && infoExpanded ? -1 : 0) || setInfoExpanded(!(infoSlide === 0 && infoExpanded))}
            style={{ width: '100%', background: 'transparent', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 12px', fontFamily: FONT }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: infoExpanded && infoSlide === 0 ? '#00C9A7' : colors.text, transition: 'color 0.2s' }}>About Us</span>
            <span style={{ fontSize: 9, color: colors.textMuted, transition: 'transform 0.25s',
              transform: infoExpanded && infoSlide === 0 ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
          </button>
          {infoExpanded && infoSlide === 0 && (
            <div style={{ borderTop: '1px solid ' + colors.border, padding: '8px 12px 12px' }}>
              <p style={{ ...styles.cardText, color: colors.textMuted }}>
                We are dedicated to safeguarding your most cherished memories through advanced, secure digital storage
                solutions designed for modern life. Our mission is to ensure that your precious moments are preserved
                with a single touch.
              </p>
              <p style={{ ...styles.cardText, color: colors.textMuted, marginTop: 6 }}>
                Enhance your business with Smart Brochures. We prevent 1st Copy or Duplicate Products &amp; act as
                Mini Theft Protection.
              </p>
            </div>
          )}
        </div>

        {/* 2. Company Details */}
        <div style={{ ...styles.card, background: colors.surface, border: '1px solid ' + colors.border, overflow: 'hidden' }}>
          <button
            onClick={() => { setInfoSlide(1); setInfoExpanded(!(infoExpanded && infoSlide === 1)); }}
            style={{ width: '100%', background: 'transparent', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 12px', fontFamily: FONT }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: infoExpanded && infoSlide === 1 ? '#00C9A7' : colors.text, transition: 'color 0.2s' }}>Company Details</span>
            <span style={{ fontSize: 9, color: colors.textMuted, transition: 'transform 0.25s',
              transform: infoExpanded && infoSlide === 1 ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
          </button>
          {infoExpanded && infoSlide === 1 && (
            <div style={{ borderTop: '1px solid ' + colors.border, padding: '8px 12px 12px' }}>
              {[
                { label: 'Email',        value: 'memoerabangalore@gmail.com' },
                { label: 'Mobile',       value: '+91 8660418820' },
                { label: 'MD & Founder', value: 'Lohith B.' },
                { label: 'Website',      value: 'www.memoera.in', link: 'https://www.memoera.in' },
                { label: 'GSTIN',        value: '29AAUCM9420H1ZU' },
                { label: 'Privacy Policy', value: 'View Policy', link: '/privacy-policy.html' },
              ].map(({ label, value, link }) => (
                <div key={label} style={styles.detailRow}>
                  <span style={{ ...styles.detailLabel, color: colors.textMuted }}>{label}</span>
                  {link
                    ? <a href={link} target="_blank" rel="noreferrer"
                        style={{ ...styles.detailValue, color: '#00C9A7', textDecoration: 'none' }}>{value}</a>
                    : <span style={{ ...styles.detailValue, color: colors.text }}>{value}</span>
                  }
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* â"€â"€ Right-side nav bar â"€â"€ */}
      <div className="memoera-nav-bar" style={{ ...styles.navBar, background: colors.navBg }}>
        {onScan && <NavBtn icon={<ScanCameraIcon color="#00C9A7" />} label={tr.scan || 'Scan'} onClick={() => { playScanFeedback(); onScan(); }} />}
        <NavBtn icon={<PlusIcon    color={colors.navIcon} />} label={tr.upload}   onClick={onUpload} />
        <NavBtn icon={<GalleryIcon color={colors.navIcon} />} label={tr.gallery}  onClick={onGallery} />
        <NavBtn icon={<GearIcon    color={colors.navIcon} />} label={tr.settings} onClick={onSettings} />
        <NavBtn icon={<ReferIcon   color={colors.navIcon} />} label="Refer"       onClick={onRefer} />
        <NavBtn icon={<DiamondIcon />}                        label="Premium"     onClick={onPremium} />
      </div>

      {/* â"€â"€ Bottom bar â"€â"€ */}
      <div style={{ ...styles.bottomBar, borderTopColor: colors.border, background: colors.bottomBar }}>
        <div style={styles.socialRow}>
          <SocialLink href="https://www.instagram.com/memoerabangalore/" icon={<InstagramIcon />} />
          <SocialLink href="https://www.facebook.com/profile.php?id=61574312286741" icon={<FacebookIcon />} />
          <SocialLink href="https://www.youtube.com/@memoerabangalore" icon={<YouTubeIcon />} />
          <SocialLink href="https://x.com/Memo_Era" icon={<XIcon />} />
<a href={whatsappUrl} target="_blank" rel="noreferrer" style={styles.chatLink}>
            <WhatsAppIcon />
            <span style={{ ...styles.chatText, color: colors.text }}>Chat with us</span>
          </a>
        </div>
      </div>
    </div>
  );
}

/* ── Greeting hero ── */
function GreetingHero({ user, colors, isDark }) {
  const hour = new Date().getHours();
  const [greeting, emoji] = hour < 12
    ? ['Good Morning', '☀️']
    : hour < 17
    ? ['Good Afternoon', '⛅']
      : ['Good Evening', '🌙'];

  const name = user?.name || user?.username || 'there';

  return (
    <div>
      <style>{`
        @keyframes gh-fadein   { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        @keyframes gh-scanring { 0%{transform:scale(1);opacity:0.7} 100%{transform:scale(1.9);opacity:0} }
        @keyframes gh-scanring2{ 0%{transform:scale(1);opacity:0.45}100%{transform:scale(1.9);opacity:0} }
        @keyframes gh-pulse    { 0%,100%{box-shadow:0 0 0 0 rgba(0,201,167,0.5)} 50%{box-shadow:0 0 0 10px rgba(0,201,167,0)} }
        @keyframes gh-shimmer  { 0%{transform:translateX(-200%)skewX(-18deg)} 60%,100%{transform:translateX(200%)skewX(-18deg)} }
        @keyframes gh-dot      { 0%,100%{opacity:0.3;transform:scale(0.8)} 50%{opacity:1;transform:scale(1.3)} }
      `}</style>

      {/* Greeting text */}
      <div style={{ animation:'gh-fadein 0.6s ease both' }}>
        <div style={{ fontSize:11, fontWeight:600, color: colors.textMuted, fontFamily:FONT,
          letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:3 }}>
          {emoji} {greeting}
        </div>
        <div style={{ fontSize:20, fontWeight:800, color: colors.text, fontFamily:FONT,
          lineHeight:1.15 }}>
          Hello, <span style={{ color:'#00C9A7' }}>{name}</span>!
        </div>
        <div style={{ fontSize:11, color: colors.textMuted, fontFamily:FONT, marginTop:4 }}>
          Your AR world is ready. Point, scan, relive.
        </div>
      </div>

    </div>
  );
}

const HOW_STEPS = [
  { icon: '📤', title: 'Upload',  desc: 'Upload a photo, video, or 3D model as your AR target.' },
  { icon: '📱', title: 'Scan',    desc: 'Point your camera at the uploaded photo to detect it.' },
  { icon: '✨', title: 'Relive',  desc: 'Watch your memory come alive right on top of it!' },
];

// Two clips play back-to-back like a mini playlist (intro, then the
// upload-and-relive payoff), and once the last one ends — or after a
// timeout, for anyone who scrolls past without tapping play — the
// "How It Works" steps start cycling. One act follows the other, all in
// a single card instead of separate ones.
const VIDEO_PLAYLIST = ['/wings-to-memories.mp4', '/review-our-album.mp4'];

function DemoAndHowItWorksCard({ colors, isDark }) {
  const videoRef = useRef(null);
  const fallbackRef = useRef(null);
  const startedRef = useRef(false);
  const [videoIndex, setVideoIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const [active, setActive] = useState(0);

  const handlePlay = () => {
    if (fallbackRef.current) { clearTimeout(fallbackRef.current); fallbackRef.current = null; }
    startedRef.current = true;
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = 0;
    v.play();
    setPlaying(true);
  };

  const handleFullscreen = (e) => {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    if (!playing) handlePlay();
    // iOS Safari/WebView exposes fullscreen video via this method, not the
    // standard Fullscreen API (requestFullscreen on <video> isn't supported there).
    if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();
    else if (v.requestFullscreen) v.requestFullscreen();
    else if (v.webkitRequestFullscreen) v.webkitRequestFullscreen();
  };

  // Clips alternate forever once started — a continuous back-to-back loop
  // rather than stopping after one pass through the playlist.
  const handleEnded = () => {
    setVideoIndex((i) => (i + 1) % VIDEO_PLAYLIST.length);
  };

  // Advance to the next clip in the playlist automatically. `onPause` fires
  // the instant a clip ends (before `onEnded` advances the index), which
  // flips `playing` back to false — without resetting it here, the "tap to
  // play" overlay would reappear over each new clip even though it's
  // actually already playing underneath, making continuous playback look
  // like it stopped.
  useEffect(() => {
    if (!startedRef.current) return; // first clip waits for the user to tap play
    const v = videoRef.current;
    if (!v) return;
    v.load();
    v.play();
    setPlaying(true);
  }, [videoIndex]);

  // Fallback so the steps still play even if the video is never tapped.
  useEffect(() => {
    fallbackRef.current = setTimeout(() => setShowSteps(true), 6000);
    return () => { if (fallbackRef.current) clearTimeout(fallbackRef.current); };
  }, []);

  useEffect(() => {
    if (!showSteps) return;
    const id = setInterval(() => setActive((a) => (a + 1) % HOW_STEPS.length), 2400);
    return () => clearInterval(id);
  }, [showSteps]);

  return (
    <div style={{ borderRadius: 16, overflow: 'hidden', marginTop: 10,
      background: colors.surface, border: `1px solid ${colors.border}`,
      boxShadow: '0 4px 18px rgba(0,0,0,0.12)' }}>
      <style>{`
        @keyframes htu-pulseBadge { 0%,100%{opacity:0.6} 50%{opacity:1} }
        @keyframes htu-pop        { 0%{transform:scale(0.85);opacity:0.5} 100%{transform:scale(1);opacity:1} }
        @keyframes htu-ringGrow   { 0%{transform:scale(1);opacity:0.55} 100%{transform:scale(1.7);opacity:0} }
        @keyframes dv-playHover   { 0%,100%{transform:scale(1)} 50%{transform:scale(1.06)} }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px 0' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: colors.text, fontFamily: FONT }}>
          🎥 See Memoera in Action
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
          color: '#00C9A7', background: 'rgba(0,201,167,0.12)', border: '1px solid rgba(0,201,167,0.35)',
          borderRadius: 20, padding: '3px 9px', animation: 'htu-pulseBadge 1.8s ease-in-out infinite' }}>
          DEMO
        </span>
      </div>

      {/* Video */}
      <div style={{ position: 'relative', marginTop: 12, background: '#000',
        maxWidth: 220, marginLeft: 'auto', marginRight: 'auto', borderRadius: 12, overflow: 'hidden' }}>
        <video
          ref={videoRef}
          src={VIDEO_PLAYLIST[videoIndex]}
          playsInline
          controls={playing}
          preload="metadata"
          onPause={() => setPlaying(false)}
          onEnded={handleEnded}
          style={{ width: '100%', display: 'block', aspectRatio: '9 / 16', objectFit: 'cover', background: '#000' }}
        />
        {!playing && (
          <button onClick={handlePlay} aria-label="Play demo video" style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.28)', border: 'none', cursor: 'pointer', padding: 0,
          }}>
            <span style={{
              width: 52, height: 52, borderRadius: '50%',
              background: 'rgba(0,201,167,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 20px rgba(0,201,167,0.5)', animation: 'dv-playHover 2.2s ease-in-out infinite',
            }}>
              <span style={{ marginLeft: 4, width: 0, height: 0,
                borderStyle: 'solid', borderWidth: '9px 0 9px 15px',
                borderColor: 'transparent transparent transparent #04140f' }} />
            </span>
          </button>
        )}

        <button onClick={handleFullscreen} aria-label="View full screen" title="View full screen" style={{
          position: 'absolute', top: 8, right: 8, zIndex: 2,
          width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.25)', cursor: 'pointer', padding: 0,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2"
            strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M3 16v3a2 2 0 0 0 2 2h3" />
          </svg>
        </button>
      </div>

      <div style={{ padding: '10px 14px 0', textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: 12, color: colors.textMuted, fontFamily: FONT, lineHeight: 1.5 }}>
          Watch a photo come alive — this is what your guests will see.
        </p>
      </div>

      {/* Divider into "How It Works" */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px 0' }}>
        <div style={{ flex: 1, height: 1, background: colors.border }} />
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: colors.textMuted, fontFamily: FONT }}>
          HOW IT WORKS
        </span>
        <div style={{ flex: 1, height: 1, background: colors.border }} />
      </div>

      {/* Steps row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 18px 4px' }}>
        {HOW_STEPS.map((step, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', flex: i < HOW_STEPS.length - 1 ? 1 : 'none' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{ position: 'relative', width: 44, height: 44 }}>
                {active === i && (
                  <div style={{ position: 'absolute', inset: 0, borderRadius: '50%',
                    border: '2px solid #00C9A7', animation: 'htu-ringGrow 1.4s ease-out infinite' }} />
                )}
                <div key={active === i ? `on-${i}` : `off-${i}`} style={{
                  width: 44, height: 44, borderRadius: '50%', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', fontSize: 20,
                  background: active === i
                    ? 'linear-gradient(135deg,#00C9A7,#00E5CC)'
                    : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'),
                  boxShadow: active === i ? '0 4px 16px rgba(0,201,167,0.5)' : 'none',
                  transition: 'background 0.3s, box-shadow 0.3s',
                  animation: 'htu-pop 0.35s ease',
                }}>
                  {step.icon}
                </div>
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, fontFamily: FONT,
                color: active === i ? '#00C9A7' : colors.textMuted, transition: 'color 0.3s' }}>
                {step.title}
              </span>
            </div>
            {i < HOW_STEPS.length - 1 && (
              <div style={{ flex: 1, height: 2, margin: '0 6px 18px', borderRadius: 2,
                background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: active > i ? '100%' : '0%',
                  background: '#00C9A7', transition: 'width 0.5s ease' }} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Dynamic description */}
      <div style={{ padding: '6px 18px 14px', textAlign: 'center' }}>
        <p key={active} style={{ margin: 0, fontSize: 12, color: colors.textMuted, fontFamily: FONT,
          lineHeight: 1.5, animation: 'htu-pop 0.3s ease' }}>
          {HOW_STEPS[active].desc}
        </p>
      </div>

    </div>
  );
}

const CUSTOMER_REVIEWS = [
  { name: 'Ananya R.',   avatar: '👩',  rating: 5, text: 'Turned my wedding album into AR magic — guests still talk about it! Scanning the photos brings our videos to life instantly.' },
  { name: 'Rohit K.',    avatar: '👨',  rating: 5, text: 'Used it for my daughter\'s birthday invite. Everyone scanned the card and saw a cute animated video pop up. So unique!' },
  { name: 'Priya S.',    avatar: '👩‍🦱', rating: 5, text: 'As a print shop owner, this gave my brochures a wow factor my competitors don\'t have. Customers love it.' },
  { name: 'Arjun M.',    avatar: '🧑',  rating: 4, text: 'Super smooth scanning and the 3D model viewer is incredible. Great app for keeping memories alive.' },
  { name: 'Sneha P.',    avatar: '👩‍🦰', rating: 5, text: 'I uploaded old family photos with voice messages attached as video. My grandmother was moved to tears scanning them.' },
];

function HappyCustomersCard({ colors, isDark, user }) {
  const [active, setActive] = useState(0);
  const [reviews, setReviews] = useState(CUSTOMER_REVIEWS);
  const [readOpen, setReadOpen] = useState(false);
  const [writeOpen, setWriteOpen] = useState(false);
  const [myRating, setMyRating] = useState(5);
  const [myText, setMyText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState('');

  // The hardcoded CUSTOMER_REVIEWS are placeholder copy for a brand-new site
  // with no reviews yet — once real users have left reviews, only show
  // those, so the sample copy doesn't keep appearing next to genuine ones.
  const loadReviews = useCallback(() => {
    fetch(`${API_BASE}/api/reviews`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!data?.reviews?.length) return;
        const fetched = data.reviews.map(rv => ({
          name: rv.name, avatar: '🙂', photoUrl: rv.profilePhotoUrl || '', rating: rv.rating, text: rv.text,
        }));
        setReviews(fetched);
      })
      .catch(() => {});
  }, []);

  useEffect(() => { loadReviews(); }, [loadReviews]);

  // Manual navigation only (no auto-advance) — arrows below let the user read
  // a full review at their own pace instead of it flipping away mid-sentence.
  const goPrev = useCallback(() => setActive((a) => (a - 1 + reviews.length) % reviews.length), [reviews.length]);
  const goNext = useCallback(() => setActive((a) => (a + 1) % reviews.length), [reviews.length]);

  const r = reviews[active] || reviews[0];

  const handleSubmitReview = useCallback(async () => {
    const token = localStorage.getItem('memoera_token') || '';
    if (!token) { setSubmitMsg('Please sign in to write a review.'); return; }
    const text = myText.trim();
    if (!text) { setSubmitMsg('Please enter your review.'); return; }

    setSubmitting(true); setSubmitMsg('');
    try {
      const res = await fetch(`${API_BASE}/api/reviews/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ rating: myRating, text }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        setSubmitMsg(e.error || 'Failed to submit review.');
        setSubmitting(false); return;
      }
      setReviews(prev => [{ name: user?.name || user?.username || 'You', avatar: '🙂', photoUrl: user?.profilePhotoUrl || '', rating: myRating, text }, ...prev]);
      setActive(0);
      setMyText('');
      setWriteOpen(false);
      loadReviews();
    } catch {
      setSubmitMsg('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [myRating, myText, user, loadReviews]);

  return (
    <div style={{ borderRadius: 16, overflow: 'hidden', marginTop: 10,
      background: colors.surface, border: `1px solid ${colors.border}`,
      boxShadow: '0 4px 18px rgba(0,0,0,0.12)' }}>
      <style>{`
        @keyframes hc-pulseBadge { 0%,100%{opacity:0.6} 50%{opacity:1} }
        @keyframes hc-fadeIn     { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes hc-starPop    { 0%{transform:scale(0.4);opacity:0} 60%{transform:scale(1.15)} 100%{transform:scale(1);opacity:1} }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px 0' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: colors.text, fontFamily: FONT }}>
          💬 Happy Customers
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
          color: GOLD, background: 'rgba(201,168,76,0.14)', border: '1px solid rgba(201,168,76,0.4)',
          borderRadius: 20, padding: '3px 9px', animation: 'hc-pulseBadge 1.8s ease-in-out infinite' }}>
          ⭐ REVIEWS
        </span>
        <button onClick={() => { setWriteOpen(true); setSubmitMsg(''); }}
          aria-label="Write your own review"
          title="Write your own review"
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 0 2px 2px',
            fontSize: 13, lineHeight: 1, color: colors.textMuted, flexShrink: 0,
          }}>
          ✏️
        </button>
      </div>

      {/* Review card — full card width, so long reviews always wrap in full
          instead of being squeezed by side-by-side arrow buttons. Tap to
          open the full review in a half-screen reader. */}
      <div key={active} onClick={() => setReadOpen(true)} style={{ padding: '16px 18px 6px', animation: 'hc-fadeIn 0.35s ease', cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
            background: 'linear-gradient(135deg,#00C9A7,#00E5CC)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
            {r.photoUrl ? <img src={r.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : r.avatar}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: colors.text, fontFamily: FONT }}>
              {r.name}
            </div>
            <div style={{ fontSize: 12, letterSpacing: 1 }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <span key={i} style={{
                  color: i < r.rating ? GOLD : (isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.15)'),
                  animation: `hc-starPop 0.3s ease ${i * 0.06}s both`,
                }}>★</span>
              ))}
            </div>
          </div>
        </div>
        <p style={{ margin: 0, fontSize: 12.5, color: colors.textMuted, fontFamily: FONT,
          lineHeight: 1.6, fontStyle: 'italic', whiteSpace: 'normal', wordBreak: 'break-word',
          overflowWrap: 'anywhere', display: 'block', maxWidth: '100%', WebkitLineClamp: 'unset',
          WebkitBoxOrient: 'unset' }}>
          “{r.text}”
        </p>
      </div>

      {/* Prev/Next arrows + dot indicators, all in one row below the text —
          navigating never affects how wide the text is allowed to wrap. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '12px 0 14px' }}>
        <button onClick={goPrev} aria-label="Previous review" style={{
          width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
          border: '1.5px solid #00C9A7', cursor: 'pointer', background: 'rgba(0,201,167,0.1)',
          color: '#00C9A7', fontSize: 17, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>‹</button>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
          {reviews.map((_, i) => (
            <button key={i} onClick={() => setActive(i)} aria-label={`Review ${i + 1}`}
              style={{ width: i === active ? 18 : 6, height: 6, borderRadius: 4, border: 'none',
                cursor: 'pointer', padding: 0,
                background: i === active ? '#00C9A7' : (isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.15)'),
                transition: 'width 0.3s, background 0.3s' }} />
          ))}
        </div>

        <button onClick={goNext} aria-label="Next review" style={{
          width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
          border: '1.5px solid #00C9A7', cursor: 'pointer', background: 'rgba(0,201,167,0.1)',
          color: '#00C9A7', fontSize: 17, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>›</button>
      </div>

      {/* Write a review CTA */}
      <div style={{ padding: '4px 14px 14px' }}>
        <button onClick={() => { setWriteOpen(true); setSubmitMsg(''); }} style={{
          width: '100%', background: 'transparent', cursor: 'pointer', fontFamily: FONT,
          border: `1px dashed ${colors.border}`, borderRadius: 12, padding: '9px 0',
          fontSize: 12, fontWeight: 700, color: '#00C9A7',
        }}>
          ✍️ Share Your Experience
        </button>
      </div>

      {/* Half-screen review reader — tap a review to open it here instead of
          reading the compact card. Portaled to <body> for the same stacking
          reason as the write modal below. */}
      {readOpen && createPortal(
        <div onClick={() => setReadOpen(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: '100%', maxWidth: 420, height: '50vh', borderRadius: '24px 24px 0 0', padding: '20px 20px 28px',
            background: colors.bgSolid, display: 'flex', flexDirection: 'column', overflowY: 'auto', boxSizing: 'border-box',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
                background: 'linear-gradient(135deg,#00C9A7,#00E5CC)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
                {r.photoUrl ? <img src={r.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : r.avatar}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: colors.text, fontFamily: FONT }}>{r.name}</div>
                <div style={{ fontSize: 13, letterSpacing: 1 }}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <span key={i} style={{ color: i < r.rating ? GOLD : (isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.15)') }}>★</span>
                  ))}
                </div>
              </div>
              <button onClick={() => setReadOpen(false)} aria-label="Close" style={{
                background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 20,
                color: colors.textMuted, flexShrink: 0, padding: 4,
              }}>✕</button>
            </div>
            <p style={{ margin: 0, fontSize: 14, color: colors.text, fontFamily: FONT,
              lineHeight: 1.7, fontStyle: 'italic', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
              “{r.text}”
            </p>
          </div>
        </div>,
        document.body
      )}

      {/* Write-a-review modal — portaled to <body> so it always paints above
          sibling sections (e.g. About Us / Company Details), regardless of
          which nested stacking context it's authored in. */}
      {writeOpen && createPortal(
        <div onClick={() => !submitting && setWriteOpen(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: '100%', maxWidth: 420, height: '50vh', borderRadius: '24px 24px 0 0', padding: '20px 20px 28px',
            background: colors.bgSolid, display: 'flex', flexDirection: 'column', overflowY: 'auto', boxSizing: 'border-box',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 42, height: 42, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
                background: 'linear-gradient(135deg,#00C9A7,#00E5CC)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                {user?.profilePhotoUrl
                  ? <img src={user.profilePhotoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : '🙂'}
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: colors.text, fontFamily: FONT }}>
                  Share Your Experience
                </div>
                <div style={{ fontSize: 12, color: colors.textMuted, fontFamily: FONT }}>
                  Your review helps other users discover Memoera.
                </div>
              </div>
            </div>

            {/* Star picker */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <button key={i} onClick={() => setMyRating(i + 1)} style={{
                  background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, fontSize: 26,
                  color: i < myRating ? GOLD : (isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.15)'),
                }} aria-label={`${i + 1} star`}>★</button>
              ))}
            </div>

            <textarea value={myText} onChange={e => setMyText(e.target.value)} maxLength={500}
              placeholder="Tell us what you think…" rows={4} style={{
                width: '100%', resize: 'none', borderRadius: 12, padding: '10px 12px',
                background: colors.inputBg || colors.surface, border: `1px solid ${colors.inputBorder || colors.border}`,
                color: colors.text, fontFamily: FONT, fontSize: 13, boxSizing: 'border-box',
              }} />

            {submitMsg && (
              <p style={{ fontSize: 12, color: '#FF6B6B', fontFamily: FONT, marginTop: 8 }}>{submitMsg}</p>
            )}

            <button onClick={handleSubmitReview} disabled={submitting} style={{
              width: '100%', marginTop: 14, background: 'linear-gradient(135deg,#00C9A7,#00E5CC)',
              border: 'none', borderRadius: 50, color: '#040D0B', fontSize: 14, fontWeight: 700,
              fontFamily: FONT, padding: '12px', cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.7 : 1,
            }}>
              {submitting ? 'Submitting…' : 'Submit Review'}
            </button>
            <button onClick={() => setWriteOpen(false)} style={{
              width: '100%', marginTop: 8, background: 'transparent', border: 'none',
              fontSize: 13, fontFamily: FONT, color: colors.textMuted, cursor: 'pointer', padding: '6px',
            }}>
              Cancel
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function Spinner() {
  return <span style={{ display:'inline-block',width:14,height:14,border:'2px solid rgba(255,255,255,0.3)',
    borderTopColor:'#fff',borderRadius:'50%',animation:'spin 0.7s linear infinite',marginRight:6,
    verticalAlign:'middle' }} />;
}

function NavBtn({ icon, label, onClick, active }) {
  return (
    <button onClick={onClick} title={label} className="nav-btn-hover"
      style={{ ...styles.navBtn, ...(active ? styles.navBtnActive : {}) }}>
      {icon}
    </button>
  );
}
function SocialLink({ href, icon }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
      <div className="social-icon-hover" style={styles.socialIcon}>{icon}</div>
    </a>
  );
}

/* â"€â"€ Icons â"€â"€ */
function SunIcon({ size = 18, color = '#555' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  );
}
function ScanCameraIcon({ color = '#555' }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
  );
}
function MoonIcon({ size = 17, color = '#555' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  );
}
function BellIcon({ size = 20, color = '#555' }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>; }
function PowerIcon({ color = '#555' }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18.36 6.64A9 9 0 1 1 5.64 6.64"/><line x1="12" y1="2" x2="12" y2="12"/></svg>;
}
function PlusIcon({ color='#555' }) { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>; }
function GalleryIcon({ color='#555' }) { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>; }
function GearIcon({ color='#555' }) { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>; }
function ReferIcon({ color='#555' }) { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>; }
function DiamondIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 2 L22 10 L12 22 L2 10 Z" fill="#C9A84C" stroke="#C9A84C" strokeWidth="1"/><path d="M2 10 L12 10 L12 22 Z" fill="rgba(201,168,76,0.4)"/><path d="M12 10 L22 10 L12 22 Z" fill="rgba(201,168,76,0.7)"/></svg>; }
function CubeIcon({ color='#555' }) { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>; }
function ViewerIcon({ color='#555' }) { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/></svg>; }
function InstagramIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><defs><radialGradient id="ig-grad" cx="30%" cy="107%" r="150%"><stop offset="0%" stopColor="#fdf497"/><stop offset="5%" stopColor="#fdf497"/><stop offset="45%" stopColor="#fd5949"/><stop offset="60%" stopColor="#d6249f"/><stop offset="90%" stopColor="#285AEB"/></radialGradient></defs><rect x="2" y="2" width="20" height="20" rx="6" fill="url(#ig-grad)"/><circle cx="12" cy="12" r="4.5" stroke="#fff" strokeWidth="1.8" fill="none"/><circle cx="17.5" cy="6.5" r="1.2" fill="#fff"/></svg>; }
function FacebookIcon() { return <svg width="22" height="22" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#1877F2"/><path d="M15.5 8H13V6.5C13 5.67 13.67 5.5 14 5.5h1.5V3h-2C11.12 3 10 4.34 10 6v2H8v2.5h2V21h3v-10.5h2l.5-2.5z" fill="#fff"/></svg>; }
function YouTubeIcon() { return <svg width="22" height="22" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#FF0000"/><path d="M19.6 8.2s-.2-1.3-.8-1.9c-.7-.8-1.6-.8-2-.8C14.4 5.4 12 5.4 12 5.4s-2.4 0-4.8.1c-.4 0-1.3 0-2 .8-.6.6-.8 1.9-.8 1.9S4.2 9.6 4.2 11v1.3c0 1.4.2 2.8.2 2.8s.2 1.3.8 1.9c.7.8 1.7.7 2.2.8C8.8 18 12 18 12 18s2.4 0 4.8-.1c.4 0 1.3 0 2-.8.6-.6.8-1.9.8-1.9s.2-1.4.2-2.8V11c0-1.4-.2-2.8-.2-2.8zm-11 5.6V9.8l5.3 2-5.3 2z" fill="#fff"/></svg>; }
function XIcon() { return <svg width="22" height="22" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#000"/><path d="M17.5 3.5h2.8l-6 6.9 7.1 9.1h-5.5l-4.3-5.7-5 5.7H3.8l6.4-7.3L3.5 3.5h5.7l3.9 5.2 4.4-5.2zm-1 13.6h1.5L7.7 5h-1.6l10.4 12.1z" fill="#fff"/></svg>; }
function AdIcon({ color = '#555' }) { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="15" rx="2"/><polyline points="17 2 12 7 7 2"/><line x1="12" y1="12" x2="12" y2="17"/><line x1="9.5" y1="14.5" x2="14.5" y2="14.5"/></svg>; }
function WhatsAppIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="#25D366" style={{ marginRight: 6 }}><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>; }

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const GOLD = "#C9A84C";

const styles = {
  screen: { position:'fixed',inset:0,display:'flex',flexDirection:'column',fontFamily:FONT,overflow:'hidden' },
  watermark: { position:'fixed',bottom:-60,left:-40,width:'70vw',maxWidth:280,opacity:0.05,pointerEvents:'none',zIndex:0 },
  watermarkImg: { width:'100%' },

  header: { padding:'26px 16px 10px 16px',flexShrink:0,position:'relative',zIndex:1,
    display:'flex',alignItems:'center',
    animation:'homeFloat 6s ease-in-out infinite' },

  /* Fixed utility strip — dead-end right, horizontal row */
  utilityStrip: { position:'fixed',top:28,right:10,zIndex:15,
    display:'flex',flexDirection:'row',alignItems:'center',gap:0,
    background:'rgba(6,20,24,0.80)',
    backdropFilter:'blur(14px)',WebkitBackdropFilter:'blur(14px)',
    borderRadius:12,
    border:'1px solid rgba(201,168,76,0.3)',
    padding:'4px 6px' },
  utilityStripBtn: { background:'transparent',border:'none',cursor:'pointer',
    width:34,height:34,display:'flex',alignItems:'center',justifyContent:'center',
    borderRadius:8,position:'relative' },
  utilityStripDivider: { height:18,width:1,margin:'0 2px' },
  utilityStripLang: { border:'none',fontSize:10,fontFamily:FONT,padding:'3px 4px',
    cursor:'pointer',outline:'none',minWidth:58,maxWidth:80,textAlign:'center',borderRadius:6 },
  logoRow: { display:'flex',flexDirection:'column',alignItems:'center',gap:4 },
  logoCircle: { width:54,height:54,borderRadius:'50%',flexShrink:0,background:'#071C22',overflow:'hidden',
    display:'flex',alignItems:'center',justifyContent:'center',
    animation:'homeLogoGlow 3s ease-in-out infinite' },
  logo: { width:'78%',height:'78%',objectFit:'contain',objectPosition:'center',display:'block' },
  brandWrap: { display:'flex',flexDirection:'column' },
  brand: { fontSize:22,fontWeight:700,letterSpacing:'-0.3px',animation:'homeBrandGlow 3.5s ease-in-out infinite' },
  tagline: { fontSize:9,letterSpacing:'0.04em',lineHeight:1.3,whiteSpace:'nowrap' },
  iconCircleBtn: { width:32,height:32,borderRadius:'50%',border:'1px solid',background:'transparent',
    cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,flexShrink:0,padding:0 },
  langSelect: { border:'1px solid',borderRadius:16,fontSize:11,fontFamily:FONT,padding:'5px 10px',
    cursor:'pointer',outline:'none',flexShrink:0 },
  navLangSelect: { width:44,border:'1px solid',borderRadius:8,fontSize:9,fontFamily:FONT,
    padding:'4px 2px',cursor:'pointer',outline:'none',textAlign:'center',flexShrink:0 },

  content: { flex:1,padding:'0 80px 0 16px',overflowY:'auto',position:'relative',zIndex:1,
    display:'flex',flexDirection:'column',gap:10,paddingBottom:10 },

  /* Accordion cards */
  card: { borderRadius:12,overflow:'hidden',marginTop:4,
    boxShadow:'0 2px 10px rgba(0,0,0,0.15)' },
  accordionBtn: { width:'100%',background:'transparent',border:'none',
    display:'flex',justifyContent:'space-between',alignItems:'center',
    padding:'9px 14px',cursor:'pointer',fontFamily:FONT },
  accordionLabel: { fontSize:13,fontWeight:600 },
  accordionChevron: { fontSize:9,transition:'transform 0.25s ease' },
  accordionBody: { padding:'0 14px 10px',display:'flex',flexDirection:'column',gap:6 },
  cardText: { fontSize:11,lineHeight:1.6,margin:0 },
  detailRow: { display:'flex',justifyContent:'space-between',alignItems:'center',gap:4 },
  detailLabel: { fontSize:10,letterSpacing:'0.05em',textTransform:'uppercase',fontFamily:FONT },
  detailValue: { fontSize:11,fontFamily:FONT },

  /* Utility box */
  utilityBox: { display:'flex',alignItems:'center',border:'1px solid',borderRadius:14,
    padding:'4px 8px',gap:2,backdropFilter:'blur(10px)',WebkitBackdropFilter:'blur(10px)' },
  utilityBtn: { background:'transparent',border:'none',cursor:'pointer',padding:'5px 6px',
    display:'flex',alignItems:'center',justifyContent:'center',borderRadius:8 },
  utilityDivider: { width:1,height:14,background:'rgba(201,168,76,0.35)',flexShrink:0 },
  utilityLangSelect: { border:'none',fontSize:10,fontFamily:FONT,padding:'4px 2px',
    cursor:'pointer',outline:'none',maxWidth:65 },

  /* Ad modal */
  adModalOverlay: { position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',backdropFilter:'blur(4px)',
    zIndex:50,display:'flex',alignItems:'flex-end',justifyContent:'center' },
  adModal: { width:'100%',maxWidth:420,borderRadius:'24px 24px 0 0',padding:'24px 20px 40px',
    boxShadow:'0 -8px 40px rgba(0,0,0,0.4)' },
  adModalIcon: { fontSize:40,textAlign:'center',marginBottom:10 },
  adTitle: { fontSize:15,fontWeight:700,fontFamily:FONT,margin:'0 0 4px' },
  adSub: { fontSize:12,fontFamily:FONT,marginTop:2 },
  adBtn: { width:'100%',background:'linear-gradient(135deg,#00C9A7,#00E5CC)',border:'none',
    borderRadius:50,color:'#040D0B',fontSize:14,fontWeight:700,fontFamily:FONT,
    padding:'12px 20px',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:6 },
  adMsg: { fontSize:12,fontFamily:FONT,textAlign:'center',marginTop:8 },
  adCloseBtn: { width:'100%',background:'transparent',border:'none',fontSize:13,fontFamily:FONT,
    cursor:'pointer',marginTop:12,padding:'8px' },

  /* Announcement panel */
  announcementPanel: { position:'fixed',bottom:70,left:10,right:10,zIndex:20,
    borderRadius:16,padding:'14px 16px',border:'1px solid',
    backdropFilter:'blur(12px)',WebkitBackdropFilter:'blur(12px)',
    boxShadow:'0 8px 32px rgba(0,0,0,0.3)' },
  announcementTitle: { fontSize:14,fontWeight:700,fontFamily:FONT,marginBottom:10 },
  announcementItem: { fontSize:12,fontFamily:FONT,lineHeight:1.6,padding:'4px 0',
    borderBottom:'1px solid rgba(128,128,128,0.1)' },
  smallIconBtn: { width:36,height:36,borderRadius:10,border:'1px solid',background:'transparent',
    fontSize:18,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',
    flexShrink:0,padding:6 },
  announcementIconImg: { width:'100%',height:'100%',objectFit:'contain',
    filter:'brightness(0) invert(0.4)' },

  /* Nav */
  navBar: { position:'fixed',right:0,top:'50%',transform:'translateY(-50%)',
    borderRadius:'16px 0 0 16px',display:'flex',flexDirection:'column',alignItems:'center',
    padding:'10px 6px',gap:2,border:'2px solid '+GOLD,borderRight:'none',zIndex:10,
    backdropFilter:'blur(20px)',WebkitBackdropFilter:'blur(20px)',
    animation:'goldGlow 3s ease-in-out infinite' },
  navBtn: { background:'transparent',border:'none',borderRadius:10,padding:'8px',
    cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',
    width:46,transition:'background 0.2s,filter 0.2s' },
  navBtnActive: { background:'rgba(201,168,76,0.18)',filter:'drop-shadow(0 0 6px rgba(201,168,76,0.6))' },

  /* Bottom */
  bottomBar: { padding:'10px 16px 20px',flexShrink:0,
    borderTop:'1px solid',position:'relative',zIndex:1,
    backdropFilter:'blur(10px)',WebkitBackdropFilter:'blur(10px)' },
  socialRow: { display:'flex',alignItems:'center',gap:10,flexWrap:'wrap' },
  socialIcon: { width:38,height:38,borderRadius:10,display:'flex',alignItems:'center',
    justifyContent:'center',overflow:'hidden',transition:'filter 0.2s,transform 0.2s' },
  chatLink: { textDecoration:'none',display:'inline-flex',alignItems:'center',marginLeft:'auto' },
  chatText: { fontSize:13,fontFamily:FONT,fontWeight:500 },

  /* Ad bottom button */
  adBottomBtn: { display:'inline-flex',alignItems:'center',background:'linear-gradient(135deg,#00C9A7,#00E5CC)',
    border:'none',borderRadius:20,color:'#040D0B',fontSize:12,fontWeight:700,fontFamily:FONT,
    padding:'7px 14px',cursor:'pointer',flexShrink:0,whiteSpace:'nowrap' },
};
