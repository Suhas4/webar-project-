import { useState, useCallback, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import CameraCapture from './CameraCapture.jsx';
import UploadDropZone from './UploadDropZone.jsx';

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const TEAL = '#00C9A7';

// Single step: upload one marker image + pick what type of content attaches
// to it. The moment both are chosen, we hand off immediately to the per-type
// setup screen — no separate "Continue" tap. Title and the final review (both
// the marker image and the attached content shown together) now live on that
// per-type screen instead of here.
export default function ImageUploadScreen({ onSelectContent, onBack, visibility: initialVisibility, initialContentType }) {
  const { colors } = useTheme();
  const { tr } = useLanguage();
  const [imageFile, setImageFile] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);
  const [contentType, setContentType] = useState(initialContentType || null);
  const [showPicker, setShowPicker] = useState(false);
  const [error, setError] = useState('');
  const vis = initialVisibility === 'public' ? 'public' : 'private';

  const CONTENT_TILES = [
    { key: 'video',     img: '/content-icon-add-video.png',     bg: 'linear-gradient(135deg,#6C5CE7,#8F7CF7)', label: tr.videoType },
    { key: 'url',       img: '/content-icon-add-link.png',      bg: 'linear-gradient(135deg,#F368A0,#FF8FBB)', label: tr.wizTileLink },
    { key: '3d',        img: '/content-icon-add-3d-model.png',  bg: 'linear-gradient(135deg,#4CAF7D,#6BCF9A)', label: tr.wizTile3D },
    { key: 'animation', img: '/content-icon-add-animation.png', bg: 'linear-gradient(135deg,#4E9BF5,#6FB6FF)', label: tr.wizTileAnimation },
    { key: 'document',  img: '/content-icon-add-document.png',  bg: 'linear-gradient(135deg,#8D5A34,#B47A4E)', label: tr.wizTileDocument },
  ];

  const handleImageFile = useCallback((file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError(tr.wizErrorImageType); return; }
    if (file.size > 50 * 1024 * 1024) { setError(tr.wizErrorImageSize); return; }
    setError('');
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImageFile(file);
    setImagePreviewUrl(URL.createObjectURL(file));
  }, [imagePreviewUrl, tr]);

  // Auto-advance the instant both the marker image and a content type are
  // set — whichever the user picks second triggers the hand-off, matching
  // the "no need to tap Continue" flow used elsewhere in the app.
  useEffect(() => {
    if (imageFile && contentType) {
      onSelectContent({ imageFile, imagePreviewUrl, label: '', visibility: vis }, contentType);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageFile, contentType]);

  return (
    <div style={{ ...s.screen, background: colors.bg }}>
      {showPicker && (
        <CameraCapture
          onCapture={(file) => { setShowPicker(false); handleImageFile(file); }}
          onClose={() => setShowPicker(false)}
        />
      )}

      <button onClick={onBack} style={{ ...s.backBtn, color: colors.textMuted }}>← {tr.back}</button>

      <div style={s.top}>
        <h1 style={{ ...s.title, color: colors.text }}>{tr.wizTitle}</h1>
      </div>

      <div style={s.stepBody}>
        <p style={{ ...s.subtitle, color: colors.textMuted }}>
          {tr.wizSubtitleContent}
        </p>

        <div style={s.dropZoneWrap}>
          <UploadDropZone
            title={tr.wizTapToUpload}
            hint={tr.wizImageHint}
            error={error && !imageFile ? error : ''}
            preview={imagePreviewUrl}
            fileName={imageFile?.name}
            onClick={() => setShowPicker(true)}
          />
        </div>

        <div style={s.contentSection}>
          <p style={{ ...s.contentTitle, color: colors.text }}>{tr.wizAddContent}</p>
          {error && imageFile && (
            <p style={s.tileError}>⚠ {error}</p>
          )}
          <div style={s.grid}>
            {CONTENT_TILES.map((t) => {
              const selected = contentType === t.key;
              return (
                <button key={t.key} className="ic-tile" onClick={() => { setContentType(t.key); setError(''); }}
                  style={{ ...s.tile, background: colors.surface, border: `1px solid ${selected ? TEAL : colors.border}`,
                    boxShadow: selected ? `0 0 0 2px ${TEAL}55` : 'none' }}>
                  <span style={{ ...s.tileBadge, background: t.bg }}>
                    <img src={t.img} alt="" style={s.tileIcon} />
                  </span>
                  <span style={{ ...s.tileLabel, color: colors.text }}>{t.label}</span>
                </button>
              );
            })}
          </div>
          {!imageFile && contentType && (
            <p style={{ ...s.hintText, color: colors.textMuted }}>Upload a marker image above to continue.</p>
          )}
        </div>
      </div>

      <style>{`
        .ic-tile:not(:disabled):active { transform: scale(0.94); }
      `}</style>
    </div>
  );
}


const s = {
  screen: { position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', fontFamily: FONT, overflowY: 'auto' },
  backBtn: { position: 'fixed', top: 48, left: 16, background: 'transparent', border: 'none', fontSize: 14, fontWeight: 600, fontFamily: FONT, cursor: 'pointer', padding: '6px 4px', zIndex: 2 },
  top: { padding: '96px 24px 0', textAlign: 'center' },
  title: { fontSize: 24, fontWeight: 700, fontFamily: FONT, margin: 0 },
  stepBody: { flex: 1, display: 'flex', flexDirection: 'column' },
  subtitle: { fontSize: 13, fontFamily: FONT, margin: '18px 24px 0', lineHeight: 1.5, textAlign: 'center' },
  dropZoneWrap: { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 40px 8px' },
  contentSection: { padding: '12px 24px 24px', textAlign: 'center' },
  contentTitle: { fontSize: 17, fontWeight: 700, fontFamily: FONT, margin: 0 },
  tileError: { fontSize: 12, fontWeight: 700, fontFamily: FONT, color: '#FF6B6B', margin: '10px 0 0' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 16 },
  tile: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
    borderRadius: 18, padding: '16px 6px', cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s' },
  tileBadge: { width: 44, height: 44, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 4px 12px rgba(0,0,0,0.25)' },
  tileIcon: { width: 24, height: 24, objectFit: 'contain', display: 'block' },
  tileLabel: { fontSize: 11.5, fontWeight: 700, fontFamily: FONT },
  hintText: { fontSize: 12, fontFamily: FONT, margin: '14px 0 0' },
};
