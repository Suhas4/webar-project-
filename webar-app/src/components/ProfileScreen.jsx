import { useState } from "react";
import { API_BASE } from "../config/api.js";

export default function ProfileScreen({ user, onBack }) {
  const [editing, setEditing] = useState(false);
  const dob = user?.dateOfBirth || "";
  const dobParts = dob ? dob.split("-") : [];
  const dobDisplay = dobParts.length === 3 ? dobParts[2]+" | "+dobParts[1]+" | "+dobParts[0] : dob || "Not set";
  const initials = ((user?.firstName||" ")[0]+(user?.lastName||" ")[0]).toUpperCase();

  return (
    <div style={styles.screen}>
      <button onClick={onBack} style={styles.backBtn}>Back</button>
      <div style={styles.avatarWrap}>
        <div style={styles.hexOuter}>
          <div style={styles.hexInner}>
            <span style={styles.initials}>{initials}</span>
          </div>
        </div>
      </div>
      <div style={styles.name}>{((user?.firstName||"")+" "+(user?.lastName||"")).toUpperCase()}</div>
      <div style={styles.divider}/>
      <div style={styles.field}>{dobDisplay}</div>
      <div style={styles.divider}/>
      <div style={styles.field}>{user?.mobile || ""}</div>
      <div style={styles.divider}/>
      <div style={{...styles.field,fontSize:11,color:"rgba(255,255,255,0.5)"}}>{user?.securityQuestion || "Security Question"}</div>
      <div style={styles.divider}/>
      <div style={styles.buttonRow}>
        <button style={styles.editBtn} onClick={() => setEditing(true)}>EDIT</button>
        <button style={styles.doneBtn} onClick={onBack}>DONE</button>
      </div>
    </div>
  );
}

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const GOLD = "#C9A84C";
const styles = {
  screen: { position:"fixed",inset:0,background:"linear-gradient(160deg,#1a75cc 0%,#1565C0 60%,#0d47a1 100%)",
    display:"flex",flexDirection:"column",alignItems:"center",fontFamily:FONT,padding:"24px 20px 40px",overflowY:"auto" },
  backBtn: { alignSelf:"flex-start",background:"transparent",border:"none",color:"rgba(255,255,255,0.6)",
    fontSize:14,fontFamily:FONT,cursor:"pointer",marginBottom:16 },
  avatarWrap: { marginBottom:16 },
  hexOuter: { width:120,height:120,background:"linear-gradient(135deg,"+GOLD+",#fff8dc)",
    clipPath:"polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%)",
    display:"flex",alignItems:"center",justifyContent:"center" },
  hexInner: { width:108,height:108,background:"#1a3f7a",
    clipPath:"polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%)",
    display:"flex",alignItems:"center",justifyContent:"center" },
  initials: { fontSize:36,fontWeight:700,color:"#fff",fontFamily:FONT },
  name: { fontSize:22,fontWeight:700,color:"#fff",letterSpacing:"1px",marginBottom:8,textAlign:"center" },
  divider: { width:"80%",height:1,background:"rgba(255,255,255,0.25)",margin:"6px 0" },
  field: { fontSize:14,color:"rgba(255,255,255,0.85)",fontFamily:FONT,padding:"6px 0",textAlign:"center" },
  buttonRow: { display:"flex",gap:16,marginTop:24 },
  editBtn: { background:"transparent",border:"2px solid rgba(255,255,255,0.5)",borderRadius:8,
    color:"#fff",fontSize:14,fontWeight:700,fontFamily:FONT,padding:"10px 32px",cursor:"pointer" },
  doneBtn: { background:GOLD,border:"none",borderRadius:8,
    color:"#fff",fontSize:14,fontWeight:700,fontFamily:FONT,padding:"10px 32px",cursor:"pointer" },
};
