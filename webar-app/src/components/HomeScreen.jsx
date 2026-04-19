export default function HomeScreen({ onScan, onUpload, onProfile, onGallery, onSettings, onSignOut }) {
  const whatsappUrl = "https://wa.me/918660418820";
  return (
    <div style={styles.screen}>
      <div style={styles.watermark}>
        <img src="/logo.png" alt="" style={styles.watermarkImg} />
      </div>

      {/* Header — logo left, sign out right */}
      <div style={styles.header}>
        <div style={styles.logoRow}>
          <div style={styles.logoCircle}>
            <img src="/logo-icon.jpg" alt="Memoera" style={styles.logo} />
          </div>
          <div style={styles.brandWrap}>
            <div style={styles.brand}>memoera</div>
            <div style={styles.tagline}>Restoring Memories</div>
          </div>
        </div>
        <button onClick={onSignOut} style={styles.signOutBtn}>Sign Out</button>
      </div>

      {/* Scrollable content */}
      <div style={styles.content}>
        {/* About Us */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>About Us</h2>
          <p style={styles.cardText}>We are dedicated to safeguarding your most cherished memories through advanced, secure digital storage solutions designed for modern life. Our mission is to ensure that your precious moments in single touch.</p>
          <p style={styles.cardText}>Also Enhance your business with Smart Broucher &amp; We are Avoiding 1st Copy or Duplicate of Product &amp; act as an Mini Theft Protection</p>
        </div>

        {/* Company Details */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Company Details</h2>
          <div style={styles.detailRow}>
            <span style={styles.detailLabel}>Email</span>
            <span style={styles.detailValue}>memoerabangalore@gmail.com</span>
          </div>
          <div style={styles.detailRow}>
            <span style={styles.detailLabel}>Mobile</span>
            <span style={styles.detailValue}>+91 8660418820</span>
          </div>
          <div style={styles.detailRow}>
            <span style={styles.detailLabel}>MD &amp; Founder</span>
            <span style={styles.detailValue}>Lohith B.</span>
          </div>
        </div>
      </div>

      {/* Right-side nav bar — 6 items */}
      <div style={styles.navBar}>
        <NavBtn icon={<HomeIcon />}    label="Home"     onClick={() => {}} active />
        <NavBtn icon={<ScanIcon />}    label="Scan"     onClick={onScan} />
        <NavBtn icon={<PlusIcon />}    label="Upload"   onClick={onUpload} />
        <NavBtn icon={<ProfileIcon />} label="Profile"  onClick={onProfile} />
        <NavBtn icon={<GalleryIcon />} label="Gallery"  onClick={onGallery} />
        <NavBtn icon={<GearIcon />}    label="Settings" onClick={onSettings} />
      </div>

      {/* Bottom bar — social links + WhatsApp */}
      <div style={styles.bottomBar}>
        <div style={styles.socialRow}>
          <SocialLink href="https://www.instagram.com/memoerabangalore/" icon={<InstagramIcon />} />
          <SocialLink href="https://www.facebook.com/profile.php?id=61574312286741" icon={<FacebookIcon />} />
          <SocialLink href="https://www.youtube.com/@memoerabangalore" icon={<YouTubeIcon />} />
          <SocialLink href="https://x.com/Memo_Era" icon={<XIcon />} />
          <a href={whatsappUrl} target="_blank" rel="noreferrer" style={styles.chatLink}>
            <WhatsAppIcon />
            <span style={styles.chatText}>Chat with us</span>
          </a>
        </div>
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

function SocialLink({ href, icon }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
      <div style={styles.socialIcon}>{icon}</div>
    </a>
  );
}

function InstagramIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <defs>
        <radialGradient id="ig-grad" cx="30%" cy="107%" r="150%">
          <stop offset="0%" stopColor="#fdf497"/>
          <stop offset="5%" stopColor="#fdf497"/>
          <stop offset="45%" stopColor="#fd5949"/>
          <stop offset="60%" stopColor="#d6249f"/>
          <stop offset="90%" stopColor="#285AEB"/>
        </radialGradient>
      </defs>
      <rect x="2" y="2" width="20" height="20" rx="6" fill="url(#ig-grad)"/>
      <circle cx="12" cy="12" r="4.5" stroke="#fff" strokeWidth="1.8" fill="none"/>
      <circle cx="17.5" cy="6.5" r="1.2" fill="#fff"/>
    </svg>
  );
}
function FacebookIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24">
      <rect width="24" height="24" rx="6" fill="#1877F2"/>
      <path d="M15.5 8H13V6.5C13 5.67 13.67 5.5 14 5.5h1.5V3h-2C11.12 3 10 4.34 10 6v2H8v2.5h2V21h3v-10.5h2l.5-2.5z" fill="#fff"/>
    </svg>
  );
}
function YouTubeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24">
      <rect width="24" height="24" rx="6" fill="#FF0000"/>
      <path d="M19.6 8.2s-.2-1.3-.8-1.9c-.7-.8-1.6-.8-2-.8C14.4 5.4 12 5.4 12 5.4s-2.4 0-4.8.1c-.4 0-1.3 0-2 .8-.6.6-.8 1.9-.8 1.9S4.2 9.6 4.2 11v1.3c0 1.4.2 2.8.2 2.8s.2 1.3.8 1.9c.7.8 1.7.7 2.2.8C8.8 18 12 18 12 18s2.4 0 4.8-.1c.4 0 1.3 0 2-.8.6-.6.8-1.9.8-1.9s.2-1.4.2-2.8V11c0-1.4-.2-2.8-.2-2.8zm-11 5.6V9.8l5.3 2-5.3 2z" fill="#fff"/>
    </svg>
  );
}
function XIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24">
      <rect width="24" height="24" rx="6" fill="#000"/>
      <path d="M17.5 3.5h2.8l-6 6.9 7.1 9.1h-5.5l-4.3-5.7-5 5.7H3.8l6.4-7.3L3.5 3.5h5.7l3.9 5.2 4.4-5.2zm-1 13.6h1.5L7.7 5h-1.6l10.4 12.1z" fill="#fff"/>
    </svg>
  );
}

function HomeIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
}
function ScanIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 7 4 4 7 4"/><polyline points="17 4 20 4 20 7"/><polyline points="20 17 20 20 17 20"/><polyline points="7 20 4 20 4 17"/></svg>;
}
function PlusIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>;
}
function ProfileIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
}
function GalleryIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>;
}
function GearIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>;
}
function WhatsAppIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="#25D366" style={{ marginRight: 6 }}><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>;
}

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const GOLD = "#C9A84C";
const styles = {
  screen: {
    position: "fixed", inset: 0,
    background: "linear-gradient(160deg, #061A1F 0%, #0A2229 50%, #061820 100%)",
    display: "flex", flexDirection: "column", fontFamily: FONT, overflow: "hidden",
  },
  watermark: {
    position: "fixed", bottom: -60, left: -40, width: "70vw", maxWidth: 280,
    opacity: 0.06, pointerEvents: "none", zIndex: 0,
  },
  watermarkImg: { width: "100%", filter: "brightness(10) saturate(0)" },

  // Header: logo left, sign out right
  header: {
    padding: "48px 20px 12px 20px", flexShrink: 0, position: "relative", zIndex: 1,
    display: "flex", alignItems: "center", justifyContent: "space-between",
    paddingRight: 80,
  },
  logoRow: { display: "flex", alignItems: "center", gap: 10 },
  logoCircle: {
    width: 60, height: 60, borderRadius: "50%", flexShrink: 0,
    background: "#071C22", overflow: "hidden",
  },
  logo: {
    width: "100%", height: "100%",
    objectFit: "contain", objectPosition: "center",
    display: "block",
  },
  brandWrap: { display: "flex", flexDirection: "column" },
  brand: { fontSize: 22, fontWeight: 700, color: "#fff", letterSpacing: "-0.3px" },
  tagline: {
    fontSize: 9, color: "rgba(255,255,255,0.5)", letterSpacing: "0.04em",
    lineHeight: 1.3, whiteSpace: "nowrap",
  },
  signOutBtn: {
    background: "transparent", border: "1px solid rgba(255,255,255,0.2)",
    borderRadius: 20, color: "rgba(255,255,255,0.5)", fontSize: 11, fontFamily: FONT,
    padding: "5px 12px", cursor: "pointer", flexShrink: 0,
  },

  // Scrollable content
  content: {
    flex: 1, padding: "0 80px 0 16px", overflowY: "auto",
    position: "relative", zIndex: 1, display: "flex", flexDirection: "column", gap: 12,
    paddingBottom: 80,
  },
  card: {
    background: "rgba(255,255,255,0.04)", borderRadius: 16, padding: "16px 18px", marginTop: 8,
  },
  cardTitle: {
    fontSize: 18, fontWeight: 700, color: "#fff", margin: "0 0 10px",
    borderBottom: "2px solid rgba(255,255,255,0.15)", paddingBottom: 8,
    textDecoration: "underline",
  },
  cardText: { fontSize: 13, color: "rgba(255,255,255,0.65)", lineHeight: 1.7, margin: "0 0 8px" },

  // Company Details rows
  detailRow: {
    display: "flex", flexDirection: "column", gap: 2, marginBottom: 10,
  },
  detailLabel: {
    fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em",
    textTransform: "uppercase", fontFamily: FONT,
  },
  detailValue: { fontSize: 13, color: "rgba(255,255,255,0.85)", fontFamily: FONT },

  // Right-side nav — 6 buttons
  navBar: {
    position: "fixed", right: 0, top: "50%", transform: "translateY(-50%)",
    background: "rgba(255,255,255,0.97)", borderRadius: "16px 0 0 16px",
    display: "flex", flexDirection: "column", alignItems: "center",
    padding: "10px 6px", gap: 2,
    boxShadow: "-4px 0 20px rgba(0,0,0,0.4)",
    border: "2px solid " + GOLD, borderRight: "none", zIndex: 10,
  },
  navBtn: {
    background: "transparent", border: "none", borderRadius: 10, padding: "8px",
    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", width: 46,
  },
  navBtnActive: { background: "rgba(201,168,76,0.15)" },

  // Bottom bar
  bottomBar: {
    padding: "10px 16px 24px", flexShrink: 0,
    background: "rgba(0,0,0,0.3)", borderTop: "1px solid rgba(255,255,255,0.08)",
    position: "relative", zIndex: 1,
  },
  socialRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  socialIcon: {
    width: 38, height: 38, borderRadius: 10,
    display: "flex", alignItems: "center", justifyContent: "center",
    overflow: "hidden",
  },
  chatLink: { textDecoration: "none", display: "inline-flex", alignItems: "center", marginLeft: "auto" },
  chatText: { fontSize: 13, color: "rgba(255,255,255,0.8)", fontFamily: FONT, fontWeight: 500 },
};
