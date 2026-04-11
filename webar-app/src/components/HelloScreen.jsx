export default function HelloScreen({ onCreateAccount, onExisting }) {
  return (
    <div style={styles.screen}>
      <div style={styles.watermark}>
        <img src="/logo.png" alt="" style={styles.watermarkImg} />
      </div>
      <div style={styles.helloWrap}>
        <h1 style={styles.hello}>HELLO</h1>
      </div>
      <div style={styles.buttons}>
        <button onClick={onCreateAccount} style={styles.createBtn}>CREATE NEW ACCOUNT</button>
        <button onClick={onExisting} style={styles.existingBtn}>EXISTING ACCOUNT</button>
      </div>
    </div>
  );
}

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const BLUE = '#1565C0';
const styles = {
  screen: { position:'fixed',inset:0,
    background:'linear-gradient(160deg, #061A1F 0%, #0A2229 50%, #061820 100%)',
    display:'flex',flexDirection:'column',justifyContent:'space-between',overflow:'hidden' },
  watermark: { position:'absolute',right:-40,top:'8%',width:'75vw',maxWidth:340,opacity:0.12,pointerEvents:'none' },
  watermarkImg: { width:'100%',filter:'brightness(0) invert(1)' },
  helloWrap: { padding:'60px 32px 0',flex:1 },
  hello: { fontSize:54,fontWeight:700,fontFamily:FONT,color:'#ffffff',letterSpacing:2,margin:0 },
  buttons: { padding:'0 32px 60px',display:'flex',flexDirection:'column',gap:16 },
  createBtn: { background:'transparent',border:'2px solid rgba(255,255,255,0.8)',borderRadius:50,
    color:'#ffffff',fontSize:15,fontWeight:700,fontFamily:FONT,padding:'16px 24px',
    cursor:'pointer',letterSpacing:'0.08em' },
  existingBtn: { background:'#ffffff',border:'none',borderRadius:50,color:'#061A1F',
    fontSize:15,fontWeight:700,fontFamily:FONT,padding:'16px 24px',
    cursor:'pointer',letterSpacing:'0.08em' },
};
