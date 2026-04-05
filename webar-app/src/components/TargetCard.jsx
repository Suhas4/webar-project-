import { useRef, useState, useCallback } from 'react';

export default function TargetCard({ index, data, onChange, onRemove, showValidation }) {
  const imageInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const [imageDragOver, setImageDragOver] = useState(false);
  const [videoDragOver, setVideoDragOver] = useState(false);

  const handleImageFile = useCallback((file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Please upload a JPG, PNG, or WebP image.'); return; }
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
    if (file.size > 100 * 1024 * 1024) alert('Video is larger than 100 MB. Please compress it first.');
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
        onClick={() => imageInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setImageDragOver(true); }}
        onDragLeave={() => setImageDragOver(false)}
        onDrop={handleImageDrop}
        role="button" tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && imageInputRef.current?.click()}>
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
            <span style={styles.dropZoneText}>{imageMissing ? 'Image required' : 'Drop image or tap to browse'}</span>
          </div>
        )}
      </div>
      <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp"
        capture="environment" style={{ display: 'none' }}
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
        onClick={() => videoInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setVideoDragOver(true); }}
        onDragLeave={() => setVideoDragOver(false)}
        onDrop={handleVideoDrop}
        role="button" tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && videoInputRef.current?.click()}>
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
            <span style={styles.dropZoneText}>{videoMissing ? 'Video required' : 'Drop video or tap to browse'}</span>
          </div>
        )}
      </div>
      <input ref={videoInputRef} type="file" accept="video/mp4,video/webm"
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
