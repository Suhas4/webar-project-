import { useState } from "react";
import { useTheme } from "../context/ThemeContext.jsx";

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const GOLD = "#C9A84C";
const TEAL = "#00C9A7";

export default function GoalSelectScreen({ onPrivate, onPublic, onBack }) {
  const [showGuide, setShowGuide] = useState(false);
  const { colors } = useTheme();
  return (
    <div style={{ ...s.screen, background: colors.bg }}>
      <style>{`
        @keyframes gs-fadeUp   { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
        @keyframes gs-orbPulse { 0%,100%{transform:scale(1);opacity:0.55} 50%{transform:scale(1.12);opacity:0.85} }
        @keyframes gs-shine    { 0%{transform:translateX(-120%) skewX(-15deg)} 100%{transform:translateX(220%) skewX(-15deg)} }
        .gs-card { transition: transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease; }
        .gs-card:hover  { transform: translateY(-3px) scale(1.015); }
        .gs-card:active { transform: translateY(0) scale(0.98); }
        .gs-card:hover .gs-arrow { transform: translateX(4px); opacity: 1; }
        .gs-card:hover .gs-badge { transform: scale(1.06); }
        .gs-badge { transition: transform 0.22s ease; }
        .gs-arrow { transition: transform 0.22s ease, opacity 0.22s ease; }
        .gs-guide-btn { transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .gs-guide-btn:hover { transform: translateY(-2px); }
      `}</style>

      {showGuide && (
        <div style={s.modalOverlay} onClick={() => setShowGuide(false)}>
          <div style={{ ...s.modal, background: colors.bgSolid }} onClick={e => e.stopPropagation()}>
            <h3 style={{ ...s.modalTitle, color: colors.text }}>Guide — Select Your Goal</h3>
            <p style={{ ...s.modalText, color: colors.textMuted }}><strong style={{color:GOLD}}>PRIVATE</strong> — Your AR targets are only visible to you when you scan.</p>
            <p style={{ ...s.modalText, color: colors.textMuted }}><strong style={{color:TEAL}}>PUBLIC</strong> — Your AR targets are visible to all users and guests when they scan.</p>
            <button style={s.modalClose} onClick={() => setShowGuide(false)}>Close</button>
          </div>
        </div>
      )}

      {/* Ambient glow orbs for depth */}
      <div style={{ ...s.orb, top:"-8%", right:"-12%", background:`radial-gradient(circle, ${GOLD}33 0%, transparent 70%)`, animation:"gs-orbPulse 5s ease-in-out infinite" }} />
      <div style={{ ...s.orb, bottom:"-10%", left:"-14%", width:260, height:260, background:`radial-gradient(circle, ${TEAL}2e 0%, transparent 70%)`, animation:"gs-orbPulse 6s ease-in-out 1s infinite" }} />

      <div style={s.watermark}>
        <img src="/logo.png" alt="" style={s.watermarkImg} />
      </div>
      {onBack && <button onClick={onBack} style={{ ...s.backBtn, color: colors.textMuted }}>← Back</button>}

      <div style={s.top}>
        <span style={s.eyebrow}>STEP 1 OF 2</span>
        <h1 style={{ ...s.title, color: colors.text }}>Select Your Goal</h1>
        <p style={{ ...s.subtitle, color: colors.textMuted }}>Choose who gets to see your AR memories</p>
      </div>

      <div style={s.btnArea}>
        <button onClick={onPrivate} className="gs-card" style={{
          ...s.goalBtn,
          background: `linear-gradient(135deg, ${colors.surface}, ${colors.surface})`,
          border: `1.5px solid ${colors.border}`,
          animation: "gs-fadeUp 0.5s ease 0.05s both",
        }}>
          <div style={{ ...s.accentBar, background: `linear-gradient(180deg, ${GOLD}, ${GOLD}55)` }} />
          <span className="gs-badge" style={{ ...s.iconWrap, background: `linear-gradient(135deg, ${GOLD}, #a5793a)`, boxShadow: `0 6px 20px ${GOLD}4d` }}>
            <span style={s.badgeShine} />
            <img src="/private-lock-logo.png" alt="Private" style={s.iconImg} />
          </span>
          <span style={s.textCol}>
            <span style={{ ...s.btnLabel, color: colors.text }}>PRIVATE</span>
            <span style={{ ...s.btnSub, color: colors.textMuted }}>Only visible to you when scanning</span>
          </span>
          <span className="gs-arrow" style={{ ...s.arrow, color: GOLD }}>→</span>
        </button>

        <button onClick={onPublic} className="gs-card" style={{
          ...s.goalBtn,
          background: `linear-gradient(135deg, ${colors.surface}, ${colors.surface})`,
          border: `1.5px solid ${colors.border}`,
          animation: "gs-fadeUp 0.5s ease 0.15s both",
        }}>
          <div style={{ ...s.accentBar, background: `linear-gradient(180deg, ${TEAL}, ${TEAL}55)` }} />
          <span className="gs-badge" style={{ ...s.iconWrap, background: `linear-gradient(135deg, ${TEAL}, #00819c)`, boxShadow: `0 6px 20px ${TEAL}4d` }}>
            <span style={s.badgeShine} />
            <img src="/public-logo.png" alt="Public" style={s.iconImg} />
          </span>
          <span style={s.textCol}>
            <span style={{ ...s.btnLabel, color: colors.text }}>PUBLIC</span>
            <span style={{ ...s.btnSub, color: colors.textMuted }}>Visible to everyone who scans</span>
          </span>
          <span className="gs-arrow" style={{ ...s.arrow, color: TEAL }}>→</span>
        </button>
      </div>

      <div style={s.guideArea}>
        <button onClick={() => setShowGuide(true)} className="gs-guide-btn" style={s.guideBtn}>
          <img src="/help-guide-logo.png" alt="Guide" style={s.guideImg} />
          <span style={{ ...s.guideLabel, color: colors.textMuted }}>GUIDE</span>
        </button>
      </div>
    </div>
  );
}


const s = {
  screen: { position:"fixed",inset:0,display:"flex",flexDirection:"column",fontFamily:FONT,overflow:"hidden" },
  orb: { position:"absolute", width:300, height:300, borderRadius:"50%", pointerEvents:"none", zIndex:0 },
  watermark: { position:"absolute",right:-60,top:"5%",width:"80vw",maxWidth:360,opacity:0.06,pointerEvents:"none" },
  watermarkImg: { width:"100%",filter:"brightness(0) invert(1)" },
  backBtn: { position:"absolute",top:48,left:16,background:"transparent",border:"none",fontSize:14,fontWeight:600,fontFamily:"Outfit,sans-serif",cursor:"pointer",padding:"6px 4px",zIndex:2 },
  top: { padding:"72px 32px 0", position:"relative", zIndex:1 },
  eyebrow: { fontSize:11,fontWeight:700,letterSpacing:"0.2em",color:"#00C9A7" },
  title: { fontSize:28,fontWeight:300,fontFamily:FONT,margin:"6px 0 0",letterSpacing:"0.01em" },
  subtitle: { fontSize:13,fontFamily:FONT,margin:"6px 0 0" },
  btnArea: { flex:1,display:"flex",flexDirection:"column",justifyContent:"center",gap:20,padding:"0 24px",position:"relative",zIndex:1 },
  goalBtn: { position:"relative",overflow:"hidden",display:"flex",alignItems:"center",gap:20,borderRadius:20,padding:"20px 22px 20px 26px",cursor:"pointer",textAlign:"left",backdropFilter:"blur(6px)",WebkitBackdropFilter:"blur(6px)" },
  accentBar: { position:"absolute",left:0,top:0,bottom:0,width:5,borderRadius:"0 4px 4px 0" },
  iconWrap: { position:"relative",flexShrink:0,width:64,height:64,borderRadius:20,display:"flex",justifyContent:"center",alignItems:"center",overflow:"hidden" },
  badgeShine: { position:"absolute",top:0,left:0,width:"40%",height:"200%",background:"rgba(255,255,255,0.35)",animation:"gs-shine 3.2s ease-in-out infinite" },
  iconImg:  { width:36,height:36,objectFit:"contain",position:"relative",zIndex:1,filter:"drop-shadow(0 1px 2px rgba(0,0,0,0.35))" },
  textCol: { display:"flex",flexDirection:"column",gap:3,flex:1,minWidth:0 },
  btnLabel: { fontSize:18,fontWeight:700,fontFamily:FONT,letterSpacing:"0.08em" },
  btnSub: { fontSize:11.5,fontFamily:FONT,lineHeight:1.4 },
  arrow: { fontSize:18,fontWeight:700,flexShrink:0,opacity:0.5,transform:"translateX(0)" },
  guideArea: { display:"flex",flexDirection:"column",alignItems:"center",alignSelf:"flex-end",padding:"0 28px 32px",position:"relative",zIndex:1 },
  guideBtn: { background:"transparent",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center" },
  guideImg: { width:40,height:40,objectFit:"contain",borderRadius:10 },
  guideLabel: { fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:FONT,letterSpacing:"0.15em",marginTop:4 },
  modalOverlay: { position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",backdropFilter:"blur(4px)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:24 },
  modal: { border:"1px solid rgba(201,168,76,0.3)",borderRadius:20,padding:"28px 24px",maxWidth:360,width:"100%" },
  modalTitle: { fontSize:18,fontWeight:700,fontFamily:FONT,margin:"0 0 16px" },
  modalText: { fontSize:14,fontFamily:FONT,lineHeight:1.7,margin:"0 0 12px" },
  modalClose: { marginTop:8,width:"100%",background:GOLD,border:"none",borderRadius:50,color:"#000",fontSize:14,fontWeight:700,fontFamily:FONT,padding:"12px",cursor:"pointer" },
};
