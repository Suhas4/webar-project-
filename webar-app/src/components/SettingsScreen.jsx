import { useState, useEffect, useCallback } from 'react';
import { API_BASE, R2_PUBLIC_URL } from '../config/api.js';
import { useTheme, THEME_LIST, themes as ALL_THEMES } from '../context/ThemeContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { invalidateGuestCache } from './GuestScanScreen.jsx';
import { invalidateBackgroundPublicCompile } from '../hooks/backgroundCompilePublic.js';
import { clearCachedPublicMind } from '../hooks/useMindCache.js';
import { uploadPresigned } from '../hooks/useArStorage.js';
import { TERMS_SECTIONS } from '../content/termsContent.js';

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const GOLD  = "#C9A84C";
const TEAL  = "#00C9A7";
const LIMIT = 250 * 1024 * 1024;

function fmtMB(bytes) { return (bytes / (1024 * 1024)).toFixed(1) + ' MB'; }

function readPref(key, def = false) {
  try { return localStorage.getItem(key) === 'true' ? true : localStorage.getItem(key) === 'false' ? false : def; }
  catch { return def; }
}
function savePref(key, val) { try { localStorage.setItem(key, String(val)); } catch {} }

export default function SettingsScreen({ onBack, onProfile, initialSection }) {
  const { colors, theme, setTheme } = useTheme();
  const { lang, tr: trFromContext } = useLanguage();
  const tr = trFromContext;
  const [openSection, setOpenSection] = useState(initialSection || null); // 'account'|'notifications'|'ar'|'subscription'|'support'|'about'|'theme'
  // Deep-linked from the Home profile menu (e.g. tapping "Account") — show
  // only that one section instead of the full Settings list.
  const isFocused = !!initialSection;
  const [openStorage, setOpenStorage] = useState(false);
  const [storage, setStorage]         = useState(null);
  const [storageLoading, setStorageLoading] = useState(false);
  const [showChangePw, setShowChangePw]     = useState(false);
  const [showHelpCenter, setShowHelpCenter] = useState(false);
  const [showContactSupport, setShowContactSupport] = useState(false);
  const [showAbout, setShowAbout]           = useState(false);
  const [showSubscribe, setShowSubscribe]   = useState(false);
  const [showPrivacy, setShowPrivacy]       = useState(false);
  const [showTerms, setShowTerms]           = useState(false);

  // Notification prefs
  const [smsAlerts,   setSmsAlerts]   = useState(() => readPref('memoera_sms_alerts'));
  const [pushNotif,   setPushNotif]   = useState(() => readPref('memoera_push_notif', true));

  // AR prefs
  const [soundScan,   setSoundScan]   = useState(() => readPref('memoera_sound_scan', true));
  const [autoFlash,   setAutoFlash]   = useState(() => readPref('memoera_auto_flash'));
  const [darkFlash,   setDarkFlash]   = useState(() => readPref('memoera_dark_flash'));
  // 'jsfeat' (Live Scan) and 'capture' (Capture & Scan) were both removed —
  // the manual capture-then-match pipeline never reliably matched targets, so
  // it's retired in favor of the one working engine (MindAR). Anyone who had
  // either saved gets migrated back to the default so ARScannerScreen doesn't
  // keep loading a no-longer-supported scanner file.
  useEffect(() => {
    try {
      const saved = localStorage.getItem('memoera_ar_engine');
      if (saved === 'jsfeat' || saved === 'capture') localStorage.setItem('memoera_ar_engine', 'mindar');
    } catch {}
  }, []);
  const [cacheCleared, setCacheCleared] = useState(false);

  // Support prefs
  const [analytics,   setAnalytics]   = useState(() => readPref('memoera_analytics', true));

  const toggle = (key, val, setter) => { savePref(key, val); setter(val); };

  const fetchStorage = () => {
    setStorageLoading(true);
    const token = localStorage.getItem('memoera_token') || '';
    fetch(API_BASE + '/api/storage', { headers: { Authorization: 'Bearer ' + token } })
      .then(r => r.json())
      .then(d => setStorage(d))
      .catch(() => {})
      .finally(() => setStorageLoading(false));
  };

  const toggleSection = (name) => {
    const next = openSection === name ? null : name;
    setOpenSection(next);
    if (next === 'account' && !storage) fetchStorage();
  };

  // Deep-linked straight into a section (e.g. from the Home profile menu) —
  // fetch whatever that section needs, same as if the user had tapped it.
  useEffect(() => {
    if (initialSection === 'account' && !storage) fetchStorage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const storageLimitBytes = storage?.limitBytes || LIMIT;
  const privatePct = storage ? (storage.unlimited ? 0 : Math.min(100, (storage.privateBytes / storageLimitBytes) * 100)) : 0;
  const publicPct  = storage ? (storage.unlimited ? 0 : Math.min(100, (storage.publicBytes  / storageLimitBytes) * 100)) : 0;

  const SECTION_TITLES = {
    account: tr.accountSection, notifications: tr.notificationsSection, ar: tr.arSettingsSection,
    theme: tr.themeSection, subscription: tr.subscriptionSection,
    support: tr.supportSection, about: tr.aboutUsSection,
  };

  return (
    <div style={{ ...s.screen, background: colors.bg }}>
      <div style={s.header}>
        <button onClick={onBack} style={{ ...s.backBtn, color: colors.textMuted }}>← {tr.back}</button>
        <h2 style={{ ...s.title, color: colors.text }}>
          {isFocused ? SECTION_TITLES[initialSection] || tr.settingsTitle || 'Settings' : (tr.settingsTitle || 'Settings')}
        </h2>
      </div>

      <div style={s.content}>

        {/* ── Account ── */}
        {(!isFocused || initialSection === 'account') && (
        <AccordionCard
          label={tr.accountSection || 'Account'} icon="👤"
          open={openSection === 'account'}
          onToggle={() => toggleSection('account')}
          colors={colors}
        >
          <RowButton label={tr.profile || 'Profile'} icon="🪪" hint={tr.hintEditProfile}
            onPress={onProfile} colors={colors} />
          <Divider colors={colors} />
          <RowButton label={tr.storage || 'Storage'} icon="💾" hint={tr.hintManageStorage}
            onPress={() => setOpenStorage(o => !o)} colors={colors}
            right={<span style={{ fontSize: 11, color: colors.textMuted }}>{openStorage ? '▲' : '▼'}</span>}
          />
          {openStorage && (
            <div style={s.storageBody}>
              {storageLoading ? (
                <p style={{ ...s.hint, color: colors.textMuted }}>{tr.loading || 'Loading...'}</p>
              ) : !storage ? (
                <p style={{ ...s.hint, color: colors.textMuted }}>Could not load storage info.</p>
              ) : (
                <>
                  <StorageBar label={tr.privateLabel || 'Private'} used={storage.privateBytes} pct={privatePct} colors={colors} color={GOLD} />
                  <StorageBar label={tr.publicLabel || 'Public'}  used={storage.publicBytes}  pct={publicPct}  colors={colors} color={TEAL} />
                  <p style={{ ...s.hint, color: colors.textMuted }}>
                    Plan: {(storage.plan || 'free')[0].toUpperCase() + (storage.plan || 'free').slice(1)}
                    {' · '}
                    {storage.unlimited
                      ? 'Unlimited storage'
                      : `Limit: ${(storageLimitBytes / 1024 / 1024).toFixed(0)} MB per type${storage.bonusBytes ? ` (incl. +${Math.round(storage.bonusBytes / 1024 / 1024)} MB bonus)` : ''}`}
                  </p>
                </>
              )}
            </div>
          )}
          <Divider colors={colors} />
          <RowButton label={tr.changePassword || 'Change Password'} icon="🔑" hint={tr.hintChangePassword}
            onPress={() => setShowChangePw(true)} colors={colors} />
        </AccordionCard>
        )}

        {/* ── Notifications ── */}
        {(!isFocused || initialSection === 'notifications') && (
        <AccordionCard
          label={tr.notificationsSection || 'Notifications'} icon="🔔"
          open={openSection === 'notifications'}
          onToggle={() => toggleSection('notifications')}
          colors={colors}
        >
          <ToggleRow label={tr.smsAlerts || 'SMS Alerts'} hint={tr.hintSmsAlerts}
            value={smsAlerts} onChange={v => toggle('memoera_sms_alerts', v, setSmsAlerts)} colors={colors} />
          <Divider colors={colors} />
          <ToggleRow label={tr.pushNotifications || 'Push Notifications'} hint={tr.hintPushNotif}
            value={pushNotif} onChange={v => toggle('memoera_push_notif', v, setPushNotif)} colors={colors} />
          <Divider colors={colors} />
          <NotificationPermissionRow colors={colors} />
        </AccordionCard>
        )}

        {/* ── AR Settings ── */}
        {(!isFocused || initialSection === 'ar') && (
        <AccordionCard
          label={tr.arSettingsSection || 'AR Settings'} icon="🔭"
          open={openSection === 'ar'}
          onToggle={() => toggleSection('ar')}
          colors={colors}
        >
          <ToggleRow label={tr.soundOnScan || 'Sound on Scan'} hint={tr.hintSoundScan}
            value={soundScan} onChange={v => toggle('memoera_sound_scan', v, setSoundScan)} colors={colors} />
          <Divider colors={colors} />
          <ToggleRow label={tr.autoFlash || 'Auto Flash'} hint={tr.hintAutoFlash}
            value={autoFlash} onChange={v => toggle('memoera_auto_flash', v, setAutoFlash)} colors={colors} />
          <Divider colors={colors} />
          <ToggleRow label={tr.enableFlashDark || 'Enable Flash in Dark'} hint={tr.hintFlashDark}
            value={darkFlash} onChange={v => toggle('memoera_dark_flash', v, setDarkFlash)} colors={colors} />
          <Divider colors={colors} />
          <div style={{ padding: '10px 0 2px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: colors.text, marginBottom: 2 }}>Guest Scan Cache</div>
            <div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 10 }}>
              Clears the cached scan data guests use when scanning your public content.
            </div>
            <button onClick={() => {
                invalidateGuestCache();
                invalidateBackgroundPublicCompile();
                clearCachedPublicMind();
                setCacheCleared(true);
                setTimeout(() => setCacheCleared(false), 2500);
              }}
              style={{ width: '100%', marginTop: 12, padding: '9px 0', borderRadius: 20, cursor: 'pointer',
                fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
                border: `1px solid ${colors.border}`, background: 'transparent', color: colors.textMuted }}>
              {cacheCleared ? '✓ Scan cache cleared' : '🗑 Clear Scan Cache'}
            </button>
            <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 6 }}>
              Forces a fresh scan-data rebuild next time a guest scans your public content.
            </div>
          </div>
        </AccordionCard>
        )}

        {/* ── Appearance / Theme ── */}
        {(!isFocused || initialSection === 'theme') && (
        <AccordionCard
          label={tr.themeSection || 'Appearance'} icon="🎨"
          open={openSection === 'theme'}
          onToggle={() => toggleSection('theme')}
          colors={colors}
        >
          {THEME_LIST.map((t, i) => {
            const tc     = ALL_THEMES[t.id];
            const active = theme === t.id;
            const accent = tc?.accent || TEAL;
            return (
              <div key={t.id}>
                {i > 0 && <Divider colors={colors} />}
                <button onClick={() => setTheme(t.id)} style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 14,
                  background: 'transparent', border: 'none', padding: '13px 6px',
                  cursor: 'pointer', textAlign: 'left',
                }}>
                  {/* Colour swatch */}
                  <div style={{
                    width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                    background: `linear-gradient(135deg, ${accent}, ${tc?.navIcon || accent}88)`,
                    boxShadow: active ? `0 0 10px ${accent}88` : 'none',
                    border: active ? `2px solid ${accent}` : '2px solid transparent',
                    transition: 'box-shadow 0.25s, border-color 0.25s',
                  }} />
                  <span style={{ fontSize: 20 }}>{t.emoji}</span>
                  <span style={{
                    flex: 1, fontSize: 15, fontFamily: FONT,
                    fontWeight: active ? 700 : 500,
                    color: active ? accent : colors.text,
                  }}>{t.label}</span>
                  {active
                    ? <span style={{ fontSize: 18, color: accent, lineHeight: 1 }}>✓</span>
                    : <span style={{ fontSize: 16, color: colors.textMuted }}>›</span>}
                </button>
              </div>
            );
          })}
          <div style={{ height: 6 }} />
        </AccordionCard>
        )}

        {/* ── Subscription ── */}
        {(!isFocused || initialSection === 'subscription') && (
        <AccordionCard
          label={tr.subscriptionSection || 'Subscription'} icon="💎"
          open={openSection === 'subscription'}
          onToggle={() => toggleSection('subscription')}
          colors={colors}
        >
          <RowButton label={tr.upgradePremium || 'Upgrade to Premium'} icon="⭐" hint={tr.hintUpgradePremium}
            onPress={() => setShowSubscribe(true)} colors={colors} />
          <Divider colors={colors} />
          <RowButton label={tr.restorePurchase} icon="🔄" hint={tr.hintRestorePurchase}
            onPress={() => alert('No active subscription found for this account.')} colors={colors} />
        </AccordionCard>
        )}

        {/* ── Support ── */}
        {(!isFocused || initialSection === 'support') && (
        <AccordionCard
          label={tr.supportSection || 'Support'} icon="💬"
          open={openSection === 'support'}
          onToggle={() => toggleSection('support')}
          colors={colors}
        >
          <ToggleRow label={tr.analytics || 'Analytics'} hint={tr.hintAnalytics}
            value={analytics} onChange={v => toggle('memoera_analytics', v, setAnalytics)} colors={colors} />
          <Divider colors={colors} />
          <RowButton label={tr.helpCenter || 'Help Center'} icon="📚" hint={tr.hintHelpCenter}
            onPress={() => setShowHelpCenter(true)} colors={colors} />
          <Divider colors={colors} />
          <RowButton label={tr.contactSupport || 'Contact Support'} icon="🛎️" hint="memoerabangalore@gmail.com"
            onPress={() => setShowContactSupport(true)} colors={colors} />
          <Divider colors={colors} />
          <RowButton label={tr.aboutApp || 'About Memoera'} icon="ℹ️" hint={tr.hintAboutApp}
            onPress={() => setShowAbout(true)} colors={colors} />
        </AccordionCard>
        )}

        {/* ── About Us & Company Details ── */}
        {(!isFocused || initialSection === 'about') && (
        <AccordionCard
          label={tr.aboutUsSection || 'About Us'} icon="🏢"
          open={openSection === 'about'}
          onToggle={() => toggleSection('about')}
          colors={colors}
        >
          <div style={{ padding: '16px 6px 8px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <img src="/logo1.png" alt="Memoera" style={{ width: 52, height: 'auto', borderRadius: 10 }} />
              <div>
                <div style={{ fontSize: 17, fontWeight: 700, color: colors.text, fontFamily: FONT }}>Memoera</div>
                <div style={{ fontSize: 11, color: colors.textMuted, fontFamily: FONT }}>Version 1.0.0</div>
              </div>
            </div>
            <p style={{ fontSize: 13, color: colors.textMuted, fontFamily: FONT, lineHeight: 1.6, margin: 0 }}>
              Memoera is an Augmented Reality memory platform that lets you bring your memories to life. Scan AR targets and relive precious moments in a whole new dimension.
            </p>
          </div>
          <Divider colors={colors} />
          <CompanyRow icon="🏬" label="Company" value="Memoera (OPC) Private Limited" colors={colors} />
          <Divider colors={colors} />
          <CompanyRow icon="📍" label="Location" value="Bengaluru, Karnataka, India" colors={colors} />
          <Divider colors={colors} />
          <CompanyRow icon="📧" label="Email" value="memoerabangalore@gmail.com" colors={colors} />
          <Divider colors={colors} />
          <RowButton label={tr.privacyPolicy || 'Privacy Policy'} icon="🔒" hint={tr.hintPrivacyPolicy}
            onPress={() => setShowPrivacy(true)} colors={colors} />
          <Divider colors={colors} />
          <RowButton label={tr.termsOfService || 'Terms & Conditions'} icon="📄" hint={tr.hintTerms}
            onPress={() => setShowTerms(true)} colors={colors} />
          <Divider colors={colors} />
          <div style={{ padding: '10px 6px 6px', textAlign: 'center' }}>
            <span style={{ fontSize: 11, color: colors.textMuted, fontFamily: FONT }}>© 2025 Memoera (OPC) Private Limited · All rights reserved</span>
            <div style={{ fontSize: 10, color: colors.textMuted, fontFamily: FONT, fontStyle: 'italic', marginTop: 4 }}>
              This app is built by the Memoera Team, with the help of Claude AI.
            </div>
          </div>
        </AccordionCard>
        )}

      </div>

      {/* ── Modals ── */}
      {showChangePw   && <ChangePasswordModal   onClose={() => setShowChangePw(false)}   colors={colors} />}
      {showHelpCenter && <HelpCenterModal        onClose={() => setShowHelpCenter(false)} colors={colors} />}
      {showContactSupport && <ContactSupportModal onClose={() => setShowContactSupport(false)} colors={colors} />}
      {showAbout      && <AboutModal             onClose={() => setShowAbout(false)}      colors={colors} />}
      {showSubscribe  && <SubscribeModal         onClose={() => setShowSubscribe(false)}  colors={colors} />}
      {showPrivacy    && <PrivacyPolicyModal     onClose={() => setShowPrivacy(false)}    colors={colors} />}
      {showTerms      && <TermsModal             onClose={() => setShowTerms(false)}      colors={colors} />}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function AccordionCard({ label, icon, open, onToggle, colors, children }) {
  return (
    <div style={{
      borderRadius: 18, border: `1.5px dashed ${TEAL}`,
      background: colors.cardBg || colors.surface,
      marginBottom: 12, overflow: 'hidden',
      backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
    }}>
      <button onClick={onToggle} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 12,
        background: 'transparent', border: 'none', padding: '16px 18px',
        cursor: 'pointer', textAlign: 'left',
      }}>
        <span style={{
          width: 40, height: 40, borderRadius: 12, fontSize: 18,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `linear-gradient(135deg, ${TEAL}, #00E5CC)`,
          boxShadow: `0 3px 10px ${TEAL}44`,
          flexShrink: 0,
        }}>{icon}</span>
        <span style={{ flex: 1, fontSize: 15, fontWeight: 700, color: colors.text, fontFamily: FONT }}>
          {label}
        </span>
        <span style={{
          fontSize: 10, color: TEAL,
          transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.25s',
          display: 'inline-block',
        }}>▼</span>
      </button>
      {open && (
        <div style={{ padding: '0 18px', borderTop: `1px solid ${colors.border}` }}>
          {children}
        </div>
      )}
    </div>
  );
}

function Divider({ colors }) {
  return <div style={{ height: 1, background: colors.border, margin: '0 2px' }} />;
}

function RowButton({ label, icon, hint, onPress, colors, right }) {
  return (
    <button onClick={onPress} style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: 12,
      background: 'transparent', border: 'none', padding: '14px 6px',
      cursor: 'pointer', textAlign: 'left',
    }}>
      {icon && <span style={{ fontSize: 20 }}>{icon}</span>}
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: colors.text, fontFamily: FONT }}>{label}</div>
        {hint && <div style={{ fontSize: 11, color: colors.textMuted, fontFamily: FONT, marginTop: 2 }}>{hint}</div>}
      </div>
      {right ?? <span style={{ fontSize: 16, color: colors.textMuted }}>›</span>}
    </button>
  );
}

// The two toggles above are app-level preferences stored in localStorage — they
// can't do anything if the OS itself has notifications blocked. This row shows
// the real permission state and is the only way to actually request it.
// Uses the Web Notification API, which the Android WebView honours, so it needs
// no extra Capacitor plugin.
function NotificationPermissionRow({ colors }) {
  const supported = typeof window !== 'undefined' && 'Notification' in window;
  const [status, setStatus] = useState(() => (supported ? Notification.permission : 'unsupported'));
  const [busy, setBusy] = useState(false);

  // Permission can change from Android's app-settings screen while we're
  // backgrounded, so re-read it whenever the user returns to the app.
  useEffect(() => {
    if (!supported) return;
    const sync = () => { if (!document.hidden) setStatus(Notification.permission); };
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, [supported]);

  const request = async () => {
    if (!supported || busy) return;
    setBusy(true);
    try {
      setStatus(await Notification.requestPermission());
    } catch {
      setStatus(Notification.permission);
    } finally {
      setBusy(false);
    }
  };

  const meta = {
    granted:  { text: 'Allowed',      color: TEAL,   hint: 'Memoera can show notifications on this device.' },
    denied:   { text: 'Blocked',      color: '#FF6B6B', hint: 'Blocked for this app. Re-enable it in your device Settings › Apps › Memoera › Notifications.' },
    default:  { text: 'Not asked',    color: colors.textMuted, hint: 'Allow notifications so streak reminders and festival greetings can reach you.' },
    unsupported: { text: 'Unavailable', color: colors.textMuted, hint: 'This device or browser does not support notifications.' },
  }[status] || { text: status, color: colors.textMuted, hint: '' };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 6px' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: colors.text, fontFamily: FONT }}>
          Notification Permissions
        </div>
        <div style={{ fontSize: 11, color: colors.textMuted, fontFamily: FONT, marginTop: 2, lineHeight: 1.45 }}>
          {meta.hint}
        </div>
      </div>
      {status === 'default' ? (
        <button onClick={request} disabled={busy} style={{
          flexShrink: 0, background: 'transparent', border: `1px solid ${TEAL}`, color: TEAL,
          borderRadius: 20, padding: '7px 15px', fontSize: 12, fontWeight: 700,
          fontFamily: FONT, cursor: 'pointer',
        }}>{busy ? '…' : 'Allow'}</button>
      ) : (
        <span style={{
          flexShrink: 0, fontSize: 11.5, fontWeight: 700, color: meta.color, fontFamily: FONT,
          border: `1px solid ${meta.color}55`, borderRadius: 20, padding: '5px 12px',
        }}>{meta.text}</span>
      )}
    </div>
  );
}

function ToggleRow({ label, hint, value, onChange, colors }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 6px' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: colors.text, fontFamily: FONT }}>{label}</div>
        {hint && <div style={{ fontSize: 11, color: colors.textMuted, fontFamily: FONT, marginTop: 2 }}>{hint}</div>}
      </div>
      <Toggle value={value} onChange={onChange} />
    </div>
  );
}

function Toggle({ value, onChange }) {
  return (
    <div
      onClick={() => onChange(!value)}
      style={{
        width: 48, height: 26, borderRadius: 13, flexShrink: 0,
        background: value ? TEAL : 'rgba(128,128,128,0.35)',
        position: 'relative', cursor: 'pointer',
        transition: 'background 0.25s',
      }}>
      <div style={{
        position: 'absolute', top: 3, left: value ? 25 : 3,
        width: 20, height: 20, borderRadius: '50%',
        background: '#fff',
        transition: 'left 0.25s',
        boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
      }} />
    </div>
  );
}

function CompanyRow({ icon, label, value, colors }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 6px' }}>
      <span style={{ fontSize: 18, marginTop: 1 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, color: colors.textMuted, fontFamily: FONT, marginBottom: 2, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</div>
        <div style={{ fontSize: 14, color: colors.text, fontFamily: FONT }}>{value}</div>
      </div>
    </div>
  );
}

function StorageBar({ label, used, pct, colors, color }) {
  return (
    <div style={{ marginBottom: 14, padding: '0 6px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 13, color: colors.text, fontFamily: FONT }}>{label}</span>
        <span style={{ fontSize: 12, color: colors.textMuted, fontFamily: FONT }}>{fmtMB(used)} / 250 MB</span>
      </div>
      <div style={{ height: 7, borderRadius: 4, background: 'rgba(128,128,128,0.2)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: pct + '%', background: color, borderRadius: 4, transition: 'width 0.4s ease' }} />
      </div>
    </div>
  );
}

// ── Change Password Modal ─────────────────────────────────────────────────────

function ChangePasswordModal({ onClose, colors }) {
  const [current, setCurrent]   = useState('');
  const [newPw, setNewPw]       = useState('');
  const [confirm, setConfirm]   = useState('');
  const [loading, setLoading]   = useState(false);
  const [msg, setMsg]           = useState('');
  const [isErr, setIsErr]       = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  const validate = () => {
    const errors = {};
    if (!current) errors.current = 'Current password is required.';
    if (!newPw) {
      errors.newPw = 'New password is required.';
    } else if (newPw.length < 6) {
      errors.newPw = 'New password must be at least 6 characters.';
    }
    if (!confirm) {
      errors.confirm = 'Please confirm your new password.';
    } else if (newPw && newPw !== confirm) {
      errors.confirm = 'New passwords do not match.';
    }
    return errors;
  };

  const handleSubmit = async () => {
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setLoading(true); setMsg('');
    try {
      const token = localStorage.getItem('memoera_token') || '';
      const res = await fetch(API_BASE + '/api/auth/change-password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ currentPassword: current, newPassword: newPw }),
      });
      let data = {};
      try { data = await res.json(); } catch {}
      if (res.status === 401) {
        setMsg('Session expired. Please sign out and sign in again.'); setIsErr(true); return;
      }
      if (!res.ok) { setMsg(data.error || `Error ${res.status}. Please try again.`); setIsErr(true); return; }
      setMsg('✓ Password updated successfully!'); setIsErr(false);
      setTimeout(onClose, 1800);
    } catch (err) {
      setMsg('Cannot reach server. Check your internet connection.'); setIsErr(true);
    } finally {
      setLoading(false);
    }
  };

  /* Stand-alone modal so the Submit button is always visible above the keyboard */
  return (
    <>
      <div style={s.modalBackdrop} onClick={onClose} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 301,
        background: colors.surface,
        borderRadius: '24px 24px 0 0',
        padding: '12px 20px 0',
        display: 'flex', flexDirection: 'column',
        maxHeight: '90vh',
      }}>
        {/* Handle */}
        <div style={s.modalHandle} />

        {/* Title */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ flex: 1, fontSize: 17, fontWeight: 700, color: colors.text, fontFamily: FONT, margin: 0 }}>
            Change Password
          </h3>
          <button onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: colors.textMuted, fontSize: 20, cursor: 'pointer', padding: '0 4px' }}>
            ✕
          </button>
        </div>

        {/* Scrollable inputs */}
        <div style={{ overflowY: 'auto', flex: 1, paddingBottom: 8 }}>
          <PwInput label="Current Password" value={current} onChange={(v) => { setCurrent(v); setFieldErrors(fe => ({ ...fe, current: undefined })); }} error={fieldErrors.current} colors={colors} />
          <PwInput label="New Password"     value={newPw}   onChange={(v) => { setNewPw(v); setFieldErrors(fe => ({ ...fe, newPw: undefined })); }}   error={fieldErrors.newPw} colors={colors} />
          <PwInput label="Confirm New"      value={confirm} onChange={(v) => { setConfirm(v); setFieldErrors(fe => ({ ...fe, confirm: undefined })); }} error={fieldErrors.confirm} colors={colors} />
          {msg && (
            <p style={{ fontSize: 13, color: isErr ? '#ff6b6b' : TEAL, fontFamily: FONT,
              textAlign: 'center', margin: '4px 0 0', lineHeight: 1.5 }}>
              {msg}
            </p>
          )}
        </div>

        {/* Submit — always visible, outside the scroll area */}
        <div style={{ paddingBottom: 40, paddingTop: 12 }}>
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{ ...s.submitBtn, background: loading ? 'rgba(0,201,167,0.4)' : TEAL }}>
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </div>
      </div>
    </>
  );
}

function PwInput({ label, value, onChange, error, colors }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ marginBottom: 12 }}>
      <p style={{ fontSize: 11, color: colors.textMuted, fontFamily: FONT, margin: '0 0 4px', letterSpacing: '0.06em' }}>
        {label.toUpperCase()}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', background: colors.surface,
        border: '1px solid ' + (error ? '#FF6B6B' : colors.border), borderRadius: 10, overflow: 'hidden' }}>
        <input
          type={show ? 'text' : 'password'} value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={label}
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none',
            color: colors.text, fontSize: 14, fontFamily: FONT, padding: '12px 14px' }}
        />
        <button onClick={() => setShow(s => !s)}
          style={{ background: 'transparent', border: 'none', padding: '0 14px', cursor: 'pointer',
            color: colors.textMuted, fontSize: 14 }}>
          {show ? '🙈' : '👁️'}
        </button>
      </div>
      {error && <p style={{ fontSize: 11, fontWeight: 600, color: '#FF6B6B', fontFamily: FONT, margin: '4px 2px 0' }}>⚠ {error}</p>}
    </div>
  );
}

// ── Help Center Modal ─────────────────────────────────────────────────────────

const FAQ = [
  {
    q: "How do I scan an AR target?",
    a: "Tap the 'Scan' button on the Home screen. The camera will open automatically. Hold your phone steady and point it at any registered AR target image — keep it well-lit and fully in frame. Within 1–3 seconds, Memoera will recognise the target and your linked memory (video, photo, or URL) will play in Augmented Reality right on top of the target. If scanning is slow, try moving closer, improving lighting, or reducing camera shake.",
  },
  {
    q: "How do I upload a new AR target?",
    a: "Go to Home → Upload Target. Choose 'Private' (only visible to you) or 'Public' (visible to all Memoera users). Upload a clear, high-contrast photo as your target image — printed photos, posters, or product labels work best. Then attach a video, image, or URL as the AR overlay. Once uploaded, scanning that image anywhere will play your linked memory.",
  },
  {
    q: "Why isn't my scan recognising the target?",
    a: "Several factors affect recognition: (1) Poor lighting — enable the torch in AR Settings or move to a brighter area. (2) Target image quality — blurry, low-contrast, or heavily repeated patterns (like plain text) scan poorly; use images with rich visual detail. (3) Distance & angle — hold the phone 20–40 cm from the target and keep it as parallel as possible. (4) Re-upload with a sharper photo if needed. (5) Check that camera permission is granted in your device Settings → Apps → Memoera → Permissions.",
  },
  {
    q: "What is the difference between Private and Public targets?",
    a: "Private targets are encrypted and stored in your personal cloud space — only your account can recognise and play them when scanning. Public targets are indexed in Memoera's global database, so anyone using the app can scan the same image and see your AR memory. Public targets are great for businesses, events, or greeting cards. Private targets are ideal for personal family memories, confidential documents, or gifts.",
  },
  {
    q: "How much cloud storage do I get?",
    a: "Every free Memoera account includes 250 MB for private targets and 250 MB for public targets — 500 MB total. You can earn bonus storage (up to 100 MB extra) by watching short ad videos or referring friends. Premium subscribers get up to 2 GB of combined storage. Storage usage is shown under Settings → Account → Storage.",
  },
  {
    q: "How do I delete a target?",
    a: "Go to Gallery, find the target you want to remove, and tap on it to expand the details. Tap the Delete / Trash icon in the expanded view and confirm. Deletion is permanent — the target image, linked media, and all recognition data are removed from our servers immediately. If the target was Public, it will no longer be recognisable by any user.",
  },
  {
    q: "What file types can I use for AR overlays?",
    a: "For target images: JPEG or PNG (minimum 300×300 px, under 5 MB). For AR overlays you can link: MP4 videos (recommended, under 50 MB), YouTube/Vimeo URLs, image URLs (JPEG/PNG), or any webpage URL. Videos play inline in the AR view. URLs open in a browser overlay. Keep videos short (under 2 minutes) for best loading performance on mobile networks.",
  },
  {
    q: "Why does the AR overlay appear blurry or misaligned?",
    a: "Overlay alignment depends on how well the app tracks the target in real time. For the sharpest result: (1) Ensure the physical target is flat (no wrinkles/creases). (2) Keep the target image high-resolution when uploading. (3) Avoid scanning under direct glare or harsh shadows. (4) Hold the phone steady and let the tracker stabilise for 1–2 seconds before moving. If misalignment persists, re-upload the target with a higher-resolution image.",
  },
  {
    q: "How does the auto torch / flash feature work?",
    a: "When Auto Flash is enabled (Settings → AR Settings), Memoera samples the camera feed every 2 seconds and measures ambient brightness. If the scene is too dark (average brightness below threshold), the phone's LED torch turns on automatically so the AR tracker can see the target clearly. When brightness returns to a comfortable level, the torch turns off. You can also toggle the torch manually using the 🔦 button on the scan screen.",
  },
  {
    q: "Is my data private and secure?",
    a: "Yes. All media and target data is stored on Amazon Web Services (AWS S3) with AES-256 encryption at rest and TLS 1.2+ encryption in transit. Private targets are isolated per-account and cannot be accessed by other users or Memoera staff without a verified legal request. We do not sell your personal data. See our full Privacy Policy in Settings → About Us → Privacy Policy for complete details.",
  },
  {
    q: "How do I change the app language?",
    a: "Go to Home → Settings icon (top right) or open the Profile. Tap Language and choose from the 16+ supported languages including English, Kannada, Hindi, Tamil, Telugu, French, Spanish, and more. All app text — menus, labels, instructions, and notifications — will switch immediately. The language preference is saved to your account.",
  },
  {
    q: "How does the Refer a Friend programme work?",
    a: "Tap Home → Refer a Friend to find your unique referral code. Share it via WhatsApp or copy it. When a new user creates a Memoera account and enters your code during sign-up, both of you receive a bonus storage reward instantly. There is no limit to how many people you can refer.",
  },
  {
    q: "What happens if I exceed my storage limit?",
    a: "When you approach your storage limit, you will see a warning in Settings → Account → Storage. Once the limit is reached, you will not be able to upload new targets until you delete existing ones to free space, earn bonus storage, or upgrade to a Premium plan. Existing targets will continue to work normally — reaching the limit only prevents new uploads.",
  },
  {
    q: "How do I upgrade to Premium?",
    a: "Go to Settings → Subscription → Upgrade to Premium. Choose a Monthly (₹99/month) or Yearly (₹799/year) plan. Payment is processed securely via Razorpay and supports Google Pay, PhonePe, UPI, credit/debit cards, and net banking. Premium unlocks up to 2 GB storage, removes ads, and grants priority AR processing. To restore a previous purchase, tap 'Restore Purchase'.",
  },
  {
    q: "How do I contact support?",
    a: "Email us at memoerabangalore@gmail.com with a description of your issue and your registered mobile number or email. We typically respond within 24–48 hours on working days. For urgent issues, include your device model, Android version, and a screenshot or screen recording of the problem. You can also reach us through the Contact Support button in Settings → Support.",
  },
];

function HelpCenterModal({ onClose, colors }) {
  const [openIdx, setOpenIdx] = useState(null);
  return (
    <BottomModal title="Help Centre — FAQ & Tutorials" onClose={onClose} colors={colors} tall>
      <p style={{ fontSize: 12, color: colors.textMuted, fontFamily: FONT, margin: '0 0 14px', lineHeight: 1.5 }}>
        Find answers to the most common questions below. Tap any question to expand the full answer.
      </p>
      {FAQ.map((item, i) => (
        <div key={i} style={{
          marginBottom: 8, borderRadius: 12, overflow: 'hidden',
          border: `1px solid ${openIdx === i ? (colors.accent || TEAL) + '66' : colors.border}`,
          background: openIdx === i ? `${colors.accent || TEAL}0A` : 'transparent',
          transition: 'border-color 0.2s',
        }}>
          <button onClick={() => setOpenIdx(openIdx === i ? null : i)}
            style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: 'transparent', border: 'none', padding: '13px 14px', cursor: 'pointer', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: openIdx === i ? (colors.accent || TEAL) : colors.text,
              fontFamily: FONT, textAlign: 'left', flex: 1, lineHeight: 1.4 }}>
              {item.q}
            </span>
            <span style={{
              fontSize: 10, color: colors.textMuted, flexShrink: 0,
              transform: openIdx === i ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s', display: 'inline-block',
            }}>▼</span>
          </button>
          {openIdx === i && (
            <div style={{ padding: '0 14px 14px', borderTop: `1px solid ${colors.border}` }}>
              <p style={{ fontSize: 13, color: colors.textMuted, fontFamily: FONT, margin: '10px 0 0', lineHeight: 1.7 }}>
                {item.a}
              </p>
            </div>
          )}
        </div>
      ))}
      <div style={{ marginTop: 10, padding: '14px', borderRadius: 12, background: `${TEAL}12`,
        border: `1px solid ${TEAL}33` }}>
        <p style={{ fontSize: 12, color: TEAL, fontFamily: FONT, margin: 0, lineHeight: 1.6, fontWeight: 600 }}>
          Still need help?
        </p>
        <p style={{ fontSize: 12, color: colors.textMuted, fontFamily: FONT, margin: '4px 0 0', lineHeight: 1.5 }}>
          Email us at <span style={{ color: TEAL }}>memoerabangalore@gmail.com</span> — we typically respond within 24 hours on working days.
        </p>
      </div>
    </BottomModal>
  );
}

// ── Contact Support Modal ─────────────────────────────────────────────────────
// Lets the user describe their problem in their own words and attach a photo
// and/or a short screen recording — much easier to explain a scanning/camera
// problem that way than typing it out. Attachments upload straight to R2 (the
// same presigned-URL flow used for AR targets), then we hand off to the
// user's own email app with everything filled in and linked — no new backend
// or email server needed to make this work today.
function ContactSupportModal({ onClose, colors }) {
  const [message, setMessage]   = useState('');
  const [photo, setPhoto]       = useState(null);
  const [video, setVideo]       = useState(null);
  const [sending, setSending]   = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError]       = useState('');

  const handleSend = useCallback(async () => {
    if (!message.trim()) { setError('Please describe the problem you\'re facing.'); return; }
    setError(''); setSending(true);
    try {
      const token = localStorage.getItem('memoera_token') || '';
      if (!token) throw new Error('Please sign in to attach files to a support request.');

      let userID = null;
      if (photo || video) {
        setProgress('Preparing…');
        const meRes = await fetch(`${API_BASE}/api/me`, { headers: { Authorization: 'Bearer ' + token } });
        if (!meRes.ok) throw new Error('Could not verify your account. Try again.');
        ({ id: userID } = await meRes.json());
      }

      const ts = Date.now();
      const links = [];

      if (photo) {
        setProgress('Uploading photo…');
        const ext = (photo.name.split('.').pop() || 'jpg').toLowerCase();
        const key = `users/${userID}/support/${ts}-photo.${ext}`;
        await uploadPresigned(key, photo, photo.type || 'image/jpeg');
        links.push(`Photo: ${R2_PUBLIC_URL}/${key}`);
      }
      if (video) {
        setProgress('Uploading video…');
        const ext = (video.name.split('.').pop() || 'mp4').toLowerCase();
        const key = `users/${userID}/support/${ts}-video.${ext}`;
        await uploadPresigned(key, video, video.type || 'video/mp4');
        links.push(`Video: ${R2_PUBLIC_URL}/${key}`);
      }

      setProgress('Opening email…');
      const bodyParts = [message.trim(), '', ...links];
      const mailto = `mailto:memoerabangalore@gmail.com`
        + `?subject=${encodeURIComponent('Memoera Support Request')}`
        + `&body=${encodeURIComponent(bodyParts.join('\n'))}`;
      window.open(mailto, '_blank');
      onClose();
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSending(false);
      setProgress('');
    }
  }, [message, photo, video, onClose]);

  return (
    <BottomModal title="Contact Support" onClose={onClose} colors={colors}>
      <p style={{ fontSize: 12, color: colors.textMuted, fontFamily: FONT, margin: '0 0 14px', lineHeight: 1.6 }}>
        Describe the problem — if it's about scanning or the camera, attaching a photo or a short screen
        recording helps us see exactly what you're seeing.
      </p>

      <label style={{ display: 'block', fontSize: 11, color: colors.textMuted, fontFamily: FONT,
        margin: '0 0 4px', letterSpacing: '0.06em' }}>
        MESSAGE
      </label>
      <textarea
        value={message} onChange={(e) => setMessage(e.target.value)}
        placeholder="What went wrong? What were you trying to do?"
        rows={4}
        style={{
          width: '100%', resize: 'vertical', borderRadius: 12, padding: '10px 12px',
          border: `1px solid ${colors.border}`, background: colors.bg, color: colors.text,
          fontFamily: FONT, fontSize: 13, lineHeight: 1.5, marginBottom: 14,
        }}
      />

      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <AttachPicker
          label={photo ? photo.name : 'Add Photo'} icon="📷" accept="image/*"
          onPick={setPhoto} active={!!photo} colors={colors}
        />
        <AttachPicker
          label={video ? video.name : 'Add Video'} icon="🎥" accept="video/*"
          onPick={setVideo} active={!!video} colors={colors}
        />
      </div>

      {error && (
        <p style={{ fontSize: 12, color: '#FF6B6B', fontFamily: FONT, margin: '0 0 12px', lineHeight: 1.5 }}>
          {error}
        </p>
      )}

      <button onClick={handleSend} disabled={sending} style={{
        width: '100%', border: 'none', cursor: sending ? 'default' : 'pointer',
        background: `linear-gradient(135deg, ${TEAL}, #00E5CC)`, color: '#040D0B',
        fontSize: 14, fontWeight: 700, fontFamily: FONT, padding: '13px 0', borderRadius: 50,
        opacity: sending ? 0.7 : 1,
      }}>
        {sending ? (progress || 'Sending…') : 'Send to Support →'}
      </button>
    </BottomModal>
  );
}

function AttachPicker({ label, icon, accept, onPick, active, colors }) {
  return (
    <label style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      border: `1px dashed ${active ? TEAL : colors.border}`, borderRadius: 12,
      background: active ? `${TEAL}12` : 'transparent',
      padding: '11px 8px', cursor: 'pointer', fontFamily: FONT,
      fontSize: 11.5, fontWeight: 600, color: active ? TEAL : colors.textMuted,
      textAlign: 'center', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
    }}>
      <span>{icon}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      <input type="file" accept={accept} style={{ display: 'none' }}
        onChange={(e) => onPick(e.target.files?.[0] || null)} />
    </label>
  );
}

// ── About Modal ───────────────────────────────────────────────────────────────

function AboutModal({ onClose, colors }) {
  return (
    <BottomModal title="About Memoera" onClose={onClose} colors={colors}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '8px 0' }}>
        <img src="/logo1.png" alt="Memoera" style={{ width: 80, height: 'auto', borderRadius: 14 }} />
        <p style={{ fontSize: 22, fontWeight: 700, color: colors.text, fontFamily: FONT, margin: 0 }}>
          <span style={{ color: colors.text }}>memo</span><span style={{ color: TEAL }}>era</span>
        </p>
        <p style={{ fontSize: 12, color: colors.textMuted, fontFamily: FONT, margin: 0, letterSpacing: '0.1em' }}>
          VERSION 1.0.0 · Memoera (OPC) Private Limited
        </p>
        <p style={{ fontSize: 13, color: colors.textMuted, fontFamily: FONT, textAlign: 'center', lineHeight: 1.7, margin: '8px 0' }}>
          Memoera is an Augmented Reality memory platform that lets you bring your memories to life. Scan AR targets and relive precious moments in a whole new dimension.
        </p>
        <p style={{ fontSize: 11, color: colors.textMuted, fontFamily: FONT, margin: 0, textAlign: 'center' }}>
          © 2025 Memoera (OPC) Private Limited · All rights reserved{'\n'}Bengaluru, Karnataka, India
        </p>
      </div>
    </BottomModal>
  );
}

// ── Privacy Policy Modal ──────────────────────────────────────────────────────

function PrivacyPolicyModal({ onClose, colors }) {
  const sections = [
    {
      title: "1. Introduction",
      body: `Memoera (OPC) Private Limited ("Memoera", "we", "our", or "us"), registered in Bengaluru, Karnataka, India, operates the Memoera mobile application and related services (collectively, the "Service"). This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our Service. By using Memoera, you consent to the practices described in this policy. If you disagree, please discontinue use of the Service.`,
    },
    {
      title: "2. Information We Collect",
      body: `Account Information: When you register, we collect your name, mobile number, and optionally your email address and profile photo. These are required to create and authenticate your account.\n\nContent You Upload: AR target images, linked videos, photos, and URLs you upload are stored on Amazon Web Services (AWS S3) in the ap-south-1 (Mumbai) region, ensuring your data stays within India's geographic boundary.\n\nUsage Data: We automatically collect device model, OS version, app version, session timestamps, feature usage patterns, and crash reports. This data is anonymised and used solely to improve app stability and performance.\n\nCamera & Microphone: The app requests camera access exclusively for AR scanning and profile photo capture. We do not record, store, or transmit live camera feeds. Microphone access is not requested.\n\nLocation: We do not collect or store GPS or precise location data at any time.`,
    },
    {
      title: "3. How We Use Your Information",
      body: `We use your information to: (a) provide and maintain the AR Service; (b) authenticate your identity securely; (c) store and retrieve your AR targets and linked media; (d) send account-related notifications (password resets, storage alerts) if you have opted in; (e) analyse aggregated, anonymised usage trends to improve features; (f) comply with legal obligations under applicable Indian law.\n\nWe do NOT use your data for behavioural advertising, sell your data to third parties, or share personally identifiable information with advertisers.`,
    },
    {
      title: "4. Data Storage & Infrastructure",
      body: `All user data — including AR target images, videos, and account information — is stored on Amazon Web Services (AWS). We use:\n\n• AWS S3 (Simple Storage Service): For target images and media files. Buckets are private by default with server-side encryption (SSE-S3, AES-256). Presigned URLs are used for temporary secure access and expire within 15 minutes.\n\n• AWS RDS / Neon PostgreSQL: For account metadata and target records. Data is encrypted at rest and in transit using TLS 1.3.\n\n• AWS CloudFront / Cloudflare R2: For efficient content delivery with edge caching.\n\nAll data transmission between your device and our servers is encrypted using TLS 1.2 or higher. Authentication tokens use industry-standard JWT with short expiry periods.`,
    },
    {
      title: "5. Data Retention",
      body: `Your account data and uploaded content are retained for as long as your account is active. If you delete a target, it is permanently removed from our storage systems within 30 days. If you delete your account, all associated data — including AR targets, media files, account information, and usage logs — is permanently deleted within 90 days of the request. Anonymised, aggregated analytics data (which cannot identify you) may be retained indefinitely for product research.`,
    },
    {
      title: "6. Data Sharing & Third Parties",
      body: `We do not sell, trade, or rent your personal information. We may share data only in these limited cases:\n\n• Service Providers: AWS (storage and compute), Razorpay (payment processing), and analytics tools — all bound by strict data processing agreements.\n\n• Legal Compliance: If required by a court order, government authority, or applicable law, we will disclose the minimum necessary information after verifying the legitimacy of the request.\n\n• Business Transfer: In the event of a merger or acquisition, your data may be transferred, subject to the same privacy protections.\n\nRazorpay processes payment data independently. Memoera never stores credit/debit card numbers or banking credentials.`,
    },
    {
      title: "7. Your Rights",
      body: `You have the right to: (a) Access the personal data we hold about you; (b) Correct inaccurate or incomplete information; (c) Request deletion of your account and all associated data; (d) Withdraw consent for optional processing (e.g., analytics) at any time via Settings → Support → Analytics; (e) Data portability — request an export of your uploaded content.\n\nTo exercise these rights, email memoerabangalore@gmail.com with the subject "Privacy Request". We will respond within 30 days.`,
    },
    {
      title: "8. Security",
      body: `We implement industry-standard technical and organisational security measures including: AES-256 encryption for data at rest; TLS 1.2+ for all data in transit; JWT-based authentication with secure token expiry; rate limiting and brute-force protection on all authentication endpoints; regular security audits and dependency updates; access controls ensuring only authorised personnel can access production systems.\n\nNo system is 100% secure. We encourage you to use a strong, unique password and enable device lock on your phone.`,
    },
    {
      title: "9. Children's Privacy",
      body: `Memoera is not directed at children under 13 years of age. We do not knowingly collect personal data from children under 13. If we become aware that a child under 13 has provided personal information, we will delete it promptly. If you are a parent or guardian and believe your child has provided us with personal data, please contact memoerabangalore@gmail.com.`,
    },
    {
      title: "10. Changes to This Policy",
      body: `We may update this Privacy Policy from time to time. Material changes will be communicated via in-app notification at least 7 days before they take effect. Continued use of the Service after the effective date constitutes acceptance of the updated policy. The "Last Updated" date at the bottom reflects the most recent revision.`,
    },
    {
      title: "11. Contact Us",
      body: `For any questions, concerns, or requests regarding this Privacy Policy, please contact:\n\nMemoera (OPC) Private Limited\nBengaluru, Karnataka, India\nEmail: memoerabangalore@gmail.com\n\nLast Updated: January 2025`,
    },
  ];

  return (
    <PolicyModal title="Privacy Policy" icon="🔒" onClose={onClose} colors={colors} sections={sections} />
  );
}

// ── Terms & Conditions Modal ──────────────────────────────────────────────────

function TermsModal({ onClose, colors }) {
  return (
    <PolicyModal title="Terms & Conditions" icon="📄" onClose={onClose} colors={colors} sections={TERMS_SECTIONS} />
  );
}

// ── Shared Policy Modal (scrollable, sectioned) ───────────────────────────────

function PolicyModal({ title, icon, onClose, colors, sections }) {
  const [openIdx, setOpenIdx] = useState(0);
  return (
    <BottomModal title={`${icon} ${title}`} onClose={onClose} colors={colors} tall>
      <p style={{ fontSize: 12, color: colors.textMuted, fontFamily: FONT, margin: '0 0 12px', lineHeight: 1.5 }}>
        Please read these terms carefully. Tap each section to expand.
      </p>
      {sections.map((sec, i) => (
        <div key={i} style={{
          marginBottom: 8, borderRadius: 10, overflow: 'hidden',
          border: `1px solid ${openIdx === i ? (colors.accent || TEAL) + '55' : colors.border}`,
        }}>
          <button onClick={() => setOpenIdx(openIdx === i ? -1 : i)}
            style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: openIdx === i ? `${colors.accent || TEAL}10` : 'transparent',
              border: 'none', padding: '12px 14px', cursor: 'pointer', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: openIdx === i ? (colors.accent || TEAL) : colors.text,
              fontFamily: FONT, textAlign: 'left', flex: 1, lineHeight: 1.4 }}>
              {sec.title}
            </span>
            <span style={{
              fontSize: 10, color: colors.textMuted, flexShrink: 0,
              transform: openIdx === i ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s', display: 'inline-block',
            }}>▼</span>
          </button>
          {openIdx === i && (
            <div style={{ padding: '0 14px 14px', borderTop: `1px solid ${colors.border}` }}>
              {sec.body.split('\n\n').map((para, j) => (
                <p key={j} style={{ fontSize: 12, color: colors.textMuted, fontFamily: FONT,
                  margin: j === 0 ? '10px 0 0' : '8px 0 0', lineHeight: 1.7 }}>
                  {para}
                </p>
              ))}
            </div>
          )}
        </div>
      ))}
    </BottomModal>
  );
}

// ── Shared Bottom Modal ───────────────────────────────────────────────────────

function BottomModal({ title, onClose, colors, children, tall }) {
  return (
    <>
      <div style={s.modalBackdrop} onClick={onClose} />
      <div style={{ ...s.modalSheet, background: colors.surface,
        maxHeight: tall ? '80vh' : '70vh' }}>
        <div style={s.modalHandle} />
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ flex: 1, fontSize: 17, fontWeight: 700, color: colors.text, fontFamily: FONT, margin: 0 }}>
            {title}
          </h3>
          <button onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: colors.textMuted, fontSize: 20, cursor: 'pointer', padding: '0 4px' }}>
            ✕
          </button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {children}
        </div>
      </div>
    </>
  );
}

// ── Subscribe / Payment Modal ─────────────────────────────────────────────────

const PLANS = [
  { id: 'monthly', label: 'Monthly', price: 99,  priceStr: '₹99',  period: '/month', storage: '1 GB', popular: false },
  { id: 'yearly',  label: 'Yearly',  price: 799, priceStr: '₹799', period: '/year',  storage: '2 GB', popular: true  },
];

function SubscribeModal({ onClose, colors }) {
  const [selected, setSelected]   = useState('yearly');
  const [loading, setLoading]     = useState(false);

  const handlePay = useCallback(() => {
    const plan = PLANS.find(p => p.id === selected);
    if (!plan) return;

    // Load Razorpay SDK on demand
    if (!window.Razorpay) {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => openRazorpay(plan);
      script.onerror = () => alert('Payment gateway failed to load. Check your internet connection.');
      document.head.appendChild(script);
    } else {
      openRazorpay(plan);
    }
  }, [selected]);

  function openRazorpay(plan) {
    setLoading(true);
    const options = {
      key: 'rzp_test_REPLACE_WITH_YOUR_KEY', // ← Replace with your Razorpay key
      amount: plan.price * 100, // paise
      currency: 'INR',
      name: 'Memoera',
      description: `Premium ${plan.label} Plan — ${plan.storage} Storage`,
      image: '/logo1.png',
      handler: (response) => {
        setLoading(false);
        localStorage.setItem('memoera_premium', JSON.stringify({ plan: plan.id, paymentId: response.razorpay_payment_id, ts: Date.now() }));
        alert(`Payment successful! 🎉\nPayment ID: ${response.razorpay_payment_id}\n\nYou now have ${plan.storage} storage.`);
        onClose();
      },
      prefill: { contact: '', email: '' },
      theme: { color: '#00C9A7' },
      modal: { ondismiss: () => setLoading(false) },
    };
    const rzp = new window.Razorpay(options);
    rzp.open();
  }

  return (
    <BottomModal title="Upgrade to Premium" onClose={onClose} colors={colors} tall>
      {/* Feature highlights */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
        {['Up to 2 GB cloud storage', 'Unlimited AR target uploads', 'Priority AR processing', 'Early access to new features'].map(f => (
          <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: colors.text, fontFamily: FONT }}>
            <span style={{ color: TEAL, fontSize: 16 }}>✓</span> {f}
          </div>
        ))}
      </div>

      {/* Plan cards */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        {PLANS.map(plan => (
          <button key={plan.id}
            onClick={() => setSelected(plan.id)}
            style={{
              flex: 1, border: `2px solid ${selected === plan.id ? TEAL : colors.border}`,
              borderRadius: 14, padding: '14px 10px', background: selected === plan.id ? `rgba(0,201,167,0.1)` : colors.surface,
              cursor: 'pointer', position: 'relative', textAlign: 'center',
            }}>
            {plan.popular && (
              <span style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', background: GOLD, color: '#fff', fontSize: 9, fontFamily: FONT, borderRadius: 8, padding: '2px 8px', whiteSpace: 'nowrap', fontWeight: 700 }}>
                BEST VALUE
              </span>
            )}
            <div style={{ fontSize: 13, fontWeight: 700, color: colors.text, fontFamily: FONT }}>{plan.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: TEAL, fontFamily: FONT, margin: '4px 0' }}>{plan.priceStr}</div>
            <div style={{ fontSize: 11, color: colors.textMuted, fontFamily: FONT }}>{plan.period}</div>
            <div style={{ fontSize: 11, color: GOLD, fontFamily: FONT, marginTop: 4 }}>📦 {plan.storage}</div>
          </button>
        ))}
      </div>

      <button onClick={handlePay} disabled={loading}
        style={{ width: '100%', border: 'none', borderRadius: 14, background: `linear-gradient(135deg, ${TEAL}, #00E5CC)`, color: '#fff', fontSize: 15, fontWeight: 700, fontFamily: FONT, padding: '14px 0', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
        {loading ? 'Opening payment...' : `Pay ${PLANS.find(p=>p.id===selected)?.priceStr} →`}
      </button>

      {/* Payment method logos */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
        <PayLogo label="GPay" bg="#1a73e8" text="#fff" icon={<GPayIcon />} />
        <PayLogo label="PhonePe" bg="#5f259f" text="#fff" icon={<PhonePeIcon />} />
        <PayLogo label="UPI" bg="#f8971d" text="#fff" icon="🏦" />
        <PayLogo label="Razorpay" bg="#072654" text="#fff" icon={<RazorpayIcon />} />
      </div>
      <p style={{ fontSize: 10, color: colors.textMuted, fontFamily: FONT, textAlign: 'center', marginTop: 8 }}>
        Secured by Razorpay · Cancel anytime
      </p>

      {/* ── Static Ad Banner ── */}
      <div style={{
        marginTop: 18,
        borderRadius: 14,
        overflow: 'hidden',
        border: `1px solid ${colors.border}`,
      }}>
        <div style={{
          padding: '2px 10px',
          background: 'rgba(128,128,128,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
            color: 'rgba(255,255,255,0.3)', fontFamily: FONT }}>ADVERTISEMENT</span>
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', fontFamily: FONT }}>Sponsored</span>
        </div>
        <div style={{
          background: `linear-gradient(135deg, #0e1e3a 0%, #0a2a1e 100%)`,
          padding: '16px 18px',
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12, flexShrink: 0,
            background: `linear-gradient(135deg, ${TEAL}, #00E5CC)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24,
          }}>🌀</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#ffffff', fontFamily: FONT, lineHeight: 1.3 }}>
              Memoera AR Frames
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', fontFamily: FONT, marginTop: 3, lineHeight: 1.4 }}>
              Custom AR frames for weddings, events &amp; birthdays. Powered by Memoera.
            </div>
          </div>
          <button style={{
            background: `linear-gradient(135deg, ${TEAL}, #00E5CC)`,
            border: 'none', borderRadius: 20,
            color: '#040D0B', fontSize: 11, fontWeight: 700, fontFamily: FONT,
            padding: '8px 14px', cursor: 'pointer', flexShrink: 0,
          }}
            onClick={() => window.open('https://www.memoera.in', '_blank')}>
            Explore
          </button>
        </div>
      </div>
    </BottomModal>
  );
}

// ── Payment logo helpers ──────────────────────────────────────────────────────

function PayLogo({ label, bg, text, icon }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{ width: 44, height: 28, borderRadius: 6, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
        {typeof icon === 'string' ? <span>{icon}</span> : icon}
      </div>
      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', fontFamily: FONT }}>{label}</span>
    </div>
  );
}

function GPayIcon() {
  return (
    <svg width="22" height="14" viewBox="0 0 88 36" fill="none">
      <text x="2" y="28" fontFamily="Product Sans, Arial, sans-serif" fontWeight="700" fontSize="32" fill="#fff">G</text>
      <text x="28" y="28" fontFamily="Product Sans, Arial, sans-serif" fontWeight="400" fontSize="32" fill="#fff">Pay</text>
    </svg>
  );
}

function PhonePeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 100 100" fill="none">
      <circle cx="50" cy="50" r="48" fill="#5f259f" stroke="none"/>
      <path d="M36 22 L64 22 C68 22 72 26 72 30 L72 54 C72 64 64 72 54 72 L50 72 L50 82 L40 82 L40 72 C32 68 28 60 28 52 L28 30 C28 26 32 22 36 22Z" fill="#fff"/>
      <circle cx="50" cy="44" r="10" fill="#5f259f"/>
    </svg>
  );
}

function RazorpayIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 60 60" fill="none">
      <path d="M10 50 L30 10 L50 50 Z" fill="#3395FF"/>
      <path d="M22 50 L36 20 L50 50 Z" fill="#fff" opacity="0.5"/>
    </svg>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  screen:    { position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', fontFamily: FONT },
  header:    { display: 'flex', alignItems: 'center', gap: 12, padding: '48px 20px 8px' },
  backBtn:   { background: 'transparent', border: 'none', fontSize: 14, fontWeight: 600, fontFamily: FONT, cursor: 'pointer', padding: '4px 0' },
  title:     { fontSize: 22, fontWeight: 700, margin: 0 },
  content:   { flex: 1, padding: '0 20px 40px', overflowY: 'auto' },
  sectionBody: {
    borderRadius: 16, border: '1px solid', padding: '0 14px',
    marginBottom: 4, overflow: 'hidden',
  },
  storageBody: { paddingBottom: 12, paddingTop: 8 },
  hint:      { fontSize: 12, fontFamily: FONT, margin: '4px 6px 0', textAlign: 'center' },
  submitBtn: {
    width: '100%', border: 'none', borderRadius: 12,
    color: '#fff', fontSize: 15, fontWeight: 700, fontFamily: FONT,
    padding: '14px 0', cursor: 'pointer', marginTop: 16,
  },
  modalBackdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', zIndex: 300 },
  modalSheet: {
    position: 'fixed', bottom: 0, left: 0, right: 0,
    borderRadius: '24px 24px 0 0', padding: '12px 20px 40px',
    zIndex: 301, display: 'flex', flexDirection: 'column',
  },
  modalHandle: { width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 16 },
};
