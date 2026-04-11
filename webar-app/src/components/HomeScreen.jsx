export default function HomeScreen({ onScan, onUpload, onProfile, onGallery, onSignOut }) {
  const whatsappUrl = "https://wa.me/918660418820";
  return (
    <div style={styles.screen}>
      <div style={styles.watermark}>
        <img src="/logo.png" alt="" style={styles.watermarkImg} />
      </div>
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
          <p style={styles.aboutText}>We are dedicated to safeguarding your most cherished memories through advanced, secure digital storage solutions designed for modern life. Our mission is to ensure that your precious moments in single touch.</p>
          <p style={styles.aboutText}>Also Enhance your business with Smart Broucher &amp; We are Avoiding 1st Copy or Duplicate of Product &amp; act as an Mini Theft Protection</p>
        </div>
      </div>
      <div style={styles.navBar}>
        <NavBtn icon={<HomeIcon />} label="Home" onClick={() => {}} active />
        <NavBtn icon={<ScanIcon />} label="Scan" onClick={onScan} />
        <NavBtn icon={<PlusIcon />} label="Upload" onClick={onUpload} />
        <NavBtn icon={<ProfileIcon />} label="Profile" onClick={onProfile} />
        <NavBtn icon={<GearIcon />} label="Gallery" onClick={onGallery} />
      </div>
      <div style={styles.bottomBar}>
        <div style={styles.socialRow}>
          <SocialLink href="https://www.instagram.com/memoerabangalore/" label="IG" />
          <SocialLink href="https://www.facebook.com/profile.php?id=61574312286741" label="FB" />
          <SocialLink href="https://www.youtube.com/@memoerabangalore" label="YT" />
          <SocialLink href="https://x.com/Memo_Era" label="X" />
          <button onClick={onSignOut} style={styles.signOutBtn}>Sign Out</button>
        </div>
        <a href={whatsappUrl} target="_blank" rel="noreferrer" style={styles.chatLink}>
          <WhatsAppIcon />
          <span style={styles.chatText}>Chat with us</span>
        </a>
      </div>
    </div>
  );
}

function NavBtn({ icon, label, onClick, active }) {
  return (
    <button onClick={onClick} title={label}
      style={{ ...styles.navBtn, ...(active ? styles.navBtnActive : {}) }}>
      {icon}
    </button>
  );
}

function SocialLink({ href, label }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" style={{ textDecoration:"none" }}>
      <div style={styles.socialIcon}><span style={styles.socialText}>{label}</span></div>
    </a>
  );
}

function HomeIcon() {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
}
function ScanIcon() {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 7 4 4 7 4"/><polyline points="17 4 20 4 20 7"/><polyline points="20 17 20 20 17 20"/><polyline points="7 20 4 20 4 17"/></svg>;
}
function PlusIcon() {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>;
}
function ProfileIcon() {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
}
function GearIcon() {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>;
}
function WhatsAppIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="#25D366" style={{marginRight:6}}><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>;
}

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const GOLD = "#C9A84C";
const styles = {
  screen: { position:"fixed",inset:0,
    background:"linear-gradient(160deg, #061A1F 0%, #0A2229 50%, #061820 100%)",
    display:"flex",flexDirection:"column",fontFamily:FONT,overflow:"hidden" },
  watermark: { position:"fixed",bottom:-60,left:-40,width:"70vw",maxWidth:280,opacity:0.06,pointerEvents:"none",zIndex:0 },
  watermarkImg: { width:"100%",filter:"brightness(10) saturate(0)" },
  header: { padding:"48px 20px 16px",flexShrink:0,position:"relative",zIndex:1 },
  logoRow: { display:"flex",alignItems:"center",gap:12 },
  logo: { width:56,height:56,objectFit:"contain",borderRadius:"50%",background:"rgba(255,255,255,0.08)",padding:4 },
  brand: { fontSize:24,fontWeight:700,color:"#fff",letterSpacing:"-0.3px" },
  tagline: { fontSize:12,color:"rgba(255,255,255,0.5)",letterSpacing:"0.05em" },
  content: { flex:1,padding:"0 80px 0 20px",overflowY:"auto",position:"relative",zIndex:1 },
  aboutCard: { background:"rgba(255,255,255,0.04)",borderRadius:16,padding:"20px 18px",marginTop:8 },
  aboutTitle: { fontSize:20,fontWeight:700,color:"#fff",margin:"0 0 12px",
    borderBottom:"2px solid rgba(255,255,255,0.15)",paddingBottom:8,textDecoration:"underline" },
  aboutText: { fontSize:13,color:"rgba(255,255,255,0.65)",lineHeight:1.7,margin:"0 0 10px" },
  navBar: { position:"fixed",right:0,top:"50%",transform:"translateY(-50%)",
    background:"rgba(255,255,255,0.97)",borderRadius:"16px 0 0 16px",
    display:"flex",flexDirection:"column",alignItems:"center",
    padding:"14px 8px",gap:6,
    boxShadow:"-4px 0 20px rgba(0,0,0,0.4)",
    border:"2px solid "+GOLD,borderRight:"none",zIndex:10 },
  navBtn: { background:"transparent",border:"none",borderRadius:12,padding:"10px",
    cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",width:52 },
  navBtnActive: { background:"rgba(201,168,76,0.15)" },
  bottomBar: { padding:"12px 20px 28px",flexShrink:0,
    background:"rgba(0,0,0,0.3)",borderTop:"1px solid rgba(255,255,255,0.08)",position:"relative",zIndex:1 },
  socialRow: { display:"flex",alignItems:"center",gap:10,marginBottom:10,flexWrap:"wrap" },
  socialIcon: { width:36,height:36,borderRadius:"50%",background:"transparent",
    border:"1.5px solid rgba(255,255,255,0.4)",
    display:"flex",alignItems:"center",justifyContent:"center" },
  socialText: { fontSize:10,fontWeight:700,color:"rgba(255,255,255,0.8)",fontFamily:FONT },
  signOutBtn: { background:"transparent",border:"1px solid rgba(255,255,255,0.2)",
    borderRadius:20,color:"rgba(255,255,255,0.5)",fontSize:11,fontFamily:FONT,
    padding:"5px 12px",cursor:"pointer",marginLeft:"auto" },
  chatLink: { textDecoration:"none",display:"inline-flex",alignItems:"center" },
  chatText: { fontSize:13,color:"rgba(255,255,255,0.8)",fontFamily:FONT,fontWeight:500 },
};
