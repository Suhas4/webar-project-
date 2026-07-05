import { useState, useEffect, useRef } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { API_BASE, parseApiResponse } from '../config/api.js';

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const TEAL = "#00C9A7";
const AD_MAX_SECONDS  = 30;
const AD_MIN_SECONDS  = 10;

function getToken() {
  return localStorage.getItem('memoera_token') || '';
}

export default function ReferFriendScreen({ onBack, user }) {
  const { colors } = useTheme();
  const [copied,       setCopied]       = useState(false);
  const [codeInput,    setCodeInput]    = useState('');
  const [codeMsg,      setCodeMsg]      = useState('');
  const [codeSuccess,  setCodeSuccess]  = useState(false);
  const [code,          setCode]          = useState('');
  const [bonusBytes,    setBonusBytes]    = useState(0);
  const [maxBonusBytes, setMaxBonusBytes] = useState(100 * 1024 * 1024);
  const [codeAlreadyUsed, setCodeAlreadyUsed] = useState(false);
  const [adCooldownSeconds, setAdCooldownSeconds] = useState(0);
  const [adWatching, setAdWatching] = useState(false);
  const [adSeconds, setAdSeconds] = useState(0);
  const [adMsg, setAdMsg] = useState('');

  const timerRef       = useRef(null);
  const autoCollected  = useRef(false);
  const bonusBytesRef  = useRef(bonusBytes);
  bonusBytesRef.current = bonusBytes;

  const totalBonusMB   = Math.round(bonusBytes / (1024 * 1024));
  const maxBonusMB      = Math.round(maxBonusBytes / (1024 * 1024));
  const remainingBonus = Math.max(0, maxBonusMB - totalBonusMB);
  const maxWatchSecs   = Math.min(AD_MAX_SECONDS, remainingBonus);
  const liveEarnMB     = Math.min(adSeconds, maxWatchSecs);
  const canCollect     = adSeconds >= AD_MIN_SECONDS;

  // Load real, server-authoritative referral status on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = getToken();
        const res = await fetch(`${API_BASE}/api/referral/status`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await parseApiResponse(res);
        if (cancelled || !res.ok) return;
        setCode(data.code || '');
        setBonusBytes(data.bonusBytes || 0);
        setMaxBonusBytes(data.maxBonusBytes || 100 * 1024 * 1024);
        setCodeAlreadyUsed(!!data.redeemed);
        setAdCooldownSeconds(data.adCooldownSeconds || 0);
      } catch { /* leave defaults on network failure */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // 1-second tick while watching
  useEffect(() => {
    if (!adWatching) return;
    timerRef.current = setInterval(() => setAdSeconds(s => s + 1), 1000);
    return () => { clearInterval(timerRef.current); timerRef.current = null; };
  }, [adWatching]);

  // Auto-collect when max seconds reached
  useEffect(() => {
    if (!adWatching || adSeconds < maxWatchSecs || maxWatchSecs <= 0) return;
    if (autoCollected.current) return;
    autoCollected.current = true;
    doCollect(adSeconds);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adSeconds, adWatching]);

  async function doCollect(seconds) {
    clearInterval(timerRef.current);
    timerRef.current = null;
    setAdWatching(false);
    setAdSeconds(0);
    try {
      const token = getToken();
      const res = await fetch(`${API_BASE}/api/referral/watch-ad`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ seconds }),
      });
      const data = await parseApiResponse(res);
      if (!res.ok) { setAdMsg(data.error || 'Could not add bonus.'); return; }
      setBonusBytes(data.totalBonusBytes);
      setAdCooldownSeconds(30 * 60);
      const earnMB = Math.round((data.earnedBytes || 0) / (1024 * 1024));
      setAdMsg(`+${earnMB} MB added! Total bonus: ${Math.round(data.totalBonusBytes / (1024 * 1024))} MB`);
    } catch {
      setAdMsg('Network error — could not add bonus.');
    }
  }

  function handleWatchAd() {
    if (adCooldownSeconds > 0) {
      setAdMsg(`Come back in ${Math.ceil(adCooldownSeconds / 60)} min for next ad.`);
      return;
    }
    if (remainingBonus <= 0) return;
    autoCollected.current = false;
    setAdWatching(true);
    setAdSeconds(0);
    setAdMsg('');
  }

  async function handleRedeemCode() {
    const val = codeInput.trim().toUpperCase();
    if (!val) { setCodeMsg('Please enter a code.'); return; }
    if (val.length < 5) { setCodeMsg('Code must be at least 5 characters.'); return; }
    if (val === code)   { setCodeMsg('You cannot use your own referral code.'); return; }
    if (codeAlreadyUsed) { setCodeMsg('You already redeemed a code.'); return; }
    try {
      const token = getToken();
      const res = await fetch(`${API_BASE}/api/referral/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: val }),
      });
      const data = await parseApiResponse(res);
      if (!res.ok) { setCodeMsg(data.error || 'Could not redeem code.'); return; }
      setBonusBytes(data.totalBonusBytes);
      setCodeAlreadyUsed(true);
      setCodeInput('');
      setCodeSuccess(true);
      setCodeMsg(`+${Math.round((data.earnedBytes || 0) / (1024 * 1024))} MB bonus added! Welcome to Memoera.`);
    } catch {
      setCodeMsg('Network error — could not redeem code.');
    }
  }

  const shareText = `Join Memoera — restore your memories in AR! Use my referral code ${code} when signing up.\nhttps://www.memoera.in`;

  function handleCopy() {
    navigator.clipboard?.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank');
  }

  return (
    <div style={{ ...s.screen, background: colors.bg }}>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes codeFloat {
          0%,100%{transform:translateY(0) scale(1)}
          50%{transform:translateY(-5px) scale(1.02)}
        }
        @keyframes tealGlow {
          0%,100%{box-shadow:0 0 10px rgba(0,201,167,0.3)}
          50%{box-shadow:0 0 24px rgba(0,201,167,0.65),0 0 50px rgba(0,201,167,0.15)}
        }
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes adPulse{0%,100%{opacity:1}50%{opacity:0.65}}
        @keyframes adBounce{0%,100%{transform:scale(1)}50%{transform:scale(1.12)}}
      ` }} />

      {/* Ad watching overlay */}
      {adWatching && (
        <div style={s.adOverlay}>
          <div style={{ ...s.adModal, background: colors.surface, border: `1px solid ${TEAL}44` }}>
            {/* Fake ad creative */}
            <div style={s.adCreative}>
              <div style={{ fontSize: 54, animation: 'adBounce 2s ease-in-out infinite' }}>📱</div>
              <p style={{ fontSize: 17, fontWeight: 700, fontFamily: FONT, color: TEAL, margin: '8px 0 4px', textAlign: 'center' }}>
                Memoera Premium
              </p>
              <p style={{ fontSize: 12, color: colors.textMuted, fontFamily: FONT, margin: 0, textAlign: 'center', lineHeight: 1.5 }}>
                Preserve memories in Augmented Reality.{'\n'}Unlimited uploads, 10 GB storage.
              </p>
            </div>

            {/* Progress bar */}
            <div style={s.progressTrack}>
              <div style={{
                ...s.progressFill,
                width: maxWatchSecs > 0 ? `${Math.min(100, (adSeconds / maxWatchSecs) * 100)}%` : '0%',
              }} />
            </div>

            {/* Timer + live earn */}
            <div style={s.adStatRow}>
              <span style={{ fontSize: 12, color: colors.textMuted, fontFamily: FONT }}>
                {adSeconds}s / {maxWatchSecs}s
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: TEAL, fontFamily: FONT }}>
                +{liveEarnMB} MB
              </span>
            </div>

            {/* CTA */}
            {canCollect ? (
              <button onClick={() => doCollect(adSeconds)} style={s.collectBtn}>
                Collect +{liveEarnMB} MB
              </button>
            ) : (
              <p style={{ fontSize: 12, fontFamily: FONT, color: colors.textMuted, textAlign: 'center',
                margin: '10px 0 0', animation: 'adPulse 1.4s ease-in-out infinite' }}>
                {AD_MIN_SECONDS - adSeconds}s more to unlock reward…
              </p>
            )}
          </div>
        </div>
      )}

      <button onClick={onBack} style={{ ...s.backBtn, color: colors.textMuted }}>← Back</button>

      <div style={s.content}>
        {/* Icon */}
        <div style={s.iconWrap}>
          <span style={s.bigIcon}>🎁</span>
        </div>

        <h1 style={{ ...s.title, color: colors.text }}>Refer a Friend</h1>
        <p style={{ ...s.sub, color: colors.textMuted }}>
          Share your code — when a friend signs up with it, you both earn <strong style={{ color: TEAL }}>+100 MB</strong> free storage!
        </p>

        {/* Referral code box */}
        <div style={{ ...s.codeBox, border: `2px solid ${TEAL}`, background: colors.surface }}>
          <span style={{ ...s.code, color: TEAL }}>{code}</span>
          <button onClick={handleCopy} style={{ ...s.copyBtn,
            background: copied ? TEAL : 'transparent',
            color: copied ? '#040D0B' : TEAL,
            border: `1.5px solid ${TEAL}` }}>
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>

        {/* How it works */}
        <div style={{ ...s.stepsCard, background: colors.surface, border: `1px solid ${colors.border}` }}>
          <div style={{ ...s.stepsTitle, color: colors.text }}>How it works</div>
          {[
            { n: '1', text: 'Share your referral code with a friend' },
            { n: '2', text: 'They enter your code when creating their account' },
            { n: '3', text: 'Both of you get +100 MB extra storage instantly' },
          ].map(({ n, text }) => (
            <div key={n} style={s.step}>
              <div style={s.stepNum}>{n}</div>
              <span style={{ ...s.stepText, color: colors.textMuted }}>{text}</span>
            </div>
          ))}
        </div>

        {/* Enter Referral / Employee Code */}
        <div style={{ ...s.stepsCard, background: colors.surface,
          border: `1px solid ${codeSuccess ? TEAL+'66' : colors.border}` }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
            <span style={{ fontSize:22 }}>🎟️</span>
            <div>
              <div style={{ ...s.stepsTitle, color: colors.text, marginBottom:2 }}>
                Have a Referral or Employee Code?
              </div>
              <div style={{ fontSize:11, color: colors.textMuted, fontFamily:FONT }}>
                Enter it below and get <strong style={{ color:TEAL }}>+50 MB</strong> free storage instantly
              </div>
            </div>
          </div>

          {codeAlreadyUsed ? (
            <div style={{ textAlign:'center', padding:'8px 0' }}>
              <div style={{ fontSize:28, marginBottom:4 }}>✅</div>
              <div style={{ fontSize:13, fontWeight:700, color:TEAL, fontFamily:FONT }}>Code already redeemed!</div>
              <div style={{ fontSize:11, color: colors.textMuted, fontFamily:FONT, marginTop:4 }}>
                Total bonus: <strong style={{ color:TEAL }}>{totalBonusMB} MB</strong> added to your account.
              </div>
            </div>
          ) : (
            <>
              <div style={{ display:'flex', gap:8, marginBottom:8 }}>
                <input
                  value={codeInput}
                  onChange={e => { setCodeInput(e.target.value.toUpperCase()); setCodeMsg(''); setCodeSuccess(false); }}
                  placeholder="e.g. ABC1234"
                  maxLength={12}
                  style={{ flex:1, background: colors.bg, border:`1.5px solid ${codeSuccess ? TEAL : colors.border}`,
                    borderRadius:10, padding:'10px 14px', fontSize:15, fontWeight:700,
                    fontFamily:FONT, color: colors.text, outline:'none',
                    letterSpacing:'0.12em', textTransform:'uppercase' }}
                />
                <button onClick={handleRedeemCode}
                  style={{ background:`linear-gradient(135deg,${TEAL},#00E5CC)`, border:'none',
                    borderRadius:10, color:'#040D0B', fontSize:13, fontWeight:700,
                    fontFamily:FONT, padding:'10px 16px', cursor:'pointer', flexShrink:0 }}>
                  Claim
                </button>
              </div>

              {/* Demo hint */}
              <div style={{ fontSize:10, color: colors.textMuted, fontFamily:FONT, marginBottom:8 }}>
                Example: an employee or friend shared code <strong style={{ color:TEAL, letterSpacing:'0.08em' }}>DEMO50</strong> — enter it to claim your bonus.
              </div>
            </>
          )}

          {codeMsg && (
            <p style={{ fontSize:12, fontFamily:FONT, textAlign:'center', marginTop:4,
              color: codeSuccess ? TEAL : '#FF6B6B' }}>{codeMsg}</p>
          )}
        </div>

        {/* Watch & Earn */}
        <div style={{ ...s.stepsCard, background: colors.surface, border: `1px solid ${TEAL}55` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 24 }}>📺</span>
            <div style={{ flex: 1 }}>
              <div style={{ ...s.stepsTitle, color: colors.text, marginBottom: 2 }}>Watch Ad &amp; Earn Storage</div>
              <div style={{ fontSize: 12, color: TEAL }}>
                Bonus earned: <strong>{totalBonusMB} MB</strong>
                {remainingBonus > 0 && (
                  <span style={{ color: colors.textMuted }}> · {remainingBonus} MB left</span>
                )}
              </div>
            </div>
          </div>

          {/* Earn rate guide */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {[
              { sec: 10, mb: 10 },
              { sec: 20, mb: 20 },
              { sec: 30, mb: 30 },
            ].map(({ sec, mb }) => (
              <div key={sec} style={{ flex: 1, background: `${TEAL}12`, borderRadius: 10,
                padding: '7px 4px', textAlign: 'center', border: `1px solid ${TEAL}22` }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: TEAL, fontFamily: FONT }}>{sec}s</div>
                <div style={{ fontSize: 11, color: colors.textMuted, fontFamily: FONT }}>+{mb} MB</div>
              </div>
            ))}
          </div>

          <button
            onClick={handleWatchAd}
            disabled={remainingBonus <= 0}
            style={{ ...s.adBtn, opacity: remainingBonus <= 0 ? 0.45 : 1 }}>
            {remainingBonus <= 0 ? '✓ Max Bonus Reached' : `Watch Ad · Earn up to ${maxWatchSecs} MB`}
          </button>

          {adMsg && (
            <p style={{ fontSize: 12, fontFamily: FONT, textAlign: 'center', marginTop: 8,
              color: adMsg.startsWith('+') ? TEAL : '#888' }}>{adMsg}</p>
          )}
        </div>

        {/* Share buttons */}
        <div style={s.shareRow}>
          <button onClick={handleWhatsApp} style={s.whatsappBtn}>
            <WhatsAppIcon /> Share on WhatsApp
          </button>
          <button onClick={() => {
            if (navigator.share) navigator.share({ title: 'Memoera', text: shareText }).catch(() => {});
            else handleCopy();
          }} style={{ ...s.shareBtn, border: `1.5px solid ${colors.border}`, color: colors.text,
            background: colors.surface }}>
            🔗 Share Link
          </button>
        </div>
      </div>
    </div>
  );
}

function WhatsAppIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff" style={{ marginRight: 8, flexShrink: 0 }}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
  </svg>;
}

const s = {
  screen:       { position:'fixed',inset:0,display:'flex',flexDirection:'column',fontFamily:FONT,overflowY:'auto' },
  backBtn:      { position:'sticky',top:0,left:0,background:'transparent',border:'none',
                  fontSize:14,fontWeight:600,fontFamily:FONT,cursor:'pointer',padding:'48px 0 0 16px',zIndex:2,alignSelf:'flex-start' },
  content:      { flex:1,display:'flex',flexDirection:'column',alignItems:'center',padding:'12px 24px 48px',gap:18 },
  iconWrap:     { width:90,height:90,borderRadius:'50%',background:'rgba(0,201,167,0.1)',
                  display:'flex',alignItems:'center',justifyContent:'center',
                  animation:'tealGlow 3s ease-in-out infinite',border:`2px solid ${TEAL}44` },
  bigIcon:      { fontSize:42 },
  title:        { fontSize:28,fontWeight:700,letterSpacing:'-0.3px',margin:0,textAlign:'center' },
  sub:          { fontSize:14,lineHeight:1.7,textAlign:'center',margin:0,maxWidth:320 },
  codeBox:      { display:'flex',alignItems:'center',justifyContent:'space-between',
                  borderRadius:16,padding:'14px 18px',width:'100%',maxWidth:340,
                  animation:'codeFloat 4s ease-in-out infinite',
                  backdropFilter:'blur(10px)',WebkitBackdropFilter:'blur(10px)' },
  code:         { fontSize:28,fontWeight:700,letterSpacing:'0.18em' },
  copyBtn:      { borderRadius:50,fontSize:13,fontWeight:700,fontFamily:FONT,
                  padding:'8px 18px',cursor:'pointer',transition:'all 0.2s' },
  stepsCard:    { borderRadius:16,padding:'16px 18px',width:'100%',maxWidth:340,
                  backdropFilter:'blur(10px)',WebkitBackdropFilter:'blur(10px)' },
  stepsTitle:   { fontSize:14,fontWeight:700,marginBottom:14 },
  step:         { display:'flex',alignItems:'flex-start',gap:12,marginBottom:12 },
  stepNum:      { width:24,height:24,borderRadius:'50%',background:TEAL,color:'#040D0B',
                  fontSize:12,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 },
  stepText:     { fontSize:13,lineHeight:1.5,paddingTop:2 },
  adBtn:        { width:'100%',background:`linear-gradient(135deg,${TEAL},#00E5CC)`,border:'none',
                  borderRadius:50,color:'#040D0B',fontSize:14,fontWeight:700,fontFamily:FONT,
                  padding:'12px 20px',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:6 },
  shareRow:     { display:'flex',flexDirection:'column',gap:10,width:'100%',maxWidth:340 },
  whatsappBtn:  { display:'flex',alignItems:'center',justifyContent:'center',
                  background:'#25D366',border:'none',borderRadius:50,color:'#fff',
                  fontSize:15,fontWeight:700,fontFamily:FONT,padding:'14px 24px',cursor:'pointer',
                  boxShadow:'0 4px 16px rgba(37,211,102,0.35)' },
  shareBtn:     { display:'flex',alignItems:'center',justifyContent:'center',
                  borderRadius:50,fontSize:15,fontWeight:600,fontFamily:FONT,
                  padding:'14px 24px',cursor:'pointer',backdropFilter:'blur(6px)' },
  // Ad overlay
  adOverlay:    { position:'fixed',inset:0,background:'rgba(0,0,0,0.88)',zIndex:50,
                  display:'flex',alignItems:'center',justifyContent:'center',padding:'24px' },
  adModal:      { borderRadius:22,padding:'24px 20px',width:'100%',maxWidth:300,
                  backdropFilter:'blur(16px)',WebkitBackdropFilter:'blur(16px)' },
  adCreative:   { display:'flex',flexDirection:'column',alignItems:'center',gap:6,
                  padding:'12px 0 20px',borderBottom:`1px solid rgba(0,201,167,0.15)`,marginBottom:16 },
  progressTrack:{ height:6,borderRadius:3,background:'rgba(255,255,255,0.1)',overflow:'hidden',marginBottom:8 },
  progressFill: { height:'100%',background:`linear-gradient(90deg,${TEAL},#00E5CC)`,
                  borderRadius:3,transition:'width 0.85s linear' },
  adStatRow:    { display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14,padding:'0 2px' },
  collectBtn:   { width:'100%',background:`linear-gradient(135deg,${TEAL},#00E5CC)`,border:'none',
                  borderRadius:50,color:'#040D0B',fontSize:14,fontWeight:700,fontFamily:FONT,
                  padding:'13px 20px',cursor:'pointer' },
};
