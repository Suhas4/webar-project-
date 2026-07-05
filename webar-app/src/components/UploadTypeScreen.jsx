import { useState } from "react";
import { useTheme } from "../context/ThemeContext.jsx";
import { useLanguage } from "../context/LanguageContext.jsx";
import { T } from "../config/translations.js";

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const GOLD = "#C9A84C";

export default function UploadTypeScreen({ onPhotoVideo, onPhotoUrl, onPhoto3D, onPhotoAnimation, onPhotoDocument, onBack, visibility }) {
  const [showGuide, setShowGuide] = useState(false);
  const { colors } = useTheme();
  const { lang } = useLanguage();
  const tr = { ...T.en, ...(T[lang] || {}) };
  return (
    <div style={{ ...s.screen, background: colors.bg }}>
      {showGuide && (
        <div style={s.modalOverlay} onClick={() => setShowGuide(false)}>
          <div style={{ ...s.modal, background: colors.surface }} onClick={e => e.stopPropagation()}>
            <h3 style={{ ...s.modalTitle, color: colors.text }}>{tr.guideUploadTypeTitle}</h3>
            <p style={{ ...s.modalText, color: colors.textMuted }}><strong style={{color:GOLD}}>{tr.guidePhotoVideoLabel}</strong> — {tr.guidePhotoVideoDesc}</p>
            <p style={{ ...s.modalText, color: colors.textMuted }}><strong style={{color:GOLD}}>{tr.guidePhotoUrlLabel}</strong> — {tr.guidePhotoUrlDesc}</p>
            <p style={{ ...s.modalText, color: colors.textMuted }}><strong style={{color:GOLD}}>{tr.guidePhoto3DLabel}</strong> — {tr.guidePhoto3DDesc}</p>
            <p style={{ ...s.modalText, color: colors.textMuted }}><strong style={{color:GOLD}}>{tr.guidePhotoDocLabel}</strong> — {tr.guidePhotoDocDesc}</p>
            <button style={s.modalClose} onClick={() => setShowGuide(false)}>{tr.close}</button>
          </div>
        </div>
      )}
      <div style={s.watermark}>
        <img src="/logo.png" alt="" style={s.watermarkImg} />
      </div>
      <div style={s.navBar}>
        {onBack && <button onClick={onBack} style={{ ...s.backBtn, color: colors.textMuted }}>← {tr.back}</button>}
      </div>
      <div style={s.titleArea}>
        <h1 style={{ ...s.title, color: colors.text }}>{tr.selectUploadTypeTitle}</h1>
        {visibility && (
          <div style={{ ...s.visibilityBadge, background: visibility === 'public' ? 'rgba(0,201,167,0.15)' : 'rgba(201,168,76,0.15)', border: `1px solid ${visibility === 'public' ? '#00C9A7' : GOLD}` }}>
            <span style={{ color: visibility === 'public' ? '#00C9A7' : GOLD, fontSize: 12, fontWeight: 700, fontFamily: FONT, letterSpacing: '0.1em' }}>
              {visibility.toUpperCase()}
            </span>
          </div>
        )}
      </div>
      <div style={s.btnArea}>
        <button onClick={onPhotoVideo} style={{ ...s.goalBtn, border: `1.5px solid ${colors.border}`, background: colors.surface }}>
          <span style={s.btnIcon}>🎬</span>
          <span style={{ ...s.btnLabel, color: colors.text }}>{tr.uploadPhotoLabel}<br />{tr.withVideoLabel}</span>
        </button>
        <button onClick={onPhotoUrl} style={{ ...s.goalBtn, border: `1.5px solid ${colors.border}`, background: colors.surface }}>
          <span style={s.btnIcon}>🔗</span>
          <span style={{ ...s.btnLabel, color: colors.text }}>{tr.uploadPhotoLabel}<br />{tr.withUrlLabel}</span>
        </button>
        <button onClick={onPhoto3D} style={{ ...s.goalBtn, border: `1.5px solid ${colors.border}`, background: colors.surface }}>
          <span style={s.btnIcon}>🧊</span>
          <span style={{ ...s.btnLabel, color: colors.text }}>{tr.uploadPhotoLabel}<br />{tr.with3DLabel}</span>
        </button>
        <button onClick={onPhotoAnimation} style={{ ...s.goalBtn, border: `1.5px solid ${colors.border}`, background: colors.surface }}>
          <span style={s.btnIcon}>🎞️</span>
          <span style={{ ...s.btnLabel, color: colors.text }}>{tr.uploadPhotoLabel}<br />{tr.withAnimationLabel}</span>
        </button>
        <button onClick={onPhotoDocument} style={{ ...s.goalBtn, border: `1.5px solid ${colors.border}`, background: colors.surface }}>
          <span style={s.btnIcon}>📄</span>
          <span style={{ ...s.btnLabel, color: colors.text }}>{tr.uploadPhotoLabel}<br />{tr.withDocumentLabel}</span>
        </button>
      </div>
      <div style={s.guideArea}>
        <button onClick={() => setShowGuide(true)} style={s.guideBtn}>
          <img src="/help-guide-logo.png" alt="Guide" style={s.guideImg} />
          <span style={{ ...s.guideLabel, color: colors.textMuted }}>{tr.guide}</span>
        </button>
      </div>
    </div>
  );
}

const s = {
  screen: { position:"fixed",inset:0,background:"linear-gradient(160deg,#061A1F 0%,#0A2229 50%,#061820 100%)",display:"flex",flexDirection:"column",fontFamily:FONT,overflow:"hidden" },
  watermark: { position:"absolute",right:-60,top:"5%",width:"80vw",maxWidth:360,opacity:0.07,pointerEvents:"none" },
  watermarkImg: { width:"100%",filter:"brightness(0) invert(1)" },
  navBar: { padding:"52px 20px 0",minHeight:88,display:"flex",alignItems:"flex-end" },
  titleArea: { padding:"0 20px 0" },
  backBtn: { background:"transparent",border:"none",fontSize:14,fontWeight:600,fontFamily:"Outfit,sans-serif",cursor:"pointer",padding:"8px 0" },
  title: { fontSize:24,fontWeight:300,fontFamily:FONT,margin:0,letterSpacing:"0.01em" },
  visibilityBadge: { display:'inline-flex',alignItems:'center',padding:'3px 12px',borderRadius:20,marginTop:8 },
  btnArea: { flex:1,display:"flex",flexDirection:"column",justifyContent:"center",gap:14,padding:"0 20px" },
  goalBtn: { display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(255,255,255,0.04)",border:"1.5px solid rgba(255,255,255,0.35)",borderRadius:14,padding:"16px 20px",cursor:"pointer",textAlign:"center",transition:"background 0.2s" },
  btnLabel: { fontSize:15,fontWeight:700,color:"#ffffff",fontFamily:FONT,letterSpacing:"0.06em",lineHeight:1.45 },
  btnIcon: { fontSize:22,marginRight:12,lineHeight:1 },
  guideArea: { display:"flex",flexDirection:"column",alignItems:"center",alignSelf:"flex-end",padding:"0 28px 32px" },
  guideBtn: { background:"transparent",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center" },
  guideImg: { width:40,height:40,objectFit:"contain",borderRadius:10 },
  guideLabel: { fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:FONT,letterSpacing:"0.15em",marginTop:4 },
  modalOverlay: { position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",backdropFilter:"blur(4px)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:24 },
  modal: { background:"#0A2229",border:"1px solid rgba(201,168,76,0.3)",borderRadius:20,padding:"28px 24px",maxWidth:360,width:"100%" },
  modalTitle: { fontSize:18,fontWeight:700,color:"#fff",fontFamily:FONT,margin:"0 0 16px" },
  modalText: { fontSize:14,color:"rgba(255,255,255,0.75)",fontFamily:FONT,lineHeight:1.7,margin:"0 0 12px" },
  modalClose: { marginTop:8,width:"100%",background:GOLD,border:"none",borderRadius:50,color:"#000",fontSize:14,fontWeight:700,fontFamily:FONT,padding:"12px",cursor:"pointer" },
};
