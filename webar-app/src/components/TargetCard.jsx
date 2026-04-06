import { useRef, useState, useCallback } from 'react';

// Bottom sheet that lets user pick Camera or Files
function PickerSheet({ title, onCamera, onFiles, onClose }) {
  return (
    <>
      {/* Backdrop */}
      <div style={sheet.backdrop} onClick={onClose} />
      {/* Sheet */}
      <div style={sheet.sheet}>
        <div style={sheet.handle} />
        <p style={sheet.title}>{title}</p>
        <button style={sheet.optionBtn} onClick={onCamera}>
          <span style={sheet.optionIcon}>📷</span>
          <div>
            <p style={sheet.optionLabel}>Camera</p>
            <p style={sheet.optionHint}>Take a photo / record video</p>
          </div>
        </button>
        <button style={sheet.optionBtn} onClick={onFiles}>
          <span style={sheet.optionIcon}>📁</span>
          <div>
            <p style={sheet.optionLabel}>Files</p>
            <p style={sheet.optionHint}>Choose from your device</p>
          </div>
        </button>
        <button style={sheet.cancelBtn} onClick={onClose}>Cancel</button>
      </div>
    </>
  );
}

export default function TargetCard({ index, data, onChange, onRemove, showValidation }) {
  const imageCameraRef = useRef(null);
  const imageFilesRef  = useRef(null);
  const videoCameraRef = useRef(null);
  const videoFilesRef  = useRef(null);

  const [imageDragOver, setImageDragOver] = useState(false);
  const [videoDragOver, setVideoDragOver] = useState(false);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [showVideoPicker, setShowVideoPicker] = useState(false);

  const handleImageFile = useCallback((file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Please upload a JPG, PNG, or WebP image.'); return; }
    if (file.size > 50 * 1024 * 1024) { alert('Image is larger than 50 MB. Please use a smaller image.'); return; }
    if (data.imagePreviewUrl) URL.revokeObjectURL(data.imagePreviewUrl);
    onChange({ imageFile: file, imagePreviewUrl: URL.createObjectURL(file) });
  }, [data.imagePreviewUrl, onChange]);

  const handleImageDrop = useCallback((e) => {
    e.preventDefault(); setImageDragOver(false);
    handleImageFile(e.dataTransfer.files[0]);
  }, [handleImageFile]);

  const handleVideoFile = useCallback((file) => {
    if (!file) return;
    if (!file.type.startsWith('video/')) { alert('Please upload an MP4 or WebM video file.'); return; }
    if (file.size > 100 * 1024 * 1024) { alert('Video is larger than 100 MB. Please compress it first.'); return; }
    onChange({ videoFile: file, videoName: file.name, videoSize: formatFileSize(file.size) });
  }, [onChange]);

  const handleVideoDrop = useCallback((e) => {
    e.preventDefault(); setVideoDragOver(false);
    handleVideoFile(e.dataTransfer.files[0]);
  }, [handleVideoFile]);

  const ASPECT_OPTIONS = ['16:9', '4:3', '1:1', '9:16'];
  const imageMissing = showValidation && !data.imageFile;
  const videoMissing = showValidation && !data.videoFile;

  return (
    <div style={styles.card}>
      {/* Camera/Files picker sheets */}
      {showImagePicker && (
        <PickerSheet
          title="Select Marker Image"
          onCamera={() => { setShowImagePicker(false); imageCameraRef.current?.click(); }}
          onFiles={() => { setShowImagePicker(false); imageFilesRef.current?.click(); }}
          onClose={() => setShowImagePicker(false)}
        />
      )}
      {showVideoPicker && (
        <PickerSheet
          title="Select Video Overlay"
          onCamera={() => { setShowVideoPicker(false); videoCameraRef.current?.click(); }}
          onFiles={() => { setShowVideoPicker(false); videoFilesRef.current?.click(); }}
          onClose={() => setShowVideoPicker(false)}
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

      {/* Hidden image inputs — camera and files separately */}
      <input ref={imageCameraRef} type="file" accept="image/jpeg,image/png,image/webp"
        capture="environment" style={{ display: 'none' }}
        onChange={(e) => handleImageFile(e.target.files[0])}
        onClick={(e) => { e.target.value = ''; }} />
      <input ref={imageFilesRef} type="file" accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={(e) => handleImageFile(e.target.files[0])}
        onClick={(e) => { e.target.value = ''; }} />

      {/* Video */}
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

      {/* Hidden video inputs — camera and files separately */}
      <input ref={videoCameraRef} type="file" accept="video/mp4,video/webm"
        capture="environment" style={{ display: 'none' }}
        onChange={(e) => handleVideoFile(e.target.files[0])}
        onClick={(e) => { e.target.value = ''; }} />
      <input ref={videoFilesRef} type="file" accept="video/mp4,video/webm"
        style={{ display: 'none' }}
        onChange={(e) => handleVideoFile(e.target.files[0])}
        onClick={(e) => { e.target.value = ''; }} />

      {/* Aspect Ratio */}
      <p style={{ ...styles.fieldLabel, marginTop: 16 }}>Video Aspect Ratio<span style={styles.fieldHint}> — match your video's dimensions</span></p>
      <div style={styles.aspectRow}>
        {ASPECT_OPTIONS.map((ratio) => (
          <button key={ratio} onClick={() => onChange({ aspectRatio: ratio })}
            style={{ ...styles.aspectButton, ...(data.aspectRatio === ratio ? styles.aspectButtonActive : {}) }}>
            {ratio}
          </button>
        ))}
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

// ── Bottom sheet styles ───────────────────────────────────────────────────────
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
    border: `1px solid rgba(0,201,167,0.2)`,
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
    border: `1px solid rgba(0,201,167,0.2)`,
    borderRadius: 16, padding: '14px 18px',
    cursor: 'pointer', textAlign: 'left', width: '100%',
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
    border: `1px solid rgba(255,255,255,0.1)`,
    borderRadius: 16, padding: '14px',
    color: 'rgba(255,255,255,0.4)', fontSize: 15,
    fontFamily: FONT, cursor: 'pointer', width: '100%',
  },
};

// ── Card styles ───────────────────────────────────────────────────────────────
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
  dropZoneError: { borderColor: '#ff6060', background: 'rgba(255,80,80,0.05)' },
  dropZoneContent: { display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px' },
  dropZoneIcon: { fontSize: 20, flexShrink: 0 },
  dropZoneText: { fontSize: 13, color: 'rgba(255,255,255,0.28)', fontFamily: FONT },
  imagePreviewRow: { display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '8px 4px' },
  imagePreview: { width: 60, height: 60, objectFit: 'cover', borderRadius: 8, flexShrink: 0, border: `1px solid ${BORDER}` },
  imagePreviewInfo: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 },
  fileName: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontFamily: FONT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  changeLink: { fontSize: 12, color: TEAL, fontFamily: FONT },
  aspectRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  aspectButton: {
    background: 'rgba(0,201,167,0.04)', border: '1.5px solid rgba(0,201,167,0.2)',
    borderRadius: 8, color: 'rgba(255,255,255,0.4)', fontSize: 12,
    fontWeight: 500, padding: '7px 14px', cursor: 'pointer', fontFamily: FONT,
    transition: 'border-color 0.15s, color 0.15s, background 0.15s', letterSpacing: '0.02em',
  },
  aspectButtonActive: { borderColor: TEAL, color: TEAL, background: 'rgba(0,201,167,0.1)' },
};
