import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import CameraCapture from './CameraCapture.jsx';
import VideoEditorScreen from './VideoEditorScreen.jsx';

const hiddenInput = {
  position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none',
};

// VideoPickerSheet — file picker for video overlay only
function VideoPickerSheet({ onFile, onClose }) {
  function handleChange(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    onClose();
    if (file) onFile(file);
  }
  return (
    <>
      <div style={sheet.backdrop} onClick={onClose} />
      <div style={sheet.sheet}>
        <div style={sheet.handle} />
        <p style={sheet.title}>Select Video Overlay</p>
        <label style={sheet.optionBtn}>
          <input type="file" accept="video/mp4,video/webm,video/*"
            capture="environment" style={hiddenInput} onChange={handleChange} onClick={(e) => { e.target.value = ''; }} />
          <span style={sheet.optionIcon}>📷</span>
          <div><p style={sheet.optionLabel}>Record Video</p><p style={sheet.optionHint}>Record with camera</p></div>
        </label>
        <label style={sheet.optionBtn}>
          <input type="file" accept="video/mp4,video/webm,video/*"
            style={hiddenInput} onChange={handleChange} onClick={(e) => { e.target.value = ''; }} />
          <span style={sheet.optionIcon}>📁</span>
          <div><p style={sheet.optionLabel}>Files</p><p style={sheet.optionHint}>Choose from device</p></div>
        </label>
        <button style={sheet.cancelBtn} onClick={onClose}>Cancel</button>
      </div>
    </>
  );
}

// ── Video confirmation screen ─────────────────────────────────────────────────
// Shown after editing is done; lets the user approve or go back before committing.
function VideoConfirmScreen({ videoFile, onConfirm, onEditAgain, onCancel }) {
  const videoRef = useRef(null);
  const [srcUrl, setSrcUrl] = useState('');

  useEffect(() => {
    const url = URL.createObjectURL(videoFile);
    setSrcUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [videoFile]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !srcUrl) return;
    v.src = srcUrl;
    v.load();
    v.play().catch(() => {});
  }, [srcUrl]);

  const size = videoFile.size < 1024 * 1024
    ? `${(videoFile.size / 1024).toFixed(0)} KB`
    : `${(videoFile.size / (1024 * 1024)).toFixed(1)} MB`;

  return createPortal(
    <div style={cs.screen}>
      {/* Header */}
      <div style={cs.header}>
        <button onClick={onCancel} style={cs.cancelBtn}>✕ Cancel</button>
        <span style={cs.title}>Confirm Video</span>
        <div style={{ width: 72 }} />
      </div>

      {/* Video preview */}
      <div style={cs.previewWrap}>
        <video ref={videoRef} style={cs.video}
          playsInline webkit-playsinline loop muted autoPlay />
      </div>

      {/* File info */}
      <div style={cs.infoRow}>
        <span style={cs.infoIcon}>🎬</span>
        <div>
          <p style={cs.fileName}>{videoFile.name}</p>
          <p style={cs.fileSize}>{size}</p>
        </div>
      </div>

      {/* Question */}
      <p style={cs.question}>Use this edited video?</p>

      {/* Action buttons */}
      <div style={cs.btnCol}>
        <button onClick={onConfirm} style={cs.confirmBtn}>
          Confirm &amp; Upload
        </button>
        <button onClick={onEditAgain} style={cs.editBtn}>
          Edit Again
        </button>
        <button onClick={onCancel} style={cs.discardBtn}>
          Discard Video
        </button>
      </div>
    </div>,
    document.body
  );
}

const CFONT = '"Outfit", -apple-system, BlinkMacSystemFont, sans-serif';
const CTEAL = '#00C9A7';
const cs = {
  screen: { position:'fixed', inset:0, background:'#040D0B', zIndex:3500,
    display:'flex', flexDirection:'column', fontFamily:CFONT },
  header: { display:'flex', alignItems:'center', justifyContent:'space-between',
    padding:'52px 20px 16px', background:'rgba(0,0,0,0.5)',
    backdropFilter:'blur(8px)', WebkitBackdropFilter:'blur(8px)', flexShrink:0 },
  cancelBtn: { background:'transparent', border:'none', color:'rgba(255,255,255,0.5)',
    fontSize:13, fontFamily:CFONT, cursor:'pointer', padding:'4px 0' },
  title: { color:'#fff', fontSize:16, fontWeight:700, fontFamily:CFONT },

  previewWrap: { width:'100%', flex:1, background:'#000',
    display:'flex', alignItems:'center', justifyContent:'center', minHeight:0 },
  video: { width:'100%', height:'100%', objectFit:'contain', display:'block' },

  infoRow: { display:'flex', alignItems:'center', gap:12,
    padding:'14px 20px', borderBottom:'1px solid rgba(255,255,255,0.07)', flexShrink:0 },
  infoIcon: { fontSize:22, flexShrink:0 },
  fileName: { fontSize:13, color:'rgba(255,255,255,0.8)', fontFamily:CFONT,
    margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:260 },
  fileSize: { fontSize:11, color:'rgba(255,255,255,0.35)', fontFamily:CFONT, margin:'2px 0 0' },

  question: { fontSize:17, fontWeight:700, color:'#fff', fontFamily:CFONT,
    textAlign:'center', margin:'22px 20px 4px' },

  btnCol: { display:'flex', flexDirection:'column', gap:12,
    padding:'12px 20px 44px', flexShrink:0 },
  confirmBtn: { width:'100%', background:`linear-gradient(135deg, ${CTEAL}, #00E5CC)`,
    border:'none', borderRadius:50, color:'#040D0B', fontSize:16, fontWeight:700,
    fontFamily:CFONT, padding:'16px', cursor:'pointer',
    boxShadow:`0 4px 20px rgba(0,201,167,0.4)` },
  editBtn: { width:'100%', background:'rgba(0,201,167,0.08)',
    border:`1px solid rgba(0,201,167,0.35)`, borderRadius:50,
    color:CTEAL, fontSize:15, fontWeight:600, fontFamily:CFONT,
    padding:'14px', cursor:'pointer' },
  discardBtn: { width:'100%', background:'transparent',
    border:'1px solid rgba(255,255,255,0.1)', borderRadius:50,
    color:'rgba(255,255,255,0.35)', fontSize:14, fontFamily:CFONT,
    padding:'12px', cursor:'pointer' },
};

// ─────────────────────────────────────────────────────────────────────────────

export default function TargetCard({ index, data, onChange, onRemove, showValidation }) {
  const [imageDragOver, setImageDragOver] = useState(false);
  const [videoDragOver, setVideoDragOver] = useState(false);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [showVideoPicker, setShowVideoPicker] = useState(false);
  const [editingVideo,   setEditingVideo]   = useState(null); // File open in editor
  const [confirmedVideo, setConfirmedVideo] = useState(null); // File awaiting approval

  const handleImageFile = useCallback((file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Please upload a JPG, PNG, or WebP image.'); return; }
    if (file.size > 50 * 1024 * 1024) { alert('Image is larger than 50 MB. Please use a smaller image.'); return; }
    if (data.imagePreviewUrl) URL.revokeObjectURL(data.imagePreviewUrl);
    onChange({ imageFile: file, imagePreviewUrl: URL.createObjectURL(file) });
  }, [data.imagePreviewUrl, onChange]);

  const handleVideoFile = useCallback((file, skipEditor = false) => {
    if (!file) return;
    if (!file.type.startsWith('video/')) { alert('Please upload an MP4 or WebM video file.'); return; }
    if (file.size > 100 * 1024 * 1024) { alert('Video is larger than 100 MB. Please compress it first.'); return; }
    if (skipEditor) {
      onChange({ videoFile: file, videoName: file.name, videoSize: formatFileSize(file.size) });
    } else {
      setEditingVideo(file);
    }
  }, [onChange]);

  const handleImageDrop = useCallback((e) => {
    e.preventDefault(); setImageDragOver(false);
    handleImageFile(e.dataTransfer.files[0]);
  }, [handleImageFile]);

  const handleVideoDrop = useCallback((e) => {
    e.preventDefault(); setVideoDragOver(false);
    handleVideoFile(e.dataTransfer.files[0]);
  }, [handleVideoFile]);

  const imageMissing = showValidation && !data.imageFile;
  const videoMissing = showValidation && !data.videoFile;

  return (
    <div style={styles.card}>
      {showImagePicker && (
        <CameraCapture
          onCapture={(file) => { setShowImagePicker(false); handleImageFile(file); }}
          onClose={() => setShowImagePicker(false)}
        />
      )}
      {showVideoPicker && (
        <VideoPickerSheet
          onFile={handleVideoFile}
          onClose={() => setShowVideoPicker(false)}
        />
      )}
      {editingVideo && (
        <VideoEditorScreen
          videoFile={editingVideo}
          onDone={(editedFile) => {
            setEditingVideo(null);
            setConfirmedVideo(editedFile); // → show confirm screen, don't commit yet
          }}
          onCancel={() => setEditingVideo(null)}
        />
      )}
      {confirmedVideo && (
        <VideoConfirmScreen
          videoFile={confirmedVideo}
          onConfirm={() => {
            // User approved — commit the video to the card
            onChange({
              videoFile: confirmedVideo,
              videoName: confirmedVideo.name,
              videoSize: formatFileSize(confirmedVideo.size),
            });
            setConfirmedVideo(null);
          }}
          onEditAgain={() => {
            // Send the edited file back into the editor
            setEditingVideo(confirmedVideo);
            setConfirmedVideo(null);
          }}
          onCancel={() => setConfirmedVideo(null)} // discard edited file
        />
      )}

      <div style={styles.cardTopAccent} />

      {/* Header */}
      <div style={styles.cardHeader}>
        <div style={styles.cardTitleRow}>
          <div style={styles.cardBadge}>{index + 1}</div>
          <span style={styles.cardTitle}>Target {index + 1}</span>
        </div>
        <button onClick={onRemove} style={styles.removeButton}
          aria-label={`Remove target ${index + 1}`}>✕</button>
      </div>

      {/* Marker Image */}
      <p style={styles.fieldLabel}>Marker Image<span style={styles.fieldHint}> — the image your camera will detect</span></p>
      <div style={{
          ...styles.dropZone,
          ...(imageDragOver ? styles.dropZoneActive : {}),
          ...(imageMissing ? styles.dropZoneError : {}),
          height: data.imagePreviewUrl ? 'auto' : 80,
          padding: data.imagePreviewUrl ? 8 : '0 16px',
        }}
        onClick={() => setShowImagePicker(true)}
        onDragOver={(e) => { e.preventDefault(); setImageDragOver(true); }}
        onDragLeave={() => setImageDragOver(false)}
        onDrop={handleImageDrop}
        role="button" tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setShowImagePicker(true)}>
        {data.imagePreviewUrl ? (
          <div style={styles.imagePreviewRow}>
            <img src={data.imagePreviewUrl} alt="Marker preview" style={styles.imagePreview} />
            <div style={styles.imagePreviewInfo}>
              <span style={styles.fileName}>{data.imageFile?.name}</span>
              <span style={styles.changeLink}>Tap to change</span>
            </div>
          </div>
        ) : (
          <div style={styles.dropZoneContent}>
            <span style={styles.dropZoneIcon}>🖼️</span>
            <span style={styles.dropZoneText}>{imageMissing ? 'Image required' : 'Tap to select image'}</span>
          </div>
        )}
      </div>

      {/* Video Overlay */}
      <p style={{ ...styles.fieldLabel, marginTop: 16 }}>Video Overlay<span style={styles.fieldHint}> — plays when marker is detected</span></p>
      <div style={{
          ...styles.dropZone,
          ...(videoDragOver ? styles.dropZoneActive : {}),
          ...(videoMissing ? styles.dropZoneError : {}),
          height: 80,
        }}
        onClick={() => setShowVideoPicker(true)}
        onDragOver={(e) => { e.preventDefault(); setVideoDragOver(true); }}
        onDragLeave={() => setVideoDragOver(false)}
        onDrop={handleVideoDrop}
        role="button" tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setShowVideoPicker(true)}>
        {data.videoFile ? (
          <div style={styles.dropZoneContent}>
            <span style={styles.dropZoneIcon}>🎬</span>
            <div>
              <p style={{ ...styles.fileName, margin: 0 }}>{data.videoName}</p>
              <p style={{ ...styles.fieldHint, margin: 0 }}>{data.videoSize} · Tap to change</p>
            </div>
          </div>
        ) : (
          <div style={styles.dropZoneContent}>
            <span style={styles.dropZoneIcon}>🎬</span>
            <span style={styles.dropZoneText}>{videoMissing ? 'Video required' : 'Tap to select video'}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const FONT   = '"Outfit", -apple-system, BlinkMacSystemFont, sans-serif';
const TEAL   = '#00C9A7';
const CYAN   = '#00E5CC';
const BORDER = 'rgba(0,201,167,0.25)';

const sheet = {
  backdrop: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(4px)',
    WebkitBackdropFilter: 'blur(4px)',
    zIndex: 1000,
  },
  sheet: {
    position: 'fixed', bottom: 0, left: 0, right: 0,
    background: '#0E1628',
    border: '1px solid rgba(0,201,167,0.2)',
    borderBottom: 'none',
    borderRadius: '24px 24px 0 0',
    padding: '12px 20px 40px',
    zIndex: 1001,
    display: 'flex', flexDirection: 'column', gap: 10,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    background: 'rgba(255,255,255,0.2)',
    alignSelf: 'center', marginBottom: 8,
  },
  title: {
    fontSize: 15, fontWeight: 600, fontFamily: FONT,
    color: 'rgba(255,255,255,0.7)', textAlign: 'center',
    margin: '0 0 8px',
  },
  optionBtn: {
    display: 'flex', alignItems: 'center', gap: 16,
    background: 'rgba(0,201,167,0.06)',
    border: '1px solid rgba(0,201,167,0.2)',
    borderRadius: 16, padding: '14px 18px',
    cursor: 'pointer', textAlign: 'left', width: '100%',
    position: 'relative', overflow: 'hidden',
  },
  optionIcon: { fontSize: 28, flexShrink: 0 },
  optionLabel: {
    fontSize: 15, fontWeight: 600, fontFamily: FONT,
    color: '#ffffff', margin: 0,
  },
  optionHint: {
    fontSize: 12, fontFamily: FONT,
    color: 'rgba(255,255,255,0.35)', margin: '2px 0 0',
  },
  cancelBtn: {
    marginTop: 4,
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 16, padding: '14px',
    color: 'rgba(255,255,255,0.4)', fontSize: 15,
    fontFamily: FONT, cursor: 'pointer', width: '100%',
  },
};

const styles = {
  card: {
    background: 'rgba(0,201,167,0.04)', border: `1px solid ${BORDER}`,
    borderRadius: 18, padding: '0 20px 24px',
    display: 'flex', flexDirection: 'column',
    backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
    position: 'relative', overflow: 'hidden',
  },
  cardTopAccent: {
    height: 2, background: `linear-gradient(90deg, ${TEAL}, ${CYAN})`,
    marginLeft: -20, marginRight: -20, marginBottom: 18,
    borderRadius: '18px 18px 0 0',
  },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  cardTitleRow: { display: 'flex', alignItems: 'center', gap: 10 },
  cardBadge: {
    width: 26, height: 26, borderRadius: '50%',
    background: `linear-gradient(135deg, ${TEAL}, ${CYAN})`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, fontWeight: 700, color: '#080C18', fontFamily: FONT, flexShrink: 0,
  },
  cardTitle: { fontSize: 15, fontWeight: 600, color: '#ffffff', fontFamily: FONT },
  removeButton: {
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8, color: 'rgba(255,255,255,0.4)', fontSize: 13,
    width: 30, height: 30, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT,
  },
  fieldLabel: { fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.55)', fontFamily: FONT, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' },
  fieldHint: { fontSize: 11, fontWeight: 400, color: 'rgba(255,255,255,0.28)', fontFamily: FONT, textTransform: 'none', letterSpacing: 0 },
  dropZone: {
    border: `1.5px dashed ${BORDER}`, borderRadius: 12,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', transition: 'border-color 0.2s, background 0.2s',
    background: 'rgba(0,201,167,0.02)', minHeight: 80, overflow: 'hidden',
  },
  dropZoneActive: { borderColor: TEAL, background: 'rgba(0,201,167,0.07)' },
  dropZoneError: { borderColor: '#FF6B6B', background: 'rgba(255,80,80,0.05)' },
  dropZoneContent: { display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px' },
  dropZoneIcon: { fontSize: 20, flexShrink: 0 },
  dropZoneText: { fontSize: 13, color: 'rgba(255,255,255,0.28)', fontFamily: FONT },
  imagePreviewRow: { display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '8px 4px' },
  imagePreview: { width: 60, height: 60, objectFit: 'cover', borderRadius: 8, flexShrink: 0, border: `1px solid ${BORDER}` },
  imagePreviewInfo: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 },
  fileName: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontFamily: FONT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  changeLink: { fontSize: 12, color: TEAL, fontFamily: FONT },
};
