// Shared "Tap to upload" drop zone — a single, prominent square card (cloud
// icon + title + accepted-format hint) reused across every upload flow
// (photo+video, 3D model, animation, document) instead of each screen
// rolling its own small drop-zone markup.
const TEAL = '#00C9A7';
const CARD_BG = '#0E3833';
const FONT = '"Outfit", -apple-system, BlinkMacSystemFont, sans-serif';

export default function UploadDropZone({
  title = 'Tap to upload',
  hint,
  error,
  dragOver,
  preview,
  fileName,
  fileMeta,
  onClick,
  onDragOver,
  onDragLeave,
  onDrop,
}) {
  return (
    <div
      style={{
        ...s.zone,
        ...(dragOver ? s.zoneActive : {}),
        ...(error ? s.zoneError : {}),
      }}
      onClick={onClick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      role="button" tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
    >
      {preview ? (
        <div style={s.previewWrap}>
          {typeof preview === 'string'
            ? <img src={preview} alt="" style={s.previewImg} />
            : preview}
          <span style={s.fileName}>{fileName}</span>
          {fileMeta && <span style={s.fileMeta}>{fileMeta}</span>}
          <span style={s.changeLink}>Tap to change</span>
        </div>
      ) : (
        <>
          <CloudUploadIcon />
          <span style={s.title}>{error || title}</span>
          {hint && <span style={s.hint}>{hint}</span>}
        </>
      )}
    </div>
  );
}

function CloudUploadIcon() {
  return (
    <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke={TEAL} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 18a4.5 4.5 0 0 1-1-8.9 5.5 5.5 0 0 1 10.7-2A4.5 4.5 0 0 1 17 18H7Z" />
      <path d="M12 20v-8M9 15l3-3 3 3" />
    </svg>
  );
}

const s = {
  zone: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: 10, background: CARD_BG, border: `2px dashed ${TEAL}`, borderRadius: 20,
    padding: '32px 20px', cursor: 'pointer', textAlign: 'center',
    transition: 'border-color 0.2s, background 0.2s',
  },
  zoneActive: { borderColor: '#00E5CC', background: '#124A44' },
  zoneError: { borderColor: '#FF6B6B' },
  title: { fontSize: 19, fontWeight: 700, color: '#ffffff', fontFamily: FONT, marginTop: 4 },
  hint: { fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.65)', fontFamily: FONT },
  previewWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: '100%' },
  previewImg: { width: 84, height: 84, objectFit: 'cover', borderRadius: 12, border: `1px solid ${TEAL}` },
  fileName: { fontSize: 13, color: 'rgba(255,255,255,0.85)', fontFamily: FONT, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  fileMeta: { fontSize: 11, color: 'rgba(255,255,255,0.5)', fontFamily: FONT },
  changeLink: { fontSize: 12, color: TEAL, fontFamily: FONT, fontWeight: 600, marginTop: 2 },
};
