import { useState, useCallback, useEffect, useRef } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { API_BASE, parseApiResponse } from '../config/api.js';

const FONT  = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const GOLD  = "#C9A84C";
const TEAL  = "#00C9A7";

const PLANS = [
  {
    id: 'basic',
    name: 'Basic',
    price: '₹99',
    period: '/month',
    features: ['500 MB Storage', '10 AR Targets', 'Standard Support', 'Public Sharing'],
    badge: null,
    highlight: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '₹299',
    period: '/month',
    features: ['5 GB Storage', '100 AR Targets', 'Priority Support', 'Public + Private', 'Custom Branding'],
    badge: 'MOST POPULAR',
    highlight: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: '₹799',
    period: '/month',
    features: ['Unlimited Storage', 'Unlimited Targets', '24/7 Support', 'Dedicated Server', 'Analytics Dashboard', 'API Access'],
    badge: 'BEST VALUE',
    highlight: false,
  },
];

const PAYMENT_METHODS = [
  { id: 'gpay',    label: 'Google Pay',    icon: '🟢', color: '#34A853' },
  { id: 'phonepe', label: 'PhonePe',       icon: '🟣', color: '#5F259F' },
  { id: 'paytm',   label: 'Paytm',         icon: '🔵', color: '#00BAF2' },
  { id: 'upi',     label: 'UPI',           icon: '🏦', color: '#FF6B35' },
  { id: 'razorpay',label: 'Razorpay',      icon: '⚡', color: '#3395FF' },
  { id: 'card',    label: 'Credit / Debit Card', icon: '💳', color: '#C9A84C' },
  { id: 'netbank', label: 'Net Banking',   icon: '🏛️', color: '#00C9A7' },
];

export default function PremiumScreen({ onBack, user }) {
  const { colors } = useTheme();
  const [selectedPlan,  setSelectedPlan]  = useState('pro');
  const [adWatching,    setAdWatching]    = useState(false);
  const [adMsg,         setAdMsg]         = useState('');
  const [bonusMB,       setBonusMB]       = useState(0);
  const [adCooldownSeconds, setAdCooldownSeconds] = useState(0);
  const [adProgress,    setAdProgress]    = useState(0);
  const [paying,        setPaying]        = useState(false);
  const [payMsg,        setPayMsg]        = useState('');
  const adTickRef = useRef(null);
  const adTimerRef = useRef(null);

  // Clean up ad timer/interval if user leaves the screen mid-ad
  useEffect(() => () => {
    clearInterval(adTickRef.current);
    clearTimeout(adTimerRef.current);
  }, []);

  // Load the real, server-authoritative bonus balance (shared with ReferFriendScreen).
  useEffect(() => {
    (async () => {
      try {
        const token = localStorage.getItem('memoera_token') || '';
        const res = await fetch(`${API_BASE}/api/referral/status`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await parseApiResponse(res);
        if (!res.ok) return;
        setBonusMB(Math.round((data.bonusBytes || 0) / (1024 * 1024)));
        setAdCooldownSeconds(data.adCooldownSeconds || 0);
      } catch { /* leave defaults on network failure */ }
    })();
  }, []);

  const plan = PLANS.find(p => p.id === selectedPlan);

  const handleWatchAd = useCallback(() => {
    if (adCooldownSeconds > 0) {
      setAdMsg(`⏳ Wait ${Math.ceil(adCooldownSeconds / 60)} min before next ad`);
      return;
    }
    setAdWatching(true); setAdMsg(''); setAdProgress(0);
    adTickRef.current  = setInterval(() => setAdProgress(p => Math.min(p + 20, 100)), 1000);
    adTimerRef.current = setTimeout(async () => {
      clearInterval(adTickRef.current);
      setAdWatching(false); setAdProgress(100);
      try {
        const token = localStorage.getItem('memoera_token') || '';
        const res = await fetch(`${API_BASE}/api/referral/watch-ad`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ seconds: 30 }),
        });
        const data = await parseApiResponse(res);
        if (!res.ok) { setAdMsg(data.error || 'Could not add bonus.'); return; }
        setBonusMB(Math.round(data.totalBonusBytes / (1024 * 1024)));
        setAdCooldownSeconds(30 * 60);
        setAdMsg(`+${Math.round((data.earnedBytes || 0) / (1024 * 1024))} MB added to your account!`);
      } catch {
        setAdMsg('Network error — could not add bonus.');
      }
    }, 5000);
  }, [adCooldownSeconds]);

  // Load the Razorpay Standard Checkout script once, on demand.
  const loadRazorpayScript = useCallback(() => new Promise((resolve) => {
    if (window.Razorpay) { resolve(true); return; }
    const existing = document.getElementById('razorpay-checkout-js');
    if (existing) {
      existing.addEventListener('load', () => resolve(true));
      existing.addEventListener('error', () => resolve(false));
      return;
    }
    const script = document.createElement('script');
    script.id = 'razorpay-checkout-js';
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  }), []);

  const handleRazorpay = useCallback(async () => {
    if (paying) return;
    setPayMsg(''); setPaying(true);
    try {
      const token = localStorage.getItem('memoera_token') || '';
      if (!token) { setPayMsg('Please sign in to continue.'); setPaying(false); return; }

      const scriptOk = await loadRazorpayScript();
      if (!scriptOk || !window.Razorpay) {
        setPayMsg('Could not load the payment gateway. Check your connection and retry.');
        setPaying(false); return;
      }

      // 1) Create an order on the backend (amount/secret stay server-side).
      const orderRes = await fetch(`${API_BASE}/api/payment/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ plan: selectedPlan }),
      });
      if (!orderRes.ok) {
        const e = await orderRes.json().catch(() => ({}));
        setPayMsg(e.error || 'Failed to start payment. Please try again.');
        setPaying(false); return;
      }
      const order = await orderRes.json();

      // 2) Open the Razorpay Standard Checkout modal.
      const rzp = new window.Razorpay({
        key: order.key_id || import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: order.amount,
        currency: order.currency,
        order_id: order.order_id,
        name: 'Memoera',
        description: `${plan?.name} Plan`,
        prefill: {
          name: [user?.firstName, user?.lastName].filter(Boolean).join(' '),
          email: user?.email || '',
          contact: user?.mobile || '',
        },
        theme: { color: TEAL },
        handler: async (response) => {
          // 3) Verify the signature server-side before treating the payment as done.
          setPayMsg('Verifying payment…');
          try {
            const verifyRes = await fetch(`${API_BASE}/api/payment/verify`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });
            setPayMsg(verifyRes.ok
              ? '✅ Payment successful! Your plan is now active.'
              : '⚠ Payment could not be verified. If you were charged, contact support.');
          } catch {
            setPayMsg('⚠ Payment verification failed. If you were charged, contact support.');
          } finally {
            setPaying(false);
          }
        },
        modal: {
          ondismiss: () => { setPaying(false); setPayMsg('Payment cancelled.'); },
        },
      });
      rzp.on('payment.failed', (resp) => {
        setPaying(false);
        setPayMsg('Payment failed: ' + (resp?.error?.description || 'please try again.'));
      });
      rzp.open();
    } catch (err) {
      setPaying(false);
      setPayMsg('Something went wrong: ' + (err?.message || 'please try again.'));
    }
  }, [paying, selectedPlan, plan, user, loadRazorpayScript]);

  return (
    <div style={{ ...s.screen, background: colors.bg }}>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes shimmer {
          0%{background-position:-200% center}
          100%{background-position:200% center}
        }
        @keyframes goldPulse {
          0%,100%{box-shadow:0 0 0 0 rgba(201,168,76,0.4)}
          50%{box-shadow:0 0 0 8px rgba(201,168,76,0)}
        }
        @keyframes bannerTicker {
          0%{transform:translateX(100%)} 100%{transform:translateX(-100%)}
        }
        @keyframes spinnerAnim { to{transform:rotate(360deg)} }
        @keyframes floatCard {
          0%,100%{transform:translateY(0) scale(1)}
          50%{transform:translateY(-4px) scale(1.01)}
        }
      ` }} />

      {/* Back button */}
      <button onClick={onBack} style={{ ...s.backBtn, color: colors.textMuted }}>← Back</button>

      <div style={s.scroll}>

        {/* ── Hero Header ── */}
        <div style={s.heroWrap}>
          <div style={s.premiumBadge}>◆ PREMIUM</div>
          <div style={s.bannerHeading}>Unlock the Full Experience</div>
          <p style={s.heroSub}>Access unlimited memories, AR targets &amp; more</p>
        </div>

        {/* ── Plan cards ── */}
        <div style={s.plansRow}>
          {PLANS.map(p => (
            <button key={p.id} onClick={() => setSelectedPlan(p.id)}
              style={{
                ...s.planCard,
                border: selectedPlan === p.id
                  ? `2px solid ${p.highlight ? TEAL : GOLD}`
                  : `2px solid ${colors.border}`,
                background: selectedPlan === p.id
                  ? (p.highlight ? 'rgba(0,201,167,0.08)' : 'rgba(201,168,76,0.08)')
                  : colors.surface,
                boxShadow: selectedPlan === p.id
                  ? `0 0 18px ${p.highlight ? 'rgba(0,201,167,0.3)' : 'rgba(201,168,76,0.3)'}`
                  : '0 4px 12px rgba(0,0,0,0.18)',
                animation: selectedPlan === p.id ? 'floatCard 3s ease-in-out infinite' : 'none',
              }}>
              {p.badge && (
                <div style={{ ...s.badge, background: p.highlight ? TEAL : GOLD,
                  color: p.highlight ? '#040D0B' : '#000' }}>{p.badge}</div>
              )}
              <div style={{ ...s.planName, color: colors.text }}>{p.name}</div>
              <div style={{ ...s.planPrice, color: p.highlight ? TEAL : GOLD }}>
                {p.price}<span style={s.planPeriod}>{p.period}</span>
              </div>
              <div style={s.featureList}>
                {p.features.map(f => (
                  <div key={f} style={{ ...s.featureItem, color: colors.textMuted }}>
                    <span style={{ color: p.highlight ? TEAL : GOLD, marginRight: 5 }}>✦</span>{f}
                  </div>
                ))}
              </div>
            </button>
          ))}
        </div>

        {/* ── Earn Storage by Watching Ads ── */}
        <div style={{ padding: '8px 14px 0' }}>
          <div style={{
            borderRadius: 18, overflow: 'hidden',
            border: `1px solid ${TEAL}55`,
            background: 'linear-gradient(135deg, #071C22 0%, #0a2229 100%)',
            boxShadow: '0 4px 20px rgba(0,201,167,0.15)',
          }}>
            {/* Header row */}
            <div style={{
              background: `linear-gradient(90deg, ${TEAL}22, ${TEAL}08)`,
              padding: '12px 16px',
              display: 'flex', alignItems: 'center', gap: 12,
              borderBottom: `1px solid ${TEAL}22`,
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                background: `linear-gradient(135deg, ${TEAL}, #00E5CC)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, boxShadow: `0 3px 12px rgba(0,201,167,0.4)`,
              }}>📺</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', fontFamily: FONT }}>
                  Earn Free Storage
                </div>
                <div style={{ fontSize: 11, color: `${TEAL}cc`, fontFamily: FONT, marginTop: 2 }}>
                  Watch a short ad · Get +50 MB per view
                </div>
              </div>
              <div style={{
                background: `${TEAL}22`, border: `1px solid ${TEAL}55`,
                borderRadius: 20, padding: '5px 12px', textAlign: 'center',
              }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: TEAL, fontFamily: FONT, lineHeight: 1 }}>{bonusMB}</div>
                <div style={{ fontSize: 9, color: `${TEAL}99`, fontFamily: FONT }}>MB earned</div>
              </div>
            </div>

            {/* Progress + action */}
            <div style={{ padding: '14px 16px' }}>
              {adWatching && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 11, color: TEAL, fontFamily: FONT }}>Watching ad…</span>
                    <span style={{ fontSize: 11, color: TEAL, fontFamily: FONT }}>{adProgress}%</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 3,
                      background: `linear-gradient(90deg, ${TEAL}, #00E5CC)`,
                      width: adProgress + '%', transition: 'width 0.9s ease',
                    }} />
                  </div>
                </div>
              )}
              <button onClick={handleWatchAd} disabled={adWatching} style={{
                width: '100%', background: adWatching
                  ? 'rgba(0,201,167,0.15)'
                  : `linear-gradient(135deg, ${TEAL}, #00E5CC)`,
                border: adWatching ? `1px solid ${TEAL}44` : 'none',
                borderRadius: 50, color: adWatching ? TEAL : '#040D0B',
                fontSize: 14, fontWeight: 700, fontFamily: FONT,
                padding: '12px 20px', cursor: adWatching ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: adWatching ? 'none' : '0 4px 16px rgba(0,201,167,0.35)',
                transition: 'all 0.2s',
              }}>
                {adWatching ? <><AdSpinner /> Watching Ad…</> : '▶ Watch Ad & Earn +50 MB'}
              </button>
              {adMsg && (
                <p style={{ fontSize: 12, fontFamily: FONT, textAlign: 'center', marginTop: 10,
                  color: adMsg.startsWith('+') ? TEAL : 'rgba(255,255,255,0.45)' }}>
                  {adMsg}
                </p>
              )}
              <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: FONT,
                textAlign: 'center', margin: '8px 0 0' }}>
                1 ad per 30 minutes · Storage bonus applied instantly
              </p>
            </div>

            {/* Refer row */}
            <div style={{
              padding: '12px 16px', borderTop: `1px solid rgba(255,255,255,0.06)`,
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                background: `linear-gradient(135deg, ${GOLD}, #e8c85a)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
              }}>🎁</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', fontFamily: FONT }}>
                  Refer &amp; Earn 100 MB Free
                </div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: FONT, marginTop: 2 }}>
                  Share Memoera with friends for instant bonus storage
                </div>
              </div>
              <div style={{
                background: `${GOLD}22`, border: `1px solid ${GOLD}55`,
                borderRadius: 20, padding: '5px 11px',
                fontSize: 10, fontWeight: 700, color: GOLD, fontFamily: FONT,
              }}>FREE</div>
            </div>
          </div>
        </div>

        {/* ── Razorpay CTA ── */}
        <div style={s.ctaWrap}>
          <button onClick={handleRazorpay} disabled={paying}
            style={{ ...s.ctaBtn, ...(paying ? { opacity: 0.6, cursor: 'not-allowed' } : {}) }}>
            {paying ? 'Processing…' : `⚡ Pay with Razorpay — ${plan?.price}/mo`}
          </button>
          {payMsg && (
            <p style={{ fontSize:12, color: payMsg.startsWith('✅') ? TEAL : (colors?.textMuted || 'rgba(255,255,255,0.7)'), fontFamily:FONT, textAlign:'center', marginTop:8 }}>
              {payMsg}
            </p>
          )}
          <p style={{ fontSize:10, color: colors?.textMuted || 'rgba(255,255,255,0.4)', fontFamily:FONT, textAlign:'center', marginTop:8, letterSpacing:'0.03em' }}>
            Secure payment via Razorpay · UPI · Cards · Net Banking
          </p>
          <p style={{ ...s.ctaHint, color: colors.textMuted }}>Cancel anytime · Secure payment</p>
        </div>

        {/* ── Spacer for banner ── */}
        <div style={{ height: 60 }} />
      </div>

      {/* ── Ticker Banner Ad ── */}
      <div style={s.bannerAdBar}>
        <div style={s.bannerAdTrack}>
          <span style={s.bannerAdText}>
            🎉 SPECIAL OFFER: Get 3 months Pro free with code MEMOERA3 &nbsp;&nbsp;&nbsp;
            📢 Advertisement: Upgrade to Enterprise for unlimited memories! &nbsp;&nbsp;&nbsp;
            🚀 New Feature: AR Brochure support coming soon! &nbsp;&nbsp;&nbsp;
            💎 Premium users get early access to all new features &nbsp;&nbsp;&nbsp;
          </span>
        </div>
      </div>

    </div>
  );
}

function AdSpinner() {
  return <span style={{ display:'inline-block',width:14,height:14,border:'2px solid rgba(0,201,167,0.3)',
    borderTopColor:TEAL,borderRadius:'50%',animation:'spinnerAnim 0.7s linear infinite',verticalAlign:'middle' }} />;
}

const s = {
  screen: { position:'fixed',inset:0,display:'flex',flexDirection:'column',fontFamily:FONT,overflow:'hidden' },
  backBtn: { position:'absolute',top:48,left:16,background:'transparent',border:'none',
    fontSize:14,fontWeight:600,fontFamily:FONT,cursor:'pointer',padding:'6px 4px',zIndex:10 },
  scroll: { flex:1,overflowY:'auto',paddingBottom:80 },

  /* Hero header (no image) */
  heroWrap: { padding:'72px 20px 20px',display:'flex',flexDirection:'column',alignItems:'center',
    gap:8,background:`linear-gradient(160deg, #071C22 0%, #0a2229 60%, #061820 100%)`,
    borderBottom:`1px solid ${TEAL}33` },
  premiumBadge: { display:'inline-block',background:GOLD,color:'#000',fontSize:10,
    fontWeight:700,letterSpacing:'0.12em',padding:'3px 10px',borderRadius:20 },
  bannerHeading: { fontSize:26,fontWeight:700,color:'#fff',letterSpacing:'-0.3px',textAlign:'center' },
  heroSub: { fontSize:13,color:'rgba(255,255,255,0.55)',fontFamily:FONT,margin:0,textAlign:'center' },

  /* Plans */
  plansRow: { display:'flex',gap:10,padding:'16px 14px 4px',overflowX:'auto',
    scrollbarWidth:'none',WebkitOverflowScrolling:'touch' },
  planCard: { flexShrink:0,width:150,borderRadius:16,padding:'14px 12px',
    display:'flex',flexDirection:'column',gap:8,cursor:'pointer',textAlign:'left',
    fontFamily:FONT,backdropFilter:'blur(10px)',WebkitBackdropFilter:'blur(10px)',
    transition:'border 0.2s,box-shadow 0.2s' },
  badge: { fontSize:9,fontWeight:700,letterSpacing:'0.1em',padding:'3px 8px',
    borderRadius:20,alignSelf:'flex-start' },
  planName: { fontSize:15,fontWeight:700,margin:0 },
  planPrice: { fontSize:22,fontWeight:700,margin:0,lineHeight:1 },
  planPeriod: { fontSize:11,fontWeight:400,opacity:0.8 },
  featureList: { display:'flex',flexDirection:'column',gap:5,marginTop:4 },
  featureItem: { fontSize:11,lineHeight:1.4 },

  /* CTA */
  ctaWrap: { padding:'12px 16px 0',display:'flex',flexDirection:'column',alignItems:'center',gap:8 },
  ctaBtn: { width:'100%',maxWidth:360,background:`linear-gradient(135deg, ${TEAL}, #00E5CC)`,
    border:'none',borderRadius:50,color:'#040D0B',fontSize:15,fontWeight:700,fontFamily:FONT,
    padding:'16px 24px',cursor:'pointer',letterSpacing:'0.04em',
    boxShadow:'0 4px 24px rgba(0,201,167,0.4)',animation:'goldPulse 2s ease-in-out infinite' },
  ctaHint: { fontSize:11,fontFamily:FONT,margin:0 },

  /* Banner Ad ticker */
  bannerAdBar: { height:38,background:'linear-gradient(90deg, #0a2229, #071C22)',
    borderTop:`1px solid ${TEAL}44`,overflow:'hidden',flexShrink:0,
    display:'flex',alignItems:'center' },
  bannerAdTrack: { display:'flex',alignItems:'center',width:'100%',overflow:'hidden' },
  bannerAdText: { display:'inline-block',whiteSpace:'nowrap',fontSize:12,color:TEAL,
    fontFamily:FONT,fontWeight:500,animation:'bannerTicker 28s linear infinite' },

};
