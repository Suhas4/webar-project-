import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../context/LanguageContext.jsx';
import { LANGUAGES } from '../config/translations.js';
import { useTheme } from '../context/ThemeContext.jsx';
import { API_BASE } from '../config/api.js';
import { showBanner, removeBanner } from '../services/AdMobService.js';
import { useFestivalNotifications } from '../hooks/useFestivalNotifications.js';
import { playScanFeedback } from '../utils/feedback.js';
import { fetchStreakStatus } from '../utils/streak.js';
import { shareMemoera } from '../utils/share.js';

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const GOLD = "#C9A84C";
const VIOLET = "#8f6ffb";
const DANGER = "#FF6B6B";

// Every option from the Settings screen, surfaced directly in the profile
// menu (each `section` deep-links straight into that accordion section)
// plus Refer a Friend, which lives on its own screen.
// Labels resolved from `tr` at render time (see profileMenuItems below) so the
// dropdown follows the selected language instead of staying English forever.
const PROFILE_MENU_KEYS = [
  { key: 'account',       icon: '👤', section: 'account' },
  { key: 'notifications', icon: '🔔', section: 'notifications' },
  { key: 'ar',            icon: '🔭', section: 'ar' },
  { key: 'theme',         icon: '🎨', section: 'theme' },
  { key: 'subscription',  icon: '💎', section: 'subscription' },
  { key: 'refer',         icon: '🎁', section: null },
  { key: 'support',       icon: '💬', section: 'support' },
  { key: 'about',         icon: '🏢', section: 'about' },
];

const PROMO_CARDS = [
  { key: 'streak',    eyebrow: 'Milestone', title: 'Keep your streak', body: null, variant: 'warm' },
];

export default function HomeScreen({ onUpload, onGallery, onSettings, onPremium, onSignOut, onRefer, onStreak, onCollection, onLiked, onAdmin, onScan, onSearch, onAnimation, onNfc, onCatalog, onDashboard, user }) {
  const { lang, setLang, tr: trFromContext } = useLanguage();
  const { theme, toggleTheme, colors } = useTheme();
  const tr = trFromContext;
  const whatsappUrl = "https://wa.me/919187713120";
  const isDark = theme === 'dark';

  const PROFILE_MENU_LABELS = {
    // Not tr.notificationsSection: that string is also the Settings screen's own
    // section heading, and this entry is specifically about the OS permission.
    account: tr.accountSection, notifications: 'Notification Permissions', ar: tr.arSettingsSection,
    theme: tr.themeSection, subscription: tr.subscriptionSection,
    refer: tr.referAFriend, support: tr.supportSection, about: tr.aboutUsSection,
  };

  const [storageAlert,     setStorageAlert]     = useState(null);
  const [storageDismissed, setStorageDismissed] = useState(false);
  const [storagePct,       setStoragePct]       = useState(null);
  const [notifOpen,  setNotifOpen]  = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [brandMenuOpen, setBrandMenuOpen] = useState(false);
  const [streakCount, setStreakCount] = useState(0);
  const [toastMsg, setToastMsg] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [navDotActive, setNavDotActive] = useState(0);
  const navScrollRef = useRef(null);
  const promoTrackRef = useRef(null);
  const [promoDot, setPromoDot] = useState(0);
  const [notifs, setNotifs] = useState([
    { id: 1, icon: '🎉', title: 'Welcome to Memoera!', body: 'Start uploading your AR targets and bring memories to life.', time: 'Just now' },
    { id: 2, icon: '📸', title: 'Scan your first target', body: 'Point your camera at an uploaded image to trigger AR content.', time: '5 min ago' },
    { id: 3, icon: '👾', title: 'Free storage: 500 MB', body: 'You have 500 MB of free storage. Upgrade for more.', time: 'Today' },
  ]);

  // Festival greeting notifications from the backend
  const { festivalNotifs, unreadCount: festivalUnread, markRead: markFestivalRead } =
    useFestivalNotifications(user?.email);

  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 2300);
  }, []);

  // Fetch storage on mount — drives both the real "storage used" stat and
  // the upgrade-nudge banner when a user is close to / at their limit.
  useEffect(() => {
    const token = localStorage.getItem('memoera_token');
    if (!token) return;
    fetch(API_BASE + '/api/storage', { headers: { Authorization: 'Bearer ' + token } })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        const totalBytes = (d.privateBytes || 0) + (d.publicBytes || 0);
        const LIMIT = 500 * 1024 * 1024;
        setStoragePct(Math.min(100, Math.round((totalBytes / LIMIT) * 100)));
        if (totalBytes >= LIMIT) setStorageAlert('full');
        else if (totalBytes >= LIMIT * 0.9) setStorageAlert('warning');
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchStreakStatus().then((data) => { if (data) setStreakCount(data.currentStreak || 0); });
  }, []);


  // Dot indicators reflect actual scroll position of the icon row.
  useEffect(() => {
    const el = navScrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const maxScroll = el.scrollWidth - el.clientWidth;
      const pct = maxScroll > 0 ? el.scrollLeft / maxScroll : 0;
      setNavDotActive(Math.min(2, Math.round(pct * 2)));
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // Click-and-drag (mouse) scrolling for the icon row — touch devices already
  // scroll natively via touchAction:pan-x, this adds the same left-right drag
  // feel for desktop/mouse users.
  useEffect(() => {
    const el = navScrollRef.current;
    if (!el) return;
    let isDown = false, startX = 0, scrollStart = 0, moved = false;

    const onDown = (e) => {
      isDown = true; moved = false;
      startX = e.pageX; scrollStart = el.scrollLeft;
      el.style.cursor = 'grabbing';
      el.style.userSelect = 'none';
    };
    const suppressNextClick = (e) => { e.preventDefault(); e.stopPropagation(); };
    const onUp = () => {
      if (!isDown) return;
      isDown = false;
      el.style.cursor = 'grab';
      el.style.userSelect = '';
      if (moved) {
        el.addEventListener('click', suppressNextClick, { capture: true, once: true });
      }
    };
    const onMove = (e) => {
      if (!isDown) return;
      const dx = e.pageX - startX;
      if (Math.abs(dx) > 5) moved = true;
      el.scrollLeft = scrollStart - dx;
    };

    el.style.cursor = 'grab';
    el.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      el.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  // Promo carousel dot indicators
  useEffect(() => {
    const el = promoTrackRef.current;
    if (!el) return;
    const onScroll = () => {
      const idx = Math.round(el.scrollLeft / el.clientWidth);
      setPromoDot(idx);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const handleSearchSubmit = useCallback((e) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    onSearch?.(q);
  }, [searchQuery, onSearch]);

  const handleShare = useCallback(async () => {
    try {
      const result = await shareMemoera();
      if (result === 'copied') showToast('Link copied!');
    } catch (err) {
      // User cancelling the native share sheet throws AbortError — not a real failure.
      if (err?.name !== 'AbortError') showToast('Could not share right now.');
    }
  }, [showToast]);

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

  // Show AdMob banner while on home screen, remove when leaving
  useEffect(() => {
    showBanner();
    return () => { removeBanner(); };
  }, []);

  const hour = new Date().getHours();
  const [greetWord, greetEmoji] = hour < 5 ? ['Still up', '🌙'] : hour < 12 ? ['Good morning', '☀️'] : hour < 17 ? ['Good afternoon', '⛅'] : hour < 21 ? ['Good evening', '🌇'] : ['Good night', '🌙'];
  const userName = user?.firstName || user?.name || user?.username || 'Explorer';

  return (
    <div className="memoera-screen" style={{ ...styles.screen, background: colors.bg }}>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes homeFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
        @keyframes homeOrbDrift1 {
          0%,100% { transform: translate(0,0) scale(1); opacity: 0.55; }
          50%     { transform: translate(24px,30px) scale(1.15); opacity: 0.85; }
        }
        @keyframes homeOrbDrift2 {
          0%,100% { transform: translate(0,0) scale(1); opacity: 0.4; }
          50%     { transform: translate(-30px,-20px) scale(1.2); opacity: 0.7; }
        }
        @keyframes homePulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
        @keyframes ptr-spin { to { transform: rotate(360deg); } }
        @keyframes hg-ring { 0%{transform:scale(.9);opacity:.6} 100%{transform:scale(1.5);opacity:0} }

        .home-icon-btn { transition: transform .14s ease, box-shadow .14s ease; }
        .home-icon-btn:hover { transform: translateY(-2px); }
        .home-icon-btn:active { transform: translateY(1px) scale(.94); }

        .home-feature { transition: transform .18s ease; }
        /* No transform-style:preserve-3d here — it forces a persistent 3D
           compositing layer on every badge even at rest, which combined with
           overflow:hidden + border-radius renders a thin seam/hairline at the
           rounded corners in Chromium (looked like a "white line/gap" on the
           icons regardless of the artwork itself). */
        .home-feature-badge { transition: transform .18s ease, box-shadow .18s ease; }
        .home-feature:hover .home-feature-badge { transform: translateY(-5px); box-shadow: 0 20px 34px -14px rgba(0,0,0,.5); }
        .home-feature:active .home-feature-badge { transform: translateY(1px) scale(.95) !important; }

        .home-promo-cta { transition: transform .12s ease; }
        .home-promo-cta:hover { transform: translateY(-2px) rotate(8deg); }
        .home-promo-cta:active { transform: scale(.92); }

        .home-mode-tile { transition: transform .18s ease, background .18s ease, border-color .18s ease; }
        .home-mode-tile:hover { transform: translateY(-3px); }
        .home-mode-tile:active { transform: scale(.96) !important; }

        .home-social-btn { transition: transform .15s ease, box-shadow .15s ease; }
        .home-social-btn:hover { transform: translateX(4px); }
        .home-social-btn:active { transform: translateX(4px) scale(.92); }

        .home-dot { transition: all .2s ease; }
      ` }} />

      <div style={{ ...styles.glowOrb, top: '4%', left: '-12%', width: 260, height: 260,
        background: `radial-gradient(circle, ${colors.accent || '#00C9A7'}66 0%, transparent 70%)`,
        animation: 'homeOrbDrift1 10s ease-in-out infinite' }} />
      <div style={{ ...styles.glowOrb, top: '38%', right: '-16%', width: 300, height: 300,
        background: `radial-gradient(circle, ${GOLD}55 0%, transparent 70%)`,
        animation: 'homeOrbDrift2 13s ease-in-out infinite' }} />

      <div style={styles.watermark}>
        <img src="/logo.png" alt="" style={{ ...styles.watermarkImg, filter: isDark ? 'brightness(10) saturate(0)' : 'brightness(0) saturate(0)' }} />
      </div>

      {/* ── Single scrollable column — header through footer all scroll together ── */}
      <div ref={contentRef} className="memoera-content" style={styles.content}>

        {/* ── Header — brand mark + utility controls ── */}
        <div style={styles.header}>
          <div style={{ ...styles.brandRow, position: 'relative' }}>
            <button className="home-icon-btn" onClick={() => { setBrandMenuOpen(o => !o); setLangMenuOpen(false); setNotifOpen(false); }}
              title="Menu" aria-label="Menu" aria-expanded={brandMenuOpen}
              style={{ ...styles.brandMark, background: colors.surfaceHigh, border: `1px solid ${colors.border}`,
                padding: 0, cursor: 'pointer' }}>
              <img src="/logo-icon.png" alt="Memoera" style={styles.brandMarkImg} />
              {user?.profilePhotoUrl && (
                <img src={user.profilePhotoUrl} alt="" style={styles.brandAvatar} />
              )}
            </button>

            {brandMenuOpen && (
              <div style={{ ...styles.dropdown, right: 'auto', left: 0, width: 230,
                background: colors.bgSolid, border: `1px solid ${colors.border}` }}>

                {/* Mode — the theme toggle that used to sit in the header */}
                <button onClick={toggleTheme}
                  style={{ ...styles.menuItem, color: colors.text, borderBottom: `1px solid ${colors.border}` }}>
                  {isDark ? <SunIcon size={16} color={colors.text} /> : <MoonIcon size={15} color={colors.text} />}
                  Mode
                  <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, letterSpacing: '.06em',
                    color: colors.accent, background: `${colors.accent}1e`, borderRadius: 20, padding: '3px 8px' }}>
                    {isDark ? 'DARK' : 'LIGHT'}
                  </span>
                </button>

                {/* Profile options — moved here from the header avatar button */}
                {PROFILE_MENU_KEYS.map((item) => (
                  <button key={item.key}
                    onClick={() => { setBrandMenuOpen(false); item.section ? onSettings(item.section) : onRefer(); }}
                    style={{ ...styles.menuItem, color: colors.text }}>
                    <span style={{ fontSize: 15 }}>{item.icon}</span> {PROFILE_MENU_LABELS[item.key]}
                  </button>
                ))}
                <button onClick={() => { setBrandMenuOpen(false); onSignOut(); }} style={{ ...styles.menuItem, color: DANGER }}>
                  <PowerIcon color={DANGER} /> {tr.signOut}
                </button>
              </div>
            )}
          </div>

          <div style={styles.headerControls}>
            <div style={{ position: 'relative' }}>
              <button className="home-icon-btn" onClick={() => setLangMenuOpen(o => !o)} title="Language" aria-label="Language"
                style={{ ...styles.iconBtn, background: colors.surfaceHigh, border: `1px solid ${colors.border}` }}>
                <GlobeIcon size={16} color={colors.text} />
              </button>
              {langMenuOpen && (
                <div style={{ ...styles.dropdown, width: 180, background: colors.bgSolid, border: `1px solid ${colors.border}` }}>
                  {Object.entries(LANGUAGES).map(([k, v]) => (
                    <button key={k} onClick={() => { setLang(k); setLangMenuOpen(false); }}
                      style={{ ...styles.menuItem, color: k === lang ? colors.accent : colors.text,
                        fontWeight: k === lang ? 700 : 600 }}>
                      {v}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div style={{ position: 'relative' }}>
              <button className="home-icon-btn" onClick={() => setNotifOpen(o => !o)} title="Notifications" aria-label="Notifications"
                style={{ ...styles.iconBtn, background: colors.surfaceHigh, border: `1px solid ${colors.border}` }}>
                <BellIcon size={16} color={colors.text} />
                {(notifs.length + festivalUnread) > 0 && <span style={{ ...styles.badgeDot, boxShadow: `0 0 0 2px ${colors.surfaceHigh}` }} />}
              </button>
              {notifOpen && (
                <div style={{ ...styles.dropdown, background: colors.bgSolid, border: `1px solid ${colors.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px 10px', borderBottom: `1px solid ${colors.border}` }}>
                    <BellIcon size={16} color={colors.text} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: colors.text, fontFamily: FONT }}>
                      Notifications {(notifs.length + festivalUnread) > 0 && <span style={{ fontSize: 10, background: DANGER, color: '#fff', borderRadius: 10, padding: '1px 6px', marginLeft: 4 }}>{notifs.length + festivalUnread}</span>}
                    </span>
                    <button onClick={() => setNotifOpen(false)} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: colors.textMuted, fontSize: 15, cursor: 'pointer' }}>✕</button>
                  </div>
                  <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                    {festivalNotifs.map((fn) => (
                      <div key={fn.id} onClick={() => markFestivalRead(fn.id)} style={{ position: 'relative', cursor: 'pointer' }}>
                        <img src={fn.image_url} alt={fn.festival_name} style={{ width: '100%', display: 'block', maxHeight: 150, objectFit: 'cover' }} />
                        {!fn.is_read && <span style={{ position: 'absolute', top: 8, right: 8, background: DANGER, color: '#fff', fontSize: 9, fontWeight: 700, borderRadius: 8, padding: '2px 7px', fontFamily: FONT }}>NEW</span>}
                        <div style={{ padding: '8px 12px 10px', background: colors.surface, borderBottom: `1px solid ${colors.border}` }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: colors.accent, fontFamily: FONT }}>🎉 Happy {fn.festival_name}!</div>
                          <div style={{ fontSize: 10, color: colors.textMuted, fontFamily: FONT, marginTop: 2 }}>
                            {new Date(fn.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                          </div>
                        </div>
                      </div>
                    ))}
                    {notifs.length === 0 && festivalNotifs.length === 0 ? (
                      <div style={{ padding: '20px 14px', textAlign: 'center' }}>
                        <div style={{ fontSize: 26, marginBottom: 6 }}>✅</div>
                        <div style={{ fontSize: 12, color: colors.textMuted, fontFamily: FONT }}>All caught up!</div>
                      </div>
                    ) : notifs.map((n) => (
                      <div key={n.id} onClick={() => setNotifs(prev => prev.filter(x => x.id !== n.id))}
                        style={{ padding: '9px 10px', borderRadius: 10, display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
                        <span style={{ fontSize: 18, flexShrink: 0 }}>{n.icon}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: colors.text, fontFamily: FONT }}>{n.title}</div>
                          <div style={{ fontSize: 11, color: colors.textMuted, fontFamily: FONT, marginTop: 2, lineHeight: 1.4 }}>{n.body}</div>
                        </div>
                        <span style={{ fontSize: 9.5, color: colors.textMuted, fontFamily: FONT, flexShrink: 0 }}>{n.time}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* ── Storage upgrade alert ── */}
        {storageAlert && !storageDismissed && (
          <div style={{ ...styles.card, background: colors.surface, border: `1px solid ${storageAlert === 'full' ? 'rgba(255,80,80,0.4)' : 'rgba(255,160,0,0.4)'}`,
            display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', flexShrink: 0 }}>
            <span style={{ fontSize: 20, flexShrink: 0 }}>{storageAlert === 'full' ? '🔴' : '🟡'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: colors.text, fontFamily: FONT }}>
                {storageAlert === 'full' ? 'Storage Full — 500 MB Used' : 'Storage Almost Full'}
              </div>
              <div style={{ fontSize: 11, color: colors.textMuted, fontFamily: FONT, marginTop: 2 }}>
                {storageAlert === 'full' ? 'Upgrade to Premium for up to 2 GB.' : 'You have used 90%+ of your free 500 MB.'}
              </div>
            </div>
            <button onClick={onPremium} style={{ background: `linear-gradient(135deg,${colors.accent},${colors.accent}cc)`, border: 'none', borderRadius: 20, color: '#000', fontSize: 11, fontWeight: 700, fontFamily: FONT, padding: '7px 13px', cursor: 'pointer', flexShrink: 0 }}>Upgrade</button>
            <button onClick={() => setStorageDismissed(true)} style={{ background: 'transparent', border: 'none', color: colors.textMuted, fontSize: 15, cursor: 'pointer', flexShrink: 0 }}>✕</button>
          </div>
        )}

        {/* ── Pull-to-refresh indicator ── */}
        {(pullDist > 8 || refreshing) && (
          <div style={{ position:'fixed', top:0, left:0, right:0, zIndex:50,
            display:'flex', flexDirection:'column', alignItems:'center',
            paddingTop: refreshing ? 14 : Math.max(0, pullDist - 30),
            pointerEvents:'none', transition: refreshing ? 'padding-top 0.3s ease' : 'none' }}>
            <div style={{ width:40, height:40, borderRadius:'50%',
              background: pullDist >= PULL_THRESHOLD || refreshing ? `${colors.accent}22` : colors.surfaceHigh,
              border: `2.5px solid ${pullDist >= PULL_THRESHOLD || refreshing ? colors.accent : colors.border}`,
              display:'flex', alignItems:'center', justifyContent:'center',
              boxShadow: pullDist >= PULL_THRESHOLD || refreshing ? `0 0 18px ${colors.accent}55` : 'none',
              transition:'background 0.2s, border 0.2s, box-shadow 0.2s' }}>
              <span style={{ fontSize:20, color: pullDist >= PULL_THRESHOLD || refreshing ? colors.accent : colors.textMuted,
                display:'inline-block',
                transform: refreshing ? 'none' : `rotate(${Math.min((pullDist / PULL_THRESHOLD) * 180, 180)}deg)`,
                animation: refreshing ? 'ptr-spin 0.65s linear infinite' : 'none',
                transition: refreshing ? 'none' : 'transform 0.05s, color 0.2s' }}>↻</span>
            </div>
            {!refreshing && pullDist >= PULL_THRESHOLD && <span style={{ marginTop:6, fontSize:10, color: colors.accent, fontFamily: FONT, fontWeight:700, letterSpacing:'0.05em' }}>Release to Refresh</span>}
            {refreshing && <span style={{ marginTop:6, fontSize:10, color: colors.accent, fontFamily: FONT, fontWeight:700, letterSpacing:'0.05em' }}>Refreshing…</span>}
          </div>
        )}

        {/* ── Greeting ── */}
        <div style={styles.greeting}>
          <div style={{ ...styles.eyebrow, color: colors.textMuted }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: colors.accent, animation: 'homePulse 2.4s ease-in-out infinite', display: 'inline-block' }} />
            {greetEmoji} {greetWord}
          </div>
          <h1 style={{ ...styles.hello, color: colors.text }}>
            Hello, <span style={styles.helloName}>{userName}</span>
          </h1>
        </div>

        {/* ── Feature row — horizontally scrollable, swipe sideways for more ── */}
        <div className="memoera-nav-bar" ref={navScrollRef} style={styles.navBar}>
          {onScan && (
            <NavBtn className="home-feature" img="/nav-scan.png" bg="#775EE9" label={tr.scan || 'Scan'} labelColor={colors.text}
              onClick={() => { playScanFeedback(); onScan(); }} />
          )}
          <NavBtn className="home-feature" img="/nav-create.png" bg="#F970B4" label={tr.upload || 'Create'} labelColor={colors.text} onClick={onUpload} />
          {onNfc && (
            <NavBtn className="home-feature" icon={<img src="/nav-nfc.png" alt="" style={{ width: 48, height: 48, objectFit: 'contain' }} />}
              bg="linear-gradient(135deg,#00C9A7,#00E5CC)" label="NFC" labelColor={colors.text}
              onClick={onNfc} />
          )}
          {onLiked && (
            <NavBtn className="home-feature" icon={<HeartIcon size={48} color="#fff" />} bg="linear-gradient(135deg,#ff3c5a,#ff7a90)" label="Liked" labelColor={colors.text} onClick={onLiked} />
          )}
          <NavBtn className="home-feature" img="/nav-albums.png" bg="#7DD784" label={tr.gallery || 'Albums'} labelColor={colors.text} onClick={onGallery} />
          {onStreak && (
            <NavBtn className="home-feature" img="/nav-streak.png" bg="#588EFD" count={streakCount} label={tr.navStreak || 'Streak'} labelColor={colors.text} onClick={onStreak} />
          )}
          {onAnimation && (
            <NavBtn className="home-feature" img="/nav-animation.png" bg="#CA8540" label={tr.navAnimation || 'Animation'} labelColor={colors.text} onClick={onAnimation} />
          )}
          {onCatalog && (
            <NavBtn className="home-feature" icon={<CatalogNavIcon size={39} color="#fff" />} bg="linear-gradient(135deg,#6366F1,#8B85F8)" label="Catalog" labelColor={colors.text} onClick={onCatalog} />
          )}
          {onDashboard && (
            <NavBtn className="home-feature" icon={<DashboardNavIcon size={39} color="#fff" />} bg="linear-gradient(135deg,#FF7A45,#FFB199)" label="Dashboard" labelColor={colors.text} onClick={onDashboard} />
          )}
          <NavBtn className="home-feature" icon={<ShareIcon size={48} color="#fff" />} bg="linear-gradient(135deg,#00C9A7,#00E5CC)" label={tr.navShare || 'Share'} labelColor={colors.text} onClick={handleShare} />
        </div>

        <div style={styles.navDots}>
          {[0, 1, 2].map((i) => (
            <span key={i} className="home-dot" style={{ ...styles.navDot, background: navDotActive === i ? colors.accent : colors.textMuted, opacity: navDotActive === i ? 1 : 0.4 }} />
          ))}
        </div>

        {/* ── Promo carousel ── */}
        <div style={styles.promoWrap}>
          <div ref={promoTrackRef} style={styles.promoTrack}>
            {PROMO_CARDS.map((p) => {
              const accentColor = p.variant === 'warm' ? GOLD : p.variant === 'violet' ? VIOLET : colors.accent;
              const body = p.key === 'streak'
                ? (streakCount > 0 ? `Day ${streakCount} — keep it going for a badge.` : 'Scan today to start your streak.')
                : p.body;
              return (
                <article key={p.key} style={{ ...styles.promoCard, background: colors.surface, border: `1px solid ${colors.border}` }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 9.5, letterSpacing: '.1em', color: accentColor, textTransform: 'uppercase' }}>{p.eyebrow}</div>
                    <h3 style={{ margin: '4px 0 4px', fontSize: 15, fontFamily: FONT, color: colors.text, letterSpacing: '-.01em' }}>{p.title}</h3>
                    <p style={{ margin: 0, fontSize: 11.5, color: colors.textMuted, fontFamily: FONT, maxWidth: '22ch' }}>{body}</p>
                  </div>
                  <button className="home-promo-cta" aria-label={p.title}
                    onClick={() => p.key === 'streak' ? onStreak?.() : showToast('Got it — steady scans for sharper detail.')}
                    style={{ flex: 'none', width: 42, height: 42, borderRadius: 14, border: 'none', cursor: 'pointer',
                      background: `linear-gradient(160deg, ${accentColor}, ${accentColor}cc)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#04140f' }}>
                    <ArrowRightIcon />
                  </button>
                </article>
              );
            })}
          </div>
          <div style={styles.promoDots}>
            {PROMO_CARDS.map((p, i) => (
              <button key={p.key} onClick={() => promoTrackRef.current?.scrollTo({ left: i * promoTrackRef.current.clientWidth, behavior: 'smooth' })}
                aria-label={`Go to slide ${i + 1}`}
                style={{ ...styles.dot, width: promoDot === i ? 18 : 6, background: promoDot === i ? colors.accent : colors.border }} />
            ))}
          </div>
        </div>

        {/* ── Search — find something in your uploaded targets ── */}
        <form onSubmit={handleSearchSubmit} style={{ ...styles.searchBar, background: colors.surface, border: `1px solid ${colors.border}` }}>
          <SearchIcon size={15} color={colors.textMuted} />
          <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Find a business — jewellery, carpenter…"
            style={{ ...styles.searchInput, color: colors.text }} />
          <button type="submit" aria-label="Search" style={{ ...styles.searchGo, background: `linear-gradient(160deg, ${GOLD}, ${GOLD}cc)` }}>
            <ArrowRightIcon color="#2b1002" />
          </button>
        </form>

        {/* Full-bleed "Explore modes" banner — three diagonal-cut partitions */}
        <ExploreModes onUpload={onUpload} onScan={onScan} onCollection={onCollection} colors={colors} />

        {/* ── Social icons + Reviews / Stats ── */}
        <div style={styles.bodyGrid}>
          <div style={styles.socialRail}>
            <SocialLink className="home-social-btn" href="https://www.instagram.com/memoerabangalore/" icon={<InstagramIcon color={colors.text} />} colors={colors} />
            <SocialLink className="home-social-btn" href="https://www.facebook.com/profile.php?id=61574312286741" icon={<FacebookIcon color={colors.text} />} colors={colors} />
            <SocialLink className="home-social-btn" href="https://www.youtube.com/@memoerabangalore" icon={<YouTubeIcon color={colors.text} />} colors={colors} />
            <SocialLink className="home-social-btn" href="https://x.com/Memo_Era" icon={<XIcon color={colors.text} />} colors={colors} />
            <SocialLink className="home-social-btn" href={whatsappUrl} icon={<WhatsAppIcon color={colors.text} />} colors={colors} />
          </div>

          <div style={styles.stack}>
            <HappyCustomersCard colors={colors} isDark={isDark} user={user} />

            <div style={{ ...styles.card, display: 'flex', gap: 8, padding: 12, background: colors.surface, border: `1px solid ${colors.border}` }}>
              <div style={{ ...styles.stat, background: `${colors.accent}1e`, color: colors.accent }}>
                <StreakGlyph />
                <span style={{ ...styles.statNum, color: colors.text }}>{streakCount}d</span>
                <span style={{ ...styles.statLabel, color: colors.textMuted }}>Streak</span>
              </div>
              {storagePct !== null && (
                <div style={{ ...styles.stat, background: `${GOLD}22`, color: GOLD }}>
                  <StorageGlyph />
                  <span style={{ ...styles.statNum, color: colors.text }}>{storagePct}%</span>
                  <span style={{ ...styles.statLabel, color: colors.textMuted }}>Storage</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <AboutUsAccordion colors={colors} />

        {toastMsg && (
          <div style={{ ...styles.toast, background: colors.bgSolid, border: `1px solid ${colors.border}`, color: colors.text }}>
            {toastMsg}
          </div>
        )}
      </div>
    </div>
  );
}

const EXPLORE_MODES = [
  { icon: '📤', title: 'Upload',  desc: 'Upload a photo, video, or 3D model as your AR target.' },
  { icon: '📱', title: 'Scan',    desc: 'Point your camera at the uploaded photo to detect it.' },
  { icon: '✨', title: 'Relive',  desc: 'Watch your memory come alive right on top of it!' },
];

// Full-bleed diagonal-cut banner, split into three tiles — one per
// "Explore modes" step. Deliberately breaks out of the page's side padding
// (negative margins) so the diagonal edges run edge-to-edge like a ribbon.
function ExploreModes({ onUpload, onScan, onCollection, colors }) {
  // Indexes must line up with EXPLORE_MODES above — they were off by one, so
  // the tile labelled "Upload" opened the scanner and "Scan" opened the gallery.
  const actions = [
    () => onUpload?.(),      // Upload
    () => onScan?.(),        // Scan
    () => onCollection?.(),  // Relive
  ];
  return (
    <div style={s2.wrap}>
      <div style={s2.head}>
        <h2 style={{ ...s2.headTitle, color: colors.text }}>Explore modes</h2>
        <span style={{ ...s2.headSub, color: colors.textMuted }}>3 WAYS IN</span>
      </div>
      <div style={s2.accent}>
        <div style={s2.shape}>
          {EXPLORE_MODES.map((step, i) => (
            <button key={i} className="home-mode-tile" onClick={actions[i]} style={s2.tile}>
              <span style={s2.tileIcon}><span style={{ fontSize: 22 }}>{step.icon}</span></span>
              <span style={s2.tileTitle}>{step.title}</span>
              <span style={s2.tileDesc}>{step.desc}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const s2 = {
  wrap: { position: 'relative', marginLeft: -16, marginRight: -16, marginTop: 6 },
  head: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '0 20px 10px' },
  headTitle: { fontFamily: FONT, fontSize: 15, margin: 0, letterSpacing: '-.01em', color: '#fff' },
  headSub: { fontFamily: 'ui-monospace, monospace', fontSize: 9.5, color: 'rgba(255,255,255,.5)', letterSpacing: '.08em' },
  accent: { position: 'relative', background: '#00E5CC', clipPath: 'polygon(0 6%, 100% 0%, 100% 94%, 0% 100%)' },
  shape: { margin: 3, background: '#0A3733', clipPath: 'polygon(0 6%, 100% 0%, 100% 94%, 0% 100%)',
    display: 'flex', padding: '30px 10px 38px', gap: 8 },
  tile: { flex: 1, minWidth: 0, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 16, padding: '14px 6px', display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: 8, textAlign: 'center', cursor: 'pointer', color: '#fff', fontFamily: FONT, boxSizing: 'border-box' },
  tileIcon: { width: 40, height: 40, borderRadius: 14, background: 'rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  tileTitle: { fontSize: 11.5, fontWeight: 700, width: '100%' },
  tileDesc: { fontSize: 9, color: 'rgba(255,255,255,.65)', lineHeight: 1.3, width: '100%', overflowWrap: 'break-word', wordBreak: 'break-word' },
};

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
    <div style={{ borderRadius: 18, overflow: 'hidden',
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
          "{r.text}"
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
              "{r.text}"
            </p>
          </div>
        </div>,
        document.body
      )}

      {/* Write-a-review modal — portaled to <body> so it always paints above
          sibling sections, regardless of which nested stacking context it's
          authored in. */}
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

function NavBtn({ icon, img, count, label, sublabel, bg, onClick, labelColor, subColor, className }) {
  return (
    <button onClick={onClick} title={label} className={`nav-tile-hover home-feature ${className || ''}`} style={styles.navBtn}>
      {/* Solid `bg` behind the icon even for `img` badges — the PNG artwork has a
          softly anti-aliased edge, so a transparent backdrop let the page
          background show through as a pale rim ("incomplete fill"). A solid
          backdrop matching the icon's own color makes that edge blend away. */}
      <span className="nav-tile-badge home-feature-badge" style={{ ...styles.navTileBadge, overflow: 'hidden', background: bg || '#333' }}>
        {img ? <img src={img} alt="" style={styles.navTileImg} /> : icon}
        {count > 0 && <span style={styles.navTileCount}>{count}</span>}
      </span>
      <span style={{ ...styles.navBtnLabel, color: labelColor }}>{label}</span>
      {sublabel && <span style={{ ...styles.navBtnSublabel, color: subColor }}>{sublabel}</span>}
    </button>
  );
}
function SocialLink({ href, icon, className }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
      <div className={`social-icon-hover ${className || ''}`} style={styles.socialIcon}>{icon}</div>
    </a>
  );
}

function AboutUsAccordion({ colors }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderRadius: 16, overflow: 'hidden', background: colors.surface, border: `1px solid ${colors.border}` }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: '100%', background: 'transparent', border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px', fontFamily: FONT,
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: colors.text }}>About Us</span>
        <span style={{ color: colors.textMuted, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
      </button>
      {open && (
        <div style={{ padding: '0 16px 16px' }}>
          <p style={{ margin: 0, fontSize: 12.5, color: colors.textMuted, fontFamily: FONT, lineHeight: 1.6 }}>
            Memoera (OPC) Private Limited, based in Bengaluru, India, builds AR experiences that
            bring your printed photos, cards, and keepsakes to life. Scan any Memoera target and
            watch your memories play back as video, audio, or animation — instantly.
          </p>
        </div>
      )}
    </div>
  );
}

/* ── Icons ── */
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
function MoonIcon({ size = 17, color = '#555' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  );
}
function BellIcon({ size = 20, color = '#555' }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>; }
function GlobeIcon({ size = 15, color = '#555' }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18Z"/></svg>; }
function HeartIcon({ size = 20, color = '#555' }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke="none"><path d="M12 21s-7.5-4.8-10-9.3C.4 8.6 1.7 5 5.2 4.2c2-.5 4 .3 5.2 2 .3.4.9.4 1.2 0 1.2-1.7 3.2-2.5 5.2-2 3.5.8 4.8 4.4 3.2 7.5C19.5 16.2 12 21 12 21z"/></svg>; }
function CatalogNavIcon({ size = 34, color = '#fff' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke="none">
      <rect x="3"  y="3"  width="8" height="8" rx="2" />
      <rect x="13" y="3"  width="8" height="8" rx="2" />
      <rect x="3"  y="13" width="8" height="8" rx="2" />
      <rect x="13" y="13" width="8" height="8" rx="2" />
    </svg>
  );
}
function DashboardNavIcon({ size = 34, color = '#fff' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke="none">
      <rect x="3"  y="12" width="5" height="9" rx="1.5" />
      <rect x="9.5" y="6"  width="5" height="15" rx="1.5" />
      <rect x="16" y="2"  width="5" height="19" rx="1.5" />
    </svg>
  );
}
// Fully filled — zero stroke — a solid arrow-into-tray glyph, no disconnected
// outline segments or visible gaps to the badge background behind it.
function ShareIcon({ size = 32, color = '#555' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke="none">
      <path d="M12 2.5 L17 8.5 H13.6 V15.5 H10.4 V8.5 H7 Z" />
      <path d="M4.5 15.5 H7 V19.5 H17 V15.5 H19.5 V19.5 A2 2 0 0 1 17.5 21.5 H6.5 A2 2 0 0 1 4.5 19.5 Z" />
    </svg>
  );
}
function SearchIcon({ size = 18, color = '#00C9A7' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
function ArrowRightIcon({ color = 'currentColor' }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>;
}
function PowerIcon({ color = '#555' }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18.36 6.64A9 9 0 1 1 5.64 6.64"/><line x1="12" y1="2" x2="12" y2="12"/></svg>;
}
function StreakGlyph() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2c1 3-2.5 4-2.5 7.2 0 1.6 1 2.6 2 2.6.8 0 1.6-.6 1.6-1.7 0-.7-.3-1.1-.3-1.1 2 .6 3.7 2.6 3.7 5.1 0 3.3-2.9 5.9-6.5 5.9S3.5 18.4 3.5 15.1c0-4.8 4.7-6 8.5-13.1Z"/></svg>; }
function StorageGlyph() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><rect x="3" y="4" width="18" height="6" rx="1.6"/><rect x="3" y="14" width="18" height="6" rx="1.6"/><circle cx="7" cy="7" r="0.6" fill="currentColor" stroke="none"/><circle cx="7" cy="17" r="0.6" fill="currentColor" stroke="none"/></svg>; }

const SOCIAL = "#0D333B";
function InstagramIcon() {
  return <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke={SOCIAL} strokeWidth="1.7">
    <rect x="3.2" y="3.2" width="17.6" height="17.6" rx="6"/>
    <circle cx="12" cy="12" r="4.2"/>
    <circle cx="17" cy="7" r="1" fill={SOCIAL} stroke="none"/>
  </svg>;
}
function FacebookIcon() {
  return <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke={SOCIAL} strokeWidth="1.7">
    <circle cx="12" cy="12" r="9.3"/>
    <path d="M14.2 8.6h-1.3c-.5 0-.9.4-.9.9v1.3h2.2l-.3 1.9h-1.9V21h-2v-8.3H8.3v-1.9H10V9.3c0-1.6 1-2.7 2.6-2.7h1.6z" fill={SOCIAL} stroke="none"/>
  </svg>;
}
function YouTubeIcon() {
  return <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke={SOCIAL} strokeWidth="1.7">
    <circle cx="12" cy="12" r="9.3"/>
    <path d="M10 8.3v7.4l6.2-3.7z" fill={SOCIAL} stroke="none"/>
  </svg>;
}
function XIcon() {
  return <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke={SOCIAL} strokeWidth="1.7">
    <circle cx="12" cy="12" r="9.3"/>
    <path d="M17.8 8.2c-.4.2-.8.3-1.2.4.4-.3.7-.7.9-1.2-.4.3-.9.4-1.3.6-.4-.4-1-.7-1.6-.7-1.2 0-2.1 1-2.1 2.2 0 .2 0 .3.1.5-1.8-.1-3.3-.9-4.4-2.2-.2.3-.3.6-.3 1 0 .7.4 1.3.9 1.7-.3 0-.6-.1-.9-.3v0c0 1 .7 1.8 1.7 2-.2.1-.4.1-.6.1-.1 0-.3 0-.4 0 .3.8 1 1.4 1.9 1.5-.7.6-1.6.9-2.6.9-.2 0-.3 0-.5 0 .9.6 2 1 3.2 1 3.8 0 5.9-3.2 5.9-5.9v-.3c.4-.3.7-.6 1-1z" fill={SOCIAL} stroke="none"/>
  </svg>;
}
function WhatsAppIcon() {
  return <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke={SOCIAL} strokeWidth="1.7">
    <circle cx="12" cy="12" r="9.3"/>
    <path d="M9.9 9.6c.1-.3.3-.3.4-.3h.3c.1 0 .3 0 .4.3.2.4.5 1.1.5 1.2.1.1.1.2 0 .3-.1.2-.1.2-.2.3-.1.1-.2.3-.3.4-.1.1-.2.2-.1.4.2.3.6.9 1.3 1.5.8.7 1.3.9 1.5.9.2.1.3.1.4-.1.1-.1.3-.4.5-.6.1-.1.3-.1.4-.1.2.1.9.5 1.1.6.2.1.3.1.3.2.1.2.1.5-.1 1-.2.4-1 .9-1.5.9-.4 0-1.2-.1-2.5-.9-1.9-1.1-3.2-3.2-3.3-3.4-.1-.1-.8-1.1-.8-2.1 0-1 .5-1.5.7-1.7z" fill={SOCIAL} stroke="none"/>
  </svg>;
}

const styles = {
  screen: { position:'fixed',inset:0,display:'flex',flexDirection:'column',fontFamily:FONT,overflow:'hidden' },
  watermark: { position:'fixed',bottom:-60,left:-40,width:'70vw',maxWidth:280,opacity:0.05,pointerEvents:'none',zIndex:0 },
  glowOrb: { position:'fixed',borderRadius:'50%',pointerEvents:'none',zIndex:0,filter:'blur(2px)' },
  watermarkImg: { width:'100%' },

  content: { flex:1,padding:'0 16px',overflowY:'auto',overflowX:'hidden',position:'relative',zIndex:1,
    display:'flex',flexDirection:'column',gap:10,paddingBottom:130 },

  header: { padding:'22px 0 0',flexShrink:0,position:'relative',zIndex:1,
    display:'flex',alignItems:'center',justifyContent:'space-between',gap:10 },
  brandRow: { display:'flex',alignItems:'center',gap:10,minWidth:0 },
  brandMark: { width:44,height:44,borderRadius:14,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',
    position:'relative',boxShadow:'inset 0 1px 0 rgba(255,255,255,.14)' },
  brandMarkImg: { width:'70%',height:'70%',objectFit:'contain' },
  // Small avatar tucked on the logo button, so the profile menu it now opens
  // is still recognisable as "yours" at a glance.
  brandAvatar: { position:'absolute',bottom:-2,right:-2,width:17,height:17,borderRadius:'50%',
    objectFit:'cover',border:'2px solid rgba(0,0,0,.35)' },
  brandName: { fontFamily:FONT,fontWeight:800,letterSpacing:'-.02em',fontSize:15 },

  headerControls: { display:'flex',alignItems:'center',gap:8,flexShrink:0 },
  iconBtn: { width:36,height:36,borderRadius:12,display:'flex',alignItems:'center',justifyContent:'center',
    cursor:'pointer',position:'relative',boxShadow:'inset 0 1px 0 rgba(255,255,255,.1)' },
  badgeDot: { position:'absolute',top:5,right:5,width:7,height:7,borderRadius:'50%',background:DANGER },
  dropdown: { position:'absolute',top:'calc(100% + 8px)',right:0,width:270,zIndex:30,
    borderRadius:16,boxShadow:'0 8px 32px rgba(0,0,0,0.35)',overflow:'hidden',overflowY:'auto',maxHeight:'70vh' },
  menuItem: { width:'100%',background:'transparent',border:'none',cursor:'pointer',
    display:'flex',alignItems:'center',gap:10,padding:'10px 14px',fontFamily:FONT,fontSize:13,fontWeight:600 },

  card: { borderRadius:16 },

  greeting: { padding:'8px 2px 0' },
  eyebrow: { fontFamily:'ui-monospace, monospace',fontSize:10.5,letterSpacing:'.1em',textTransform:'uppercase',
    display:'flex',alignItems:'center',gap:8 },
  hello: { fontFamily:FONT,fontWeight:800,letterSpacing:'-.02em',fontSize:24,margin:'4px 0 4px' },
  helloName: { background:'linear-gradient(100deg,#C9A84C,#00C9A7 55%,#8f6ffb)',WebkitBackgroundClip:'text',backgroundClip:'text',color:'transparent' },

  navBar: { display:'flex',flexDirection:'row',alignItems:'flex-start',
    padding:'10px 2px 8px',gap:14,
    overflowX:'auto',overflowY:'hidden',WebkitOverflowScrolling:'touch',flexShrink:0,
    touchAction:'pan-x',scrollSnapType:'x mandatory' },
  navBtn: { background:'transparent',border:'none',padding:0,
    cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'flex-start',
    gap:6,width:94,flexShrink:0,scrollSnapAlign:'start' },
  navTileBadge: { width:72,height:72,borderRadius:24,display:'flex',alignItems:'center',justifyContent:'center',
    boxShadow:'0 4px 14px rgba(0,0,0,0.25)',flexShrink:0,position:'relative',
    backfaceVisibility:'hidden',WebkitBackfaceVisibility:'hidden' },
  navTileImg: { width:'100%',height:'100%',objectFit:'cover',display:'block' },
  navTileCount: { position:'absolute',top:-6,right:-8,minWidth:15,height:15,borderRadius:8,
    background:DANGER,color:'#fff',fontSize:9,fontWeight:700,
    display:'flex',alignItems:'center',justifyContent:'center',padding:'0 3px',
    boxShadow:'0 1px 4px rgba(0,0,0,0.3)' },
  navBtnLabel: { fontSize:12.5,fontWeight:700,textAlign:'center',lineHeight:1.2,width:'100%' },
  navBtnSublabel: { fontSize:9,fontWeight:600,textAlign:'center',lineHeight:1.25,width:'100%' },
  navDots: { display:'flex',justifyContent:'center',gap:6,padding:'2px 0 4px' },
  navDot: { width:6,height:6,borderRadius:'50%',transition:'background 0.2s,opacity 0.2s' },

  promoWrap: { padding:'4px 0 0' },
  promoTrack: { display:'flex',gap:14,overflowX:'auto',scrollSnapType:'x mandatory',WebkitOverflowScrolling:'touch' },
  promoCard: { scrollSnapAlign:'center',flex:'0 0 100%',borderRadius:20,padding:'16px 18px',
    display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,boxShadow:'0 4px 18px rgba(0,0,0,0.1)' },
  promoDots: { display:'flex',justifyContent:'center',gap:6,padding:'10px 0 2px' },
  dot: { height:6,borderRadius:4,border:'none',cursor:'pointer',padding:0,transition:'width .2s ease, background .2s ease' },

  searchBar: { display:'flex',alignItems:'center',gap:8,borderRadius:50,padding:'4px 4px 4px 18px',marginTop:6 },
  searchInput: { flex:1,background:'transparent',border:'none',outline:'none',fontSize:13.5,fontFamily:FONT,padding:'12px 0' },
  searchGo: { width:38,height:38,borderRadius:'50%',border:'none',cursor:'pointer',
    display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 },

  bodyGrid: { display:'grid',gridTemplateColumns:'52px 1fr',gap:12,padding:'8px 0 20px' },
  socialRail: { display:'flex',flexDirection:'column',gap:10,alignItems:'center' },
  socialIcon: { width:52,height:52,borderRadius:16,display:'flex',alignItems:'center',
    justifyContent:'center',overflow:'hidden',flexShrink:0,background:'#ffffff',
    boxShadow:'0 1px 4px rgba(0,0,0,0.15)' },
  stack: { display:'flex',flexDirection:'column',gap:12,minWidth:0 },

  stat: { flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:4,
    padding:'12px 6px',borderRadius:14 },
  statNum: { fontFamily:'ui-monospace, monospace',fontSize:15,fontWeight:700 },
  statLabel: { fontSize:9.5,letterSpacing:'.04em' },

  toast: { position:'fixed',bottom:90,left:'50%',transform:'translateX(-50%)',zIndex:40,
    borderRadius:20,padding:'10px 18px',fontSize:13,fontFamily:FONT,fontWeight:600,
    boxShadow:'0 4px 20px rgba(0,0,0,0.25)' },
};
