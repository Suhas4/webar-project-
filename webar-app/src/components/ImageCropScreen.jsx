import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const FONT = '"Outfit", -apple-system, BlinkMacSystemFont, sans-serif';
const TEAL = '#00C9A7';
const MIN_SIZE = 60;
const HANDLE  = 28; // corner handle touch target size

// Checkerboard pattern so a transparent (background-removed) subject is visible
const CHECKER_BG =
  'repeating-conic-gradient(#2a2a2a 0% 25%, #1a1a1a 0% 50%) 50% / 24px 24px';

export default function ImageCropScreen({ imageUrl, onDone, onRetake, onCancel }) {
  const containerRef  = useRef(null);
  const imgRef        = useRef(null);
  const dragRef       = useRef(null);
  const [imgBounds,   setImgBounds]   = useState(null);
  const [crop,        setCrop]        = useState(null);
  const [imgLoaded,   setImgLoaded]   = useState(false);
  const [processing,  setProcessing]  = useState(false);
  const [bgRemoving,  setBgRemoving]  = useState(false);
  const [bgRemoved,   setBgRemoved]   = useState(false);
  const [rotating,    setRotating]    = useState(false);
  const [activeUrl,   setActiveUrl]   = useState(imageUrl);
  const objectUrlRef  = useRef(null); // tracks a blob URL we created, for cleanup

  // Revoke any blob URL we created when the screen unmounts
  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  /* ── Rotate the photo 90° — re-renders the pixels so crop math stays simple ── */
  const rotateBy = useCallback((deg) => {
    if (rotating || processing) return;
    const img = imgRef.current;
    if (!img || !img.naturalWidth) return;
    setRotating(true);

    const rad     = (deg * Math.PI) / 180;
    const swapped = deg === 90 || deg === 270;

    // Cap the working resolution to keep rotation fast, but high enough to
    // not bottleneck the final crop's quality (which now allows up to 2048px).
    const MAX  = 2048;
    const srcW = img.naturalWidth, srcH = img.naturalHeight;
    const scale = Math.min(1, MAX / Math.max(srcW, srcH));
    const w = Math.round(srcW * scale), h = Math.round(srcH * scale);
    const outW = swapped ? h : w;
    const outH = swapped ? w : h;

    const canvas = document.createElement('canvas');
    canvas.width = outW; canvas.height = outH;
    const ctx = canvas.getContext('2d');
    ctx.translate(outW / 2, outH / 2);
    ctx.rotate(rad);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);

    // PNG only when transparency must be preserved (background removed) —
    // JPEG encodes noticeably faster for ordinary photos.
    const mime = bgRemoved ? 'image/png' : 'image/jpeg';
    canvas.toBlob((blob) => {
      setRotating(false);
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = url;
      setImgLoaded(false); // forces computeBounds to re-run for the new dimensions
      setActiveUrl(url);
    }, mime, mime === 'image/jpeg' ? 0.9 : undefined);
  }, [rotating, processing, bgRemoved]);

  const rotateLeft  = () => rotateBy(270);
  const rotateRight = () => rotateBy(90);

  /* ── AI subject selection: removes the background on-device (no server) ── */
  const removeBg = async () => {
    if (bgRemoving || bgRemoved) return;
    setBgRemoving(true);
    try {
      const { removeBackground } = await import('@imgly/background-removal');
      const blob = await removeBackground(activeUrl);
      const url  = URL.createObjectURL(blob);
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = url;
      setImgLoaded(false);   // forces computeBounds to re-run once the new image loads
      setActiveUrl(url);
      setBgRemoved(true);
    } catch (err) {
      alert('Could not remove background. Please try again.');
    } finally {
      setBgRemoving(false);
    }
  };

  // Compute where the image is actually rendered inside the container (object-fit: contain)
  const computeBounds = useCallback(() => {
    const img = imgRef.current;
    const container = containerRef.current;
    if (!img || !container || !img.naturalWidth) return;

    const cRect  = container.getBoundingClientRect();
    const cW = cRect.width;
    const cH = cRect.height;
    const nW = img.naturalWidth;
    const nH = img.naturalHeight;
    const imgRatio = nW / nH;
    const conRatio = cW / cH;

    let dispW, dispH, offX, offY;
    if (imgRatio > conRatio) {
      dispW = cW;  dispH = cW / imgRatio;
      offX  = 0;   offY  = (cH - dispH) / 2;
    } else {
      dispH = cH;  dispW = cH * imgRatio;
      offX  = (cW - dispW) / 2;  offY = 0;
    }

    const bounds = { x: offX, y: offY, w: dispW, h: dispH };
    setImgBounds(bounds);

    // Initialise crop as centred 80% square of the shorter side
    const size = Math.min(dispW, dispH) * 0.8;
    setCrop({
      x: offX + (dispW - size) / 2,
      y: offY + (dispH - size) / 2,
      w: size,
      h: size,
    });
  }, []);

  useEffect(() => {
    if (imgLoaded) computeBounds();
  }, [imgLoaded, computeBounds]);

  // Re-compute if window resizes (orientation change)
  useEffect(() => {
    window.addEventListener('resize', computeBounds);
    return () => window.removeEventListener('resize', computeBounds);
  }, [computeBounds]);

  /* ── Touch handlers ── */

  const onTouchStart = useCallback((e, corner) => {
    e.stopPropagation();
    dragRef.current = {
      corner,
      startX: e.touches[0].clientX,
      startY: e.touches[0].clientY,
      startCrop: { ...crop },
    };
  }, [crop]);

  const onTouchMove = useCallback((e) => {
    if (!dragRef.current || !imgBounds) return;
    e.preventDefault();
    const { corner, startX, startY, startCrop } = dragRef.current;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    const { x: bx, y: by, w: bw, h: bh } = imgBounds;

    setCrop(() => {
      let { x, y, w, h } = startCrop;

      if (corner === 'move') {
        x = Math.max(bx, Math.min(bx + bw - w, x + dx));
        y = Math.max(by, Math.min(by + bh - h, y + dy));
      } else if (corner === 'se') {
        w = Math.max(MIN_SIZE, Math.min(bx + bw - x, w + dx));
        h = Math.max(MIN_SIZE, Math.min(by + bh - y, h + dy));
      } else if (corner === 'sw') {
        const nx = Math.max(bx, Math.min(x + w - MIN_SIZE, x + dx));
        w = x + w - nx; x = nx;
        h = Math.max(MIN_SIZE, Math.min(by + bh - y, h + dy));
      } else if (corner === 'ne') {
        w = Math.max(MIN_SIZE, Math.min(bx + bw - x, w + dx));
        const ny = Math.max(by, Math.min(y + h - MIN_SIZE, y + dy));
        h = y + h - ny; y = ny;
      } else if (corner === 'nw') {
        const nx = Math.max(bx, Math.min(x + w - MIN_SIZE, x + dx));
        w = x + w - nx; x = nx;
        const ny = Math.max(by, Math.min(y + h - MIN_SIZE, y + dy));
        h = y + h - ny; y = ny;
      }

      return { x, y, w, h };
    });
  }, [imgBounds]);

  const onTouchEnd = () => { dragRef.current = null; };

  /* ── Perform the actual crop ── */
  const doCrop = () => {
    if (processing) return;
    const img = imgRef.current;
    if (!img || !imgBounds || !crop) return;

    // Show "Processing…" immediately so the button never looks frozen
    setProcessing(true);

    // Yield one frame so React paints the new button label before heavy work
    requestAnimationFrame(() => setTimeout(() => {
      const scaleX = img.naturalWidth  / imgBounds.w;
      const scaleY = img.naturalHeight / imgBounds.h;

      const sx = (crop.x - imgBounds.x) * scaleX;
      const sy = (crop.y - imgBounds.y) * scaleY;
      const sw = crop.w * scaleX;
      const sh = crop.h * scaleY;

      // Preserve original camera resolution (capped only to avoid pathological
      // multi-thousand-pixel images bloating storage/upload time).
      const MAX   = 2048;
      const ratio = Math.min(1, MAX / Math.max(sw, sh));
      const outW  = Math.round(sw * ratio);
      const outH  = Math.round(sh * ratio);

      const canvas = document.createElement('canvas');
      canvas.width  = outW;
      canvas.height = outH;
      canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);

      // Keep transparency (PNG) when the background was auto-removed; otherwise
      // export a smaller JPEG as before.
      if (bgRemoved) {
        canvas.toBlob((blob) => {
          setProcessing(false);
          if (!blob) return;
          onDone(new File([blob], 'photo.png', { type: 'image/png' }));
        }, 'image/png');
      } else {
        canvas.toBlob((blob) => {
          setProcessing(false);
          if (!blob) return;
          onDone(new File([blob], 'photo.jpg', { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.95);
      }
    }, 0));
  };

  return createPortal(
    <div style={s.screen}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Header */}
      <div style={s.header}>
        <button onClick={onCancel} style={s.headerBtn}>Cancel</button>
        <span style={s.headerTitle}>Crop Photo</span>
        <button onClick={onRetake} style={s.headerBtn}>Retake</button>
      </div>

      {/* Image + crop overlay */}
      <div ref={containerRef} style={s.imageArea}>
        <img
          ref={imgRef}
          src={activeUrl}
          alt="Captured"
          style={{ ...s.img, background: bgRemoved ? CHECKER_BG : 'transparent' }}
          onLoad={() => setImgLoaded(true)}
          draggable={false}
        />

        {crop && imgBounds && (
          <>
            {/* Dark mask — 4 rectangles around the crop box */}
            <div style={{ ...s.mask, left: 0, top: 0, width: '100%', height: crop.y }} />
            <div style={{ ...s.mask, left: 0, top: crop.y + crop.h, width: '100%', bottom: 0, height: `calc(100% - ${crop.y + crop.h}px)` }} />
            <div style={{ ...s.mask, left: 0, top: crop.y, width: crop.x, height: crop.h }} />
            <div style={{ ...s.mask, left: crop.x + crop.w, top: crop.y, right: 0, width: `calc(100% - ${crop.x + crop.w}px)`, height: crop.h }} />

            {/* Crop box border */}
            <div
              style={{
                position: 'absolute',
                left: crop.x, top: crop.y,
                width: crop.w, height: crop.h,
                border: '2px solid rgba(255,255,255,0.9)',
                boxSizing: 'border-box', zIndex: 6,
              }}
              onTouchStart={(e) => onTouchStart(e, 'move')}
            >
              {/* Grid lines */}
              <div style={s.gridH1} /><div style={s.gridH2} />
              <div style={s.gridV1} /><div style={s.gridV2} />
            </div>

            {/* Corner handles */}
            {[
              { corner: 'nw', style: { left: crop.x - HANDLE/2, top: crop.y - HANDLE/2 } },
              { corner: 'ne', style: { left: crop.x + crop.w - HANDLE/2, top: crop.y - HANDLE/2 } },
              { corner: 'sw', style: { left: crop.x - HANDLE/2, top: crop.y + crop.h - HANDLE/2 } },
              { corner: 'se', style: { left: crop.x + crop.w - HANDLE/2, top: crop.y + crop.h - HANDLE/2 } },
            ].map(({ corner, style }) => (
              <div
                key={corner}
                style={{ ...s.handle, ...style }}
                onTouchStart={(e) => onTouchStart(e, corner)}
              >
                <div style={s.handleDot} />
              </div>
            ))}
          </>
        )}
      </div>

      {/* Bottom bar */}
      <div style={s.bottomBar}>
        <p style={s.hint}>Drag corners to resize · Drag inside to move</p>

        <div style={s.rotateRow}>
          <button onClick={rotateLeft}  disabled={rotating || processing} style={{ ...s.rotateBtn, opacity: rotating ? 0.6 : 1 }}>↺ Rotate Left</button>
          <button onClick={rotateRight} disabled={rotating || processing} style={{ ...s.rotateBtn, opacity: rotating ? 0.6 : 1 }}>↻ Rotate Right</button>
        </div>

        <button onClick={removeBg} disabled={bgRemoving || bgRemoved || processing}
          style={{ ...s.bgBtn, opacity: (bgRemoving || bgRemoved) ? 0.75 : 1 }}>
          {bgRemoving ? '✨ Removing background…' : bgRemoved ? '✓ Background removed' : '✨ Auto Remove Background'}
        </button>

        <button onClick={doCrop} disabled={processing}
          style={{ ...s.cropBtn, opacity: processing ? 0.75 : 1 }}>
          {processing ? 'Processing…' : 'Use Photo ✓'}
        </button>
      </div>
    </div>,
    document.body
  );
}

const s = {
  screen: { position: 'fixed', inset: 0, background: '#000', zIndex: 3100, display: 'flex', flexDirection: 'column' },

  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '52px 20px 12px', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', flexShrink: 0, zIndex: 10 },
  headerBtn:   { background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.75)', fontFamily: FONT, fontSize: 14, cursor: 'pointer', padding: '6px 4px' },
  headerTitle: { color: '#fff', fontFamily: FONT, fontSize: 16, fontWeight: 700, letterSpacing: '0.04em' },

  imageArea: { flex: 1, position: 'relative', overflow: 'hidden', touchAction: 'none' },
  img: { width: '100%', height: '100%', objectFit: 'contain', display: 'block', userSelect: 'none', pointerEvents: 'none' },

  mask: { position: 'absolute', background: 'rgba(0,0,0,0.55)', zIndex: 5, pointerEvents: 'none' },

  gridH1: { position: 'absolute', left: 0, right: 0, top: '33.33%',  height: 1, background: 'rgba(255,255,255,0.3)', pointerEvents: 'none' },
  gridH2: { position: 'absolute', left: 0, right: 0, top: '66.66%',  height: 1, background: 'rgba(255,255,255,0.3)', pointerEvents: 'none' },
  gridV1: { position: 'absolute', top: 0, bottom: 0, left: '33.33%', width: 1,  background: 'rgba(255,255,255,0.3)', pointerEvents: 'none' },
  gridV2: { position: 'absolute', top: 0, bottom: 0, left: '66.66%', width: 1,  background: 'rgba(255,255,255,0.3)', pointerEvents: 'none' },

  handle:    { position: 'absolute', width: HANDLE, height: HANDLE, zIndex: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'none' },
  handleDot: { width: 18, height: 18, borderRadius: 4, background: TEAL, boxShadow: `0 0 8px ${TEAL}99` },

  bottomBar: { padding: '14px 20px 44px', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, zIndex: 10 },
  hint:    { fontSize: 11, color: 'rgba(255,255,255,0.45)', fontFamily: FONT, letterSpacing: '0.05em', margin: 0, textAlign: 'center' },
  cropBtn: { width: '100%', maxWidth: 320, background: `linear-gradient(135deg, ${TEAL}, #00E5CC)`, border: 'none', borderRadius: 50, color: '#040D0B', fontSize: 16, fontWeight: 700, fontFamily: FONT, padding: '14px 24px', cursor: 'pointer', letterSpacing: '0.04em', boxShadow: `0 4px 20px rgba(0,201,167,0.4)` },
  bgBtn:   { width: '100%', maxWidth: 320, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(0,201,167,0.4)', borderRadius: 50, color: TEAL, fontSize: 13, fontWeight: 700, fontFamily: FONT, padding: '11px 24px', cursor: 'pointer', letterSpacing: '0.03em' },
  rotateRow: { display: 'flex', gap: 10, width: '100%', maxWidth: 320 },
  rotateBtn: { flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 50, color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: 600, fontFamily: FONT, padding: '10px 14px', cursor: 'pointer', letterSpacing: '0.02em' },
};
