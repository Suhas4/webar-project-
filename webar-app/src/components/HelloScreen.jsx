import { useLanguage } from '../context/LanguageContext.jsx';
import { LANGUAGES, T } from '../config/translations.js';
import { useTheme } from '../context/ThemeContext.jsx';

export default function HelloScreen({ onCreateAccount, onExisting, onGuestScan }) {
  const { lang, setLang } = useLanguage();
  const { colors } = useTheme();
  const s = T[lang] || T.en;

  return (
    <div style={{ ...styles.screen, background: colors.bg }}>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes heartbeat {
          0%,100% { transform: scale(1); }
          14%      { transform: scale(1.12); }
          28%      { transform: scale(1); }
          42%      { transform: scale(1.08); }
          56%      { transform: scale(1); }
        }
      ` }} />

      <div style={styles.watermark}>
        <img src="/logo.png" alt="" style={styles.watermarkImg} />
      </div>

      {/* Language selector — top right */}
      <div style={styles.langRow}>
        <select value={lang} onChange={(e) => setLang(e.target.value)}
          style={{ ...styles.langSelect, color: colors.textMuted, borderColor: colors.border, background: 'transparent' }}>
          {Object.entries(LANGUAGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <div style={styles.helloWrap}>
        <h1 style={{ ...styles.hello, color: colors.text }}>{s.hello}</h1>
      </div>

      {/* Heartbeat scan area */}
      <div style={styles.scanArea} onClick={onGuestScan} role="button" tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && onGuestScan?.()}>
        <div style={styles.heartbeatWrap}>
          <ScanIcon />
        </div>
        <span style={{ ...styles.scanLabel, color: colors.textMuted }}>{s.scanAsGuest}</span>
      </div>

      <div style={styles.buttons}>
        <button onClick={onCreateAccount} style={{ ...styles.createBtn, borderColor: colors.text, color: colors.text }}>{s.createAccount}</button>
        <button onClick={onExisting} style={{ ...styles.existingBtn, background: colors.text, color: colors.bgSolid }}>{s.existingAccount}</button>
      </div>
    </div>
  );
}

function ScanIcon() {
  return (
    <svg width="130" height="130" viewBox="0 0 130 130" fill="none">
      <path d="M8 42 L8 8 L42 8" stroke="white" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M88 8 L122 8 L122 42" stroke="white" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M122 88 L122 122 L88 122" stroke="white" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M42 122 L8 122 L8 88" stroke="white" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="24" y1="65" x2="106" y2="65" stroke="white" strokeWidth="3.5" strokeLinecap="round" opacity="0.55" />
    </svg>
  );
}

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const styles = {
  screen: { position:"fixed",inset:0,display:"flex",flexDirection:"column",overflow:"hidden" },
  watermark: { position:"absolute",right:-40,top:"8%",width:"75vw",maxWidth:340,opacity:0.12,pointerEvents:"none" },
  watermarkImg: { width:"100%",filter:"brightness(0) invert(1)" },
  langRow: { padding:"52px 24px 0",display:"flex",justifyContent:"flex-end",flexShrink:0,zIndex:1 },
  langSelect: { border:"1px solid",borderRadius:20,fontSize:13,fontFamily:FONT,padding:"6px 14px",cursor:"pointer",outline:"none" },
  helloWrap: { padding:"12px 32px 0",flexShrink:0 },
  hello: { fontSize:54,fontWeight:700,fontFamily:FONT,letterSpacing:2,margin:0 },
  scanArea: { flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",cursor:"pointer",userSelect:"none" },
  heartbeatWrap: { animation:"heartbeat 1.8s ease-in-out infinite" },
  scanLabel: { fontSize:13,fontWeight:500,fontFamily:FONT,letterSpacing:"0.2em",marginTop:18 },
  buttons: { padding:"0 32px 52px",display:"flex",flexDirection:"column",gap:16 },
  createBtn: { background:"transparent",border:"2px solid",borderRadius:50,fontSize:15,fontWeight:700,fontFamily:FONT,padding:"16px 24px",cursor:"pointer",letterSpacing:"0.08em" },
  existingBtn: { border:"none",borderRadius:50,fontSize:15,fontWeight:700,fontFamily:FONT,padding:"16px 24px",cursor:"pointer",letterSpacing:"0.08em" },
};
