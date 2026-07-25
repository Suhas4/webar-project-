import { useState, useCallback } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import CameraCapture from './CameraCapture.jsx';
import UploadDropZone from './UploadDropZone.jsx';

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const TEAL = '#00C9A7';
const GOLD = '#C9A84C';

// 3-step wizard: (1) upload one marker image + pick what type of content
// attaches to it, (2) name it and choose Private/Public — visibility is
// chosen here, AFTER the content itself, not up front — (3) review + confirm,
// then hand off to the per-type setup screen that does the real compile/upload.
export default function ImageUploadScreen({ onSelectContent, onBack, visibility: initialVisibility }) {
  const { colors } = useTheme();
  const { tr } = useLanguage();
  const [step, setStep] = useState(0);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);
  const [contentType, setContentType] = useState(null);
  const [showPicker, setShowPicker] = useState(false);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [vis, setVis] = useState(initialVisibility === 'public' ? 'public' : 'private');

  const CONTENT_TILES = [
    { key: 'video',     icon: '🎬', bg: 'linear-gradient(135deg,#6C5CE7,#8F7CF7)', label: tr.videoType },
    { key: 'url',       icon: '🔗', bg: 'linear-gradient(135deg,#F368A0,#FF8FBB)', label: tr.wizTileLink },
    { key: '3d',        icon: '🧊', bg: 'linear-gradient(135deg,#4CAF7D,#6BCF9A)', label: tr.wizTile3D },
    { key: 'animation', icon: '🎞️', bg: 'linear-gradient(135deg,#4E9BF5,#6FB6FF)', label: tr.wizTileAnimation },
    { key: 'document',  icon: '📄', bg: 'linear-gradient(135deg,#8D5A34,#B47A4E)', label: tr.wizTileDocument },
  ];
  const STEPS = [
    { key: 'content', label: tr.wizStepContent },
    { key: 'details', label: tr.wizStepDetails },
    { key: 'review',  label: tr.wizStepReview },
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

  const goNext = useCallback(() => {
    if (step === 0) {
      if (!imageFile) { setError(tr.wizErrorImageRequired); return; }
      if (!contentType) { setError(tr.wizErrorContentRequired); return; }
    }
    setError('');
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }, [step, imageFile, contentType, tr]);

  const goBack = useCallback(() => {
    if (step === 0) { onBack?.(); return; }
    setStep((s) => s - 1);
  }, [step, onBack]);

  const handleConfirm = useCallback(() => {
    onSelectContent({ imageFile, imagePreviewUrl, label: title.trim(), visibility: vis }, contentType);
  }, [imageFile, imagePreviewUrl, title, vis, contentType, onSelectContent]);

  const tile = CONTENT_TILES.find((t) => t.key === contentType);

  return (
    <div style={{ ...s.screen, background: colors.bg }}>
      {showPicker && (
        <CameraCapture
          onCapture={(file) => { setShowPicker(false); handleImageFile(file); }}
          onClose={() => setShowPicker(false)}
        />
      )}

      <button onClick={goBack} style={{ ...s.backBtn, color: colors.textMuted }}>← {tr.back}</button>

      <div style={s.top}>
        <h1 style={{ ...s.title, color: colors.text }}>{tr.wizTitle}</h1>
        <Stepper step={step} colors={colors} steps={STEPS} />
      </div>

      {step === 0 && (
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
                    <span style={{ ...s.tileBadge, background: t.bg }}>{t.icon}</span>
                    <span style={{ ...s.tileLabel, color: colors.text }}>{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {step === 1 && (
        <div style={s.stepBody}>
          <p style={{ ...s.subtitle, color: colors.textMuted }}>{tr.wizSubtitleDetails}</p>

          <div style={s.detailsCard}>
            <p style={{ ...s.fieldLabel, color: colors.textMuted }}>{tr.wizTitleField}</p>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={tr.wizTitlePlaceholder}
              maxLength={60}
              style={{ ...s.input, background: colors.inputBg, border: `1px solid ${colors.inputBorder}`, color: colors.text }}
            />

            <p style={{ ...s.fieldLabel, color: colors.textMuted, marginTop: 22 }}>{tr.wizVisibility}</p>
            <div style={{ ...s.visRow, background: colors.inputBg, border: `1px solid ${colors.inputBorder}` }}>
              <button
                onClick={() => setVis('private')}
                style={{ ...s.visBtn, background: vis === 'private' ? `${GOLD}22` : 'transparent',
                  color: vis === 'private' ? GOLD : colors.textMuted, fontWeight: vis === 'private' ? 700 : 600 }}>
                🔒 {tr.privateLabel}
              </button>
              <button
                onClick={() => setVis('public')}
                style={{ ...s.visBtn, background: vis === 'public' ? `${TEAL}22` : 'transparent',
                  color: vis === 'public' ? TEAL : colors.textMuted, fontWeight: vis === 'public' ? 700 : 600 }}>
                🌐 {tr.publicLabel}
              </button>
            </div>
            <p style={{ ...s.visHint, color: colors.textMuted }}>
              {vis === 'public' ? tr.wizPublicHint : tr.wizPrivateHint}
            </p>
          </div>
        </div>
      )}

      {step === 2 && (
        <div style={s.stepBody}>
          <p style={{ ...s.subtitle, color: colors.textMuted }}>{tr.wizSubtitleReview}</p>

          <div style={{ ...s.reviewCard, background: colors.surface, border: `1px solid ${colors.border}` }}>
            {imagePreviewUrl && <img src={imagePreviewUrl} alt="" style={s.reviewImg} />}
            <div style={s.reviewRow}>
              <span style={{ ...s.reviewKey, color: colors.textMuted }}>{tr.wizContentType}</span>
              <span style={{ ...s.reviewVal, color: colors.text }}>{tile ? `${tile.icon} ${tile.label}` : '—'}</span>
            </div>
            <div style={s.reviewRow}>
              <span style={{ ...s.reviewKey, color: colors.textMuted }}>{tr.wizReviewTitle}</span>
              <span style={{ ...s.reviewVal, color: colors.text }}>{title.trim() || tr.wizUntitled}</span>
            </div>
            <div style={s.reviewRow}>
              <span style={{ ...s.reviewKey, color: colors.textMuted }}>{tr.visibility}</span>
              <span style={{ ...s.reviewVal, color: vis === 'public' ? TEAL : GOLD, fontWeight: 700 }}>
                {vis === 'public' ? `🌐 ${tr.publicLabel}` : `🔒 ${tr.privateLabel}`}
              </span>
            </div>
          </div>
        </div>
      )}

      <div style={s.bottom}>
        {step < 2 ? (
          <button onClick={goNext} className="ic-cta" style={s.ctaBtn}>{tr.wizContinue} →</button>
        ) : (
          <button onClick={handleConfirm} className="ic-cta" style={s.ctaBtn}>{tr.wizContinueToSetup} →</button>
        )}
      </div>

      <style>{`
        .ic-tile:not(:disabled):active { transform: scale(0.94); }
        .ic-cta { transition: transform 0.15s ease; }
        .ic-cta:active { transform: scale(0.97); }
      `}</style>
    </div>
  );
}

function Stepper({ step, colors, steps }) {
  return (
    <div style={s.stepper}>
      {steps.map((st, i) => (
        <div key={st.key} style={s.stepUnit}>
          <div style={{
            ...s.orb,
            background: i <= step ? TEAL : colors.inputBg,
            color: i <= step ? '#04211d' : colors.textMuted,
            border: `1px solid ${i <= step ? TEAL : colors.border}`,
          }}>
            {i < step ? '✓' : i + 1}
          </div>
          <span style={{ ...s.stepLabel, color: i <= step ? colors.text : colors.textMuted }}>{st.label}</span>
          {i < steps.length - 1 && (
            <div style={{ ...s.rail, background: i < step ? TEAL : colors.border }} />
          )}
        </div>
      ))}
    </div>
  );
}

const s = {
  screen: { position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', fontFamily: FONT, overflowY: 'auto' },
  backBtn: { position: 'absolute', top: 48, left: 16, background: 'transparent', border: 'none', fontSize: 14, fontWeight: 600, fontFamily: FONT, cursor: 'pointer', padding: '6px 4px', zIndex: 2 },
  top: { padding: '60px 24px 0', textAlign: 'center' },
  title: { fontSize: 24, fontWeight: 700, fontFamily: FONT, margin: 0 },
  stepper: { display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: 0, marginTop: 20 },
  stepUnit: { display: 'flex', alignItems: 'center', flex: '0 0 auto', position: 'relative' },
  orb: { width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, fontWeight: 700, fontFamily: FONT, flexShrink: 0 },
  stepLabel: { fontSize: 11, fontWeight: 600, fontFamily: FONT, marginLeft: 6, marginRight: 6, whiteSpace: 'nowrap' },
  rail: { width: 24, height: 2, borderRadius: 1, flexShrink: 0 },
  stepBody: { flex: 1, display: 'flex', flexDirection: 'column' },
  subtitle: { fontSize: 13, fontFamily: FONT, margin: '18px 24px 0', lineHeight: 1.5, textAlign: 'center' },
  dropZoneWrap: { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 40px 8px' },
  contentSection: { padding: '12px 24px 24px', textAlign: 'center' },
  contentTitle: { fontSize: 17, fontWeight: 700, fontFamily: FONT, margin: 0 },
  tileError: { fontSize: 12, fontWeight: 700, fontFamily: FONT, color: '#FF6B6B', margin: '10px 0 0' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 16 },
  tile: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
    borderRadius: 18, padding: '16px 6px', cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s' },
  tileBadge: { width: 44, height: 44, borderRadius: 14, fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 4px 12px rgba(0,0,0,0.25)' },
  tileLabel: { fontSize: 11.5, fontWeight: 700, fontFamily: FONT },
  detailsCard: { margin: '20px 24px 0', padding: '20px 20px 8px' },
  fieldLabel: { fontSize: 11, fontWeight: 700, fontFamily: FONT, letterSpacing: '0.08em', margin: '0 0 8px' },
  input: { width: '100%', boxSizing: 'border-box', borderRadius: 12, padding: '14px 16px', fontSize: 15,
    fontFamily: FONT, outline: 'none' },
  visRow: { display: 'flex', borderRadius: 14, overflow: 'hidden', padding: 4, gap: 4 },
  visBtn: { flex: 1, border: 'none', background: 'transparent', borderRadius: 10, padding: '12px 8px',
    fontSize: 14, fontFamily: FONT, cursor: 'pointer' },
  visHint: { fontSize: 12, fontFamily: FONT, margin: '10px 2px 0', lineHeight: 1.4 },
  reviewCard: { margin: '20px 24px 0', borderRadius: 18, padding: 18 },
  reviewImg: { width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 12, marginBottom: 14 },
  reviewRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderTop: '1px solid rgba(128,128,128,0.15)' },
  reviewKey: { fontSize: 13, fontFamily: FONT },
  reviewVal: { fontSize: 13, fontFamily: FONT, fontWeight: 600 },
  bottom: { padding: '20px 24px 40px' },
  ctaBtn: { width: '100%', background: TEAL, border: 'none', borderRadius: 50,
    color: '#04211d', fontSize: 16, fontWeight: 700, fontFamily: FONT,
    padding: '16px', cursor: 'pointer', letterSpacing: '0.03em' },
};
