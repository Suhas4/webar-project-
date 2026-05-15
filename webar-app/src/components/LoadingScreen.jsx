export default function LoadingScreen({ status, errorMessage, onEdit }) {
  if (status === 'tracking') {
    // Bug 5 fix: edit button must be above the fullscreen video (zIndex 10 > video zIndex 5)
    return (
      <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 10, pointerEvents: 'auto' }}>
        <button onClick={onEdit} style={styles.editButton} title="Edit targets">✏️</button>
      </div>
    );
  }
  if (status === 'idle') return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', zIndex: 10, padding: 24, gap: 24,
      pointerEvents: status === 'error' ? 'auto' : 'none',
    }}>
      {status === 'loading' && <LoadingState />}
      {status === 'ready'   && <ReadyState onEdit={onEdit} />}
      {status === 'error'   && <ErrorState message={errorMessage} onEdit={onEdit} />}
    </div>
  );
}

function LoadingState() {
  return (
    <>
      <Spinner />
      <Card>
        <p style={styles.title}>Loading targets</p>
        <p style={styles.subtitle}>Please wait…</p>
      </Card>
    </>
  );
}

function ReadyState({ onEdit }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'flex-end', height: '100%', paddingBottom: 48, width: '100%',
    }}>
      <div style={{ position: 'absolute', top: 16, right: 16, pointerEvents: 'auto' }}>
        <button onClick={onEdit} style={styles.editButton} title="Edit targets">✏️</button>
      </div>
      <Card>
        <ScanIcon />
        <p style={styles.title}>Ready to Scan</p>
        <p style={styles.subtitle}>Point your camera at the target image</p>
      </Card>
    </div>
  );
}

function ErrorState({ message, onEdit }) {
  return (
    <Card style={{ background: 'rgba(8,12,24,0.92)', borderColor: 'rgba(255,80,80,0.4)', maxWidth: 340 }}>
      <p style={{ ...styles.title, fontSize: 20 }}>⚠️ AR Error</p>
      <p style={{ ...styles.subtitle, color: 'rgba(255,255,255,0.85)', marginBottom: 20, lineHeight: 1.6 }}>
        {message || 'An unexpected error occurred.'}
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        {onEdit && (
          <button onClick={onEdit} style={{ ...styles.reloadButton, background: 'rgba(255,255,255,0.1)', color: '#fff' }}>
            ← Edit Targets
          </button>
        )}
        <button onClick={() => window.location.reload()} style={styles.reloadButton}>
          Reload Page
        </button>
      </div>
    </Card>
  );
}

function Card({ children, style }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
      background: 'rgba(8,12,24,0.85)',
      backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
      border: '1px solid rgba(0,201,167,0.3)',
      borderRadius: 22, padding: '28px 32px', color: '#fff', textAlign: 'center',
      boxShadow: '0 8px 40px rgba(0,201,167,0.15)',
      ...style,
    }}>
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <>
      <style>{`
        @keyframes webar-spin { to { transform: rotate(360deg); } }
        @keyframes webar-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(0,201,167,0.4); }
          50%       { box-shadow: 0 0 0 12px rgba(0,201,167,0); }
        }
      `}</style>
      <div style={{
        width: 52, height: 52,
        border: '3px solid rgba(0,201,167,0.2)',
        borderTopColor: '#00C9A7', borderRadius: '50%',
        animation: 'webar-spin 0.75s linear infinite, webar-pulse 1.5s ease-in-out infinite',
      }} />
    </>
  );
}

function ScanIcon() {
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" fill="none"
      aria-hidden="true" style={{ marginBottom: 4 }}>
      <path d="M8 26 L8 8 L26 8"   stroke="#00C9A7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M46 8 L64 8 L64 26" stroke="#00C9A7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M64 46 L64 64 L46 64" stroke="#00E5CC" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M26 64 L8 64 L8 46"  stroke="#00E5CC" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="36" cy="36" r="3" fill="#00C9A7" opacity="0.8" />
    </svg>
  );
}

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";

const styles = {
  title: { fontSize: 18, fontWeight: 600, fontFamily: FONT, color: '#ffffff', margin: 0, lineHeight: 1.3 },
  subtitle: { fontSize: 14, fontFamily: FONT, color: 'rgba(255,255,255,0.6)', margin: 0, lineHeight: 1.5 },
  reloadButton: {
    background: `linear-gradient(135deg, #00C9A7, #00E5CC)`,
    color: '#080C18', border: 'none', borderRadius: 12,
    padding: '11px 24px', fontSize: 14, fontWeight: 600,
    fontFamily: FONT, cursor: 'pointer', letterSpacing: '0.02em',
  },
  editButton: {
    background: 'rgba(8,12,24,0.8)',
    backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
    border: '1px solid rgba(0,201,167,0.4)',
    borderRadius: 12, color: '#fff', fontSize: 18,
    width: 44, height: 44, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: FONT, boxShadow: '0 4px 16px rgba(0,201,167,0.2)',
  },
};
