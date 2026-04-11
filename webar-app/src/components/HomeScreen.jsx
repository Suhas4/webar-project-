export default function HomeScreen({ onScan, onUpload, onProfile, onGallery, onSignOut }) {
  return (
    <div style={styles.screen}>
      <div style={styles.header}>
        <div style={styles.logoRow}>
          <img src="/logo.png" alt="Memoera" style={styles.logo} />
          <div>
            <div style={styles.brand}>memoera</div>
            <div style={styles.tagline}>Restoring Memories</div>
          </div>
        </div>
      </div>
      <div style={styles.content}>
        <div style={styles.aboutCard}>
          <h2 style={styles.aboutTitle}>About Us</h2>
          <p style={styles.aboutText}>At Memoera, we are dedicated to safeguarding your most cherished memories through advanced, secure digital storage solutions designed for modern life. Our mission is to ensure that your precious moments are accessible in a single touch.</p>
          <p style={styles.aboutText}>Enhance your business with Smart Brochure. We are Avoiding 1st Copy or Duplicate of Product and act as a Mini Theft Protection.</p>
        </div>
      </div>
      <div style={styles.navBar}>
        <NavBtn icon="H" label="Home" onClick={() => {}} active />
        <NavBtn icon="S" label="Scan" onClick={onScan} />
        <NavBtn icon="+" label="Upload" onClick={onUpload} />
        <NavBtn icon="G" label="Gallery" onClick={onGallery} />
        <NavBtn icon="P" label="Profile" onClick={onProfile} />
      </div>
      <div style={styles.bottomBar}>
        <div style={styles.socialRow}>
          <a href="https://www.instagram.com/memoerabangalore/" target="_blank" rel="noreferrer" style={styles.socialLink}><div style={styles.socialIcon}><span style={styles.socialText}>IG</span></div></a>
          <a href="https://www.facebook.com/profile.php?id=61574312286741" target="_blank" rel="noreferrer" style={styles.socialLink}><div style={styles.socialIcon}><span style={styles.socialText}>FB</span></div></a>
          <a href="https://www.youtube.com/@memoerabangalore" target="_blank" rel="noreferrer" style={styles.socialLink}><div style={styles.socialIcon}><span style={styles.socialText}>YT</span></div></a>
          <a href="https://x.com/Memo_Era" target="_blank" rel="noreferrer" style={styles.socialLink}><div style={styles.socialIcon}><span style={styles.socialText}>X</span></div></a>
          <button onClick={onSignOut} style={styles.signOutBtn}>Sign Out</button>
        </div>
        <div style={styles.chatRow}><span style={styles.chatText}>Chat with us</span></div>
      </div>
    </div>
  );
}

function NavBtn({ icon, label, onClick, active }) {
  return (
    <button onClick={onClick} title={label}
      style={{ ...styles.navBtn, ...(active ? styles.navBtnActive : {}) }}>
      <span style={styles.navBtnText}>{icon}</span>
    </button>
  );
}

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const GOLD = "#C9A84C";
const styles = {
  screen: { position:"fixed",inset:0,background:"linear-gradient(160deg,#1a75cc 0%,#1565C0 60%,#0d47a1 100%)",
    display:"flex",flexDirection:"column",fontFamily:FONT,overflow:"hidden" },
  header: { padding:"48px 20px 16px",flexShrink:0 },
  logoRow: { display:"flex",alignItems:"center",gap:12 },
  logo: { width:52,height:52,objectFit:"contain",borderRadius:"50%",background:"rgba(255,255,255,0.15)",padding:4 },
  brand: { fontSize:22,fontWeight:700,color:"#fff",letterSpacing:"-0.3px" },
  tagline: { fontSize:11,color:"rgba(255,255,255,0.6)",letterSpacing:"0.05em" },
  content: { flex:1,padding:"0 80px 0 20px",overflowY:"auto" },
  aboutCard: { background:"rgba(255,255,255,0.08)",borderRadius:16,padding:"20px 18px",marginTop:8 },
  aboutTitle: { fontSize:20,fontWeight:700,color:"#fff",margin:"0 0 12px",
    borderBottom:"2px solid rgba(255,255,255,0.2)",paddingBottom:8 },
  aboutText: { fontSize:13,color:"rgba(255,255,255,0.75)",lineHeight:1.7,margin:"0 0 10px" },
  navBar: { position:"fixed",right:0,top:"50%",transform:"translateY(-50%)",
    background:"rgba(255,255,255,0.95)",borderRadius:"16px 0 0 16px",
    display:"flex",flexDirection:"column",alignItems:"center",
    padding:"12px 6px",gap:4,boxShadow:"-4px 0 20px rgba(0,0,0,0.2)",
    border:"2px solid "+GOLD,borderRight:"none" },
  navBtn: { background:"transparent",border:"none",borderRadius:12,padding:"10px 8px",
    cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2,width:52 },
  navBtnActive: { background:"rgba(21,101,192,0.12)" },
  navBtnText: { fontSize:18,fontWeight:700,color:"#1565C0" },
  bottomBar: { padding:"12px 20px 28px",flexShrink:0,
    background:"rgba(0,0,0,0.2)",borderTop:"1px solid rgba(255,255,255,0.1)" },
  socialRow: { display:"flex",alignItems:"center",gap:12,marginBottom:8,flexWrap:"wrap" },
  socialLink: { textDecoration:"none" },
  socialIcon: { width:36,height:36,borderRadius:"50%",background:"rgba(255,255,255,0.15)",
    border:"1px solid rgba(255,255,255,0.3)",display:"flex",alignItems:"center",justifyContent:"center" },
  socialText: { fontSize:10,fontWeight:700,color:"#fff",fontFamily:FONT },
  signOutBtn: { background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.25)",
    borderRadius:20,color:"rgba(255,255,255,0.6)",fontSize:11,fontFamily:FONT,
    padding:"5px 12px",cursor:"pointer",marginLeft:"auto" },
  chatRow: { display:"flex",alignItems:"center",gap:6 },
  chatText: { fontSize:12,color:"rgba(255,255,255,0.7)",fontFamily:FONT },
};
