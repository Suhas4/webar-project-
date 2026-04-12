export default function HelloScreen({ onCreateAccount, onExisting, onGuestScan }) {
  return (
    <div style={styles.screen}>
      <div style={styles.watermark}>
        <img src="/logo.png" alt="" style={styles.watermarkImg} />
      </div>
      <div style={styles.helloWrap}>
        <h1 style={styles.hello}>HELLO</h1>
      </div>
      <div style={styles.scanArea} onClick={onGuestScan} role="button" tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && onGuestScan?.()}>
        <ScanIcon />
        <span style={styles.scanLabel}>SCAN AS GUEST</span>
      </div>
      <div style={styles.buttons}>
        <button onClick={onCreateAccount} style={styles.createBtn}>CREATE NEW ACCOUNT</button>
        <button onClick={onExisting} style={styles.existingBtn}>EXISTING ACCOUNT</button>
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
  screen: { position:"fixed",inset:0,
    background:"linear-gradient(160deg, #061A1F 0%, #0A2229 50%, #061820 100%)",
    display:"flex",flexDirection:"column",overflow:"hidden" },
  watermark: { position:"absolute",right:-40,top:"8%",width:"75vw",maxWidth:340,opacity:0.12,pointerEvents:"none" },
  watermarkImg: { width:"100%",filter:"brightness(0) invert(1)" },
  helloWrap: { padding:"56px 32px 0",flexShrink:0 },
  hello: { fontSize:54,fontWeight:700,fontFamily:FONT,color:"#ffffff",letterSpacing:2,margin:0 },
  scanArea: {
    flex:1, display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
    cursor:"pointer",userSelect:"none",
  },
  scanLabel: {
    fontSize:13,fontWeight:500,color:"rgba(255,255,255,0.65)",fontFamily:FONT,
    letterSpacing:"0.2em",marginTop:18,
  },
  buttons: { padding:"0 32px 52px",display:"flex",flexDirection:"column",gap:16 },
  createBtn: { background:"transparent",border:"2px solid rgba(255,255,255,0.8)",borderRadius:50,
    color:"#ffffff",fontSize:15,fontWeight:700,fontFamily:FONT,padding:"16px 24px",
    cursor:"pointer",letterSpacing:"0.08em" },
  existingBtn: { background:"#ffffff",border:"none",borderRadius:50,color:"#061A1F",
    fontSize:15,fontWeight:700,fontFamily:FONT,padding:"16px 24px",
    cursor:"pointer",letterSpacing:"0.08em" },
};
