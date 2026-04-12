import { useState, useEffect } from "react";
import { loadTargets, clearTargets } from "../hooks/useArStorage.js";
import { API_BASE } from "../config/api.js";

export default function GalleryScreen({ onBack }) {
  const [targets, setTargets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [playingVideo, setPlayingVideo] = useState(null);

  useEffect(() => {
    loadTargets().then(({ targets }) => {
      setTargets(targets || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleDelete = async (index) => {
    if (!confirm("Delete all uploaded targets?")) return;
    await clearTargets();
    setTargets([]);
  };

  if (playingVideo) {
    return (
      <div style={styles.videoScreen}>
        <button onClick={() => setPlayingVideo(null)} style={styles.closeVideoBtn}>Back</button>
        <video src={playingVideo} controls autoPlay playsInline
          style={styles.fullVideo} />
      </div>
    );
  }

  return (
    <div style={styles.screen}>
      <div style={styles.header}>
        <button onClick={onBack} style={styles.backBtn}>Back</button>
        <h2 style={styles.title}>Gallery</h2>
      </div>
      {loading ? (
        <div style={styles.empty}>Loading...</div>
      ) : targets.length === 0 ? (
        <div style={styles.empty}>No uploaded targets yet.</div>
      ) : (
        <div style={styles.grid}>
          {targets.map((t, i) => (
            <div key={i} style={styles.card}>
              {t._imagePreviewUrl ? (
                <img src={t._imagePreviewUrl} style={styles.thumb} alt={t.label} />
              ) : (
                <div style={styles.thumbPlaceholder}><span style={{fontSize:24}}>IMG</span></div>
              )}
              <div style={styles.cardInfo}>
                <span style={styles.cardLabel}>{t.label || "Target "+(i+1)}</span>
                <div style={styles.cardActions}>
                  {t.videoUrl && (
                    <button style={styles.playBtn} onClick={() => setPlayingVideo(t.videoUrl)}>Play</button>
                  )}
                  <button style={styles.deleteBtn} onClick={() => handleDelete(i)}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const TEAL = '#00C9A7';
const styles = {
  screen: { position:"fixed",inset:0,
    background:"linear-gradient(160deg, #061A1F 0%, #0A2229 50%, #061820 100%)",
    display:"flex",flexDirection:"column",fontFamily:FONT,overflowY:"auto" },
  header: { display:"flex",alignItems:"center",gap:12,padding:"48px 20px 16px" },
  backBtn: { background:"transparent",border:"none",color:"rgba(255,255,255,0.6)",
    fontSize:14,fontFamily:FONT,cursor:"pointer" },
  title: { fontSize:22,fontWeight:700,color:"#fff",margin:0 },
  empty: { flex:1,display:"flex",alignItems:"center",justifyContent:"center",
    color:"rgba(255,255,255,0.4)",fontSize:16,fontFamily:FONT,padding:40 },
  grid: { padding:"0 16px 40px",display:"flex",flexDirection:"column",gap:12 },
  card: { background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",
    borderRadius:16,overflow:"hidden",display:"flex",alignItems:"center",gap:12,padding:12 },
  thumb: { width:80,height:80,objectFit:"cover",borderRadius:10,flexShrink:0 },
  thumbPlaceholder: { width:80,height:80,background:"rgba(255,255,255,0.07)",
    borderRadius:10,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",
    color:"rgba(255,255,255,0.3)" },
  cardInfo: { flex:1,display:"flex",flexDirection:"column",gap:8 },
  cardLabel: { fontSize:14,fontWeight:600,color:"#fff",fontFamily:FONT },
  cardActions: { display:"flex",gap:8 },
  playBtn: { background:"rgba(0,201,167,0.15)",border:"1px solid rgba(0,201,167,0.4)",
    borderRadius:8,color:TEAL,fontSize:12,fontFamily:FONT,padding:"5px 14px",cursor:"pointer" },
  deleteBtn: { background:"rgba(255,80,80,0.12)",border:"1px solid rgba(255,80,80,0.35)",
    borderRadius:8,color:"#ff8080",fontSize:12,fontFamily:FONT,padding:"5px 14px",cursor:"pointer" },
  videoScreen: { position:"fixed",inset:0,background:"#000",display:"flex",flexDirection:"column" },
  closeVideoBtn: { position:"absolute",top:20,left:20,zIndex:10,background:"rgba(0,0,0,0.5)",
    border:"1px solid rgba(255,255,255,0.3)",borderRadius:20,color:"#fff",
    fontSize:14,fontFamily:FONT,padding:"8px 16px",cursor:"pointer" },
  fullVideo: { width:"100%",height:"100%",objectFit:"contain" },
};
