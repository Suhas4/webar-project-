const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const TEAL = "#00C9A7";

// Shown for document formats with no in-browser renderer (PSD/CDR) — the
// server-generated thumbnail lets the user confirm it's the right file
// before they commit to opening/downloading the original.
export default function DocumentPreviewOverlay({ previewUrl, fileName, onOpen, onClose }) {
  return (
    <div style={{ position:'fixed', inset:0, zIndex:9999, background:'#040D0B',
      display:'flex', flexDirection:'column' }}>
      <img
        src={previewUrl}
        alt={fileName || 'Document preview'}
        style={{ flex:1, width:'100%', objectFit:'contain', display:'block', minHeight:0 }}
      />
      <div style={{ padding:'16px 20px 28px', display:'flex', flexDirection:'column', gap:12,
        background:'rgba(0,0,0,0.35)' }}>
        {fileName && (
          <p style={{ color:'#fff', fontFamily:FONT, fontSize:14, textAlign:'center', margin:0,
            wordBreak:'break-word' }}>{fileName}</p>
        )}
        <div style={{ display:'flex', gap:12 }}>
          <button onClick={onClose} style={{ flex:1, background:'transparent', border:'1px solid rgba(255,255,255,0.3)',
            borderRadius:50, color:'#fff', fontFamily:FONT, fontSize:14, fontWeight:600, padding:'12px 0', cursor:'pointer' }}>
            Cancel
          </button>
          <button onClick={onOpen} style={{ flex:1, background:TEAL, border:'none', borderRadius:50,
            color:'#040D0B', fontFamily:FONT, fontSize:14, fontWeight:700, padding:'12px 0', cursor:'pointer' }}>
            Open / Download
          </button>
        </div>
      </div>
    </div>
  );
}
