import { useState, useRef } from 'react';
import ImageCropScreen from './ImageCropScreen.jsx';

const FONT = '"Outfit", -apple-system, BlinkMacSystemFont, sans-serif';
const hidden = { position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none' };

export default function CameraCapture({ onCapture, onClose }) {
  const cameraRef  = useRef(null);
  const galleryRef = useRef(null);
  const [cropUrl, setCropUrl] = useState(null);

  // Native camera → show crop screen
  const handleCameraFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) { onClose(); return; }
    setCropUrl(URL.createObjectURL(file));
  };

  // Gallery → use directly (no crop)
  const handleGalleryFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) onCapture(file);
    else onClose();
  };

  if (cropUrl) {
    return (
      <ImageCropScreen
        imageUrl={cropUrl}
        onDone={(cropped) => { URL.revokeObjectURL(cropUrl); setCropUrl(null); onCapture(cropped); }}
        onRetake={() => { URL.revokeObjectURL(cropUrl); setCropUrl(null); cameraRef.current?.click(); }}
        onCancel={() => { URL.revokeObjectURL(cropUrl); setCropUrl(null); onClose(); }}
      />
    );
  }

  return (
    <>
      <div style={s.backdrop} onClick={onClose} />
      <div style={s.sheet}>
        <div style={s.handle} />
        <p style={s.title}>Select Marker Image</p>

        {/* Native device camera → opens system camera app */}
        <label style={s.optionBtn}>
          <input ref={cameraRef} type="file" accept="image/*"
            capture="environment" style={hidden}
            onChange={handleCameraFile} onClick={(e) => { e.target.value = ''; }} />
          <span style={s.icon}>📷</span>
          <div>
            <p style={s.label}>Camera</p>
            <p style={s.hint}>Take a photo &amp; crop</p>
          </div>
        </label>

        {/* Gallery → file picker */}
        <label style={s.optionBtn}>
          <input ref={galleryRef} type="file" accept="image/jpeg,image/png,image/webp"
            style={hidden}
            onChange={handleGalleryFile} onClick={(e) => { e.target.value = ''; }} />
          <span style={s.icon}>🖼️</span>
          <div>
            <p style={s.label}>Gallery</p>
            <p style={s.hint}>Choose from photos</p>
          </div>
        </label>

        <button style={s.cancelBtn} onClick={onClose}>Cancel</button>
      </div>
    </>
  );
}

const s = {
  backdrop: { position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',backdropFilter:'blur(4px)',WebkitBackdropFilter:'blur(4px)',zIndex:2000 },
  sheet:    { position:'fixed',bottom:0,left:0,right:0,background:'#0E1628',border:'1px solid rgba(0,201,167,0.2)',borderBottom:'none',borderRadius:'24px 24px 0 0',padding:'12px 20px 48px',zIndex:2001,display:'flex',flexDirection:'column',gap:10 },
  handle:   { width:40,height:4,borderRadius:2,background:'rgba(255,255,255,0.2)',alignSelf:'center',marginBottom:8 },
  title:    { fontSize:15,fontWeight:600,fontFamily:FONT,color:'rgba(255,255,255,0.7)',textAlign:'center',margin:'0 0 8px' },
  optionBtn:{ display:'flex',alignItems:'center',gap:16,background:'rgba(0,201,167,0.06)',border:'1px solid rgba(0,201,167,0.2)',borderRadius:16,padding:'14px 18px',cursor:'pointer',textAlign:'left',width:'100%' },
  icon:     { fontSize:28,flexShrink:0 },
  label:    { fontSize:15,fontWeight:600,fontFamily:FONT,color:'#fff',margin:0 },
  hint:     { fontSize:12,fontFamily:FONT,color:'rgba(255,255,255,0.35)',margin:'2px 0 0' },
  cancelBtn:{ marginTop:4,background:'transparent',border:'1px solid rgba(255,255,255,0.1)',borderRadius:16,padding:14,color:'rgba(255,255,255,0.4)',fontSize:15,fontFamily:FONT,cursor:'pointer',width:'100%' },
};
