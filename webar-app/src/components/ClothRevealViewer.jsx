import { useEffect, useRef, useState, useCallback } from 'react';

// Cloth reveal: the user's photo sits under a cloth that lifts away when
// dragged.
//
// Built as a pre-keyed frame sequence rather than the source video. Scrubbing a
// <video> by assigning currentTime is unreliable on mobile — seeks land on the
// nearest keyframe and stutter — and this has to follow a finger precisely. The
// cloth also needs a real alpha channel to sit *over* the photo, which video
// can't carry portably (Safari/iOS ignores alpha in WebM).
//
// The frames ship as a light grey material, not the black of the source clip.
// Colour is applied at runtime by multiplying the chosen tint over that grey,
// which keeps every fold and shadow. Multiplying onto the original near-black
// cloth turned every colour into mud.
//
// The photo is a plain <img>; only the cloth goes through a canvas. A canvas
// resamples to its backing store, and on a 3x phone that threw away most of the
// photo's detail — the blurriness this first shipped with.
const FONT   = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const TEAL   = "#00C9A7";
const TOTAL  = 75;
const FRAMES_PATH = '/cloth-frames';
const FW = 660;
const FH = 612;
const ASPECT = FW / FH;

// Largest rectangle that fits *inside* the cloth's silhouette on frame 1 —
// measured off the artwork, so the photo is completely hidden before the lift.
const REVEAL = { x: 0.3333, y: 0.5392, w: 0.3030, h: 0.3480 };

// Once the cloth clears, the photo eases up to its final scale. The cloth is a
// dome, so the rectangle that hides completely underneath it is necessarily a
// small part of the frame; left at hiding size the payoff is a thumbnail.
//
// The size control adjusts the *final* scale rather than the starting one, so
// that whatever the user picks the photo still begins perfectly hidden — the
// reveal can't be broken by turning the dial up.
const GROW_FROM  = 0.45;
const GROW_MIN   = 1.15;
const GROW_MAX   = 2.8;
const GROW_DEFAULT = 1.85;
const DRAG_FRACTION = 0.7;

// The clip only has the cloth lifting straight up. Drifting it sideways as it
// rises reads as being pulled off to one side; it is not a true sideways pull
// (that would need footage shot that way) but it is a real change of direction
// rather than a mirrored image.
const DRIFT_MAX = 0.26;
const DIRECTIONS = [
  { id: 'up',    label: 'Up',    sign: 0 },
  { id: 'left',  label: 'Left',  sign: -1 },
  { id: 'right', label: 'Right', sign: 1 },
];

// Tints are multiplied over the grey material, so these read darker than they
// look here — picked so the result lands on the intended colour. The default
// reproduces the black cloth of the original clip.
const COLOURS = [
  { name: 'Black',   hex: '#3A3A3A' },
  { name: 'Crimson', hex: '#C62828' },
  { name: 'Royal',   hex: '#2547D0' },
  { name: 'Emerald', hex: '#0E9F6E' },
  { name: 'Gold',    hex: '#C9A84C' },
  { name: 'Violet',  hex: '#7C3AED' },
];

const framePath = (i) => `${FRAMES_PATH}/frame_${String(i + 1).padStart(4, '0')}.webp`;
const smoothstep = (t) => t * t * (3 - 2 * t);

// Scale of the photo at a given point through the reveal.
function growth(progress, finalScale) {
  const t = Math.max(0, Math.min(1, (progress - GROW_FROM) / (1 - GROW_FROM)));
  return 1 + (finalScale - 1) * smoothstep(t);
}

// Sideways drift of the cloth, as a fraction of frame width. Held at zero until
// the cloth is actually off the ground, so it doesn't slide while still draped.
function drift(progress, sign) {
  if (!sign) return 0;
  const t = Math.max(0, Math.min(1, (progress - 0.25) / 0.75));
  return sign * DRIFT_MAX * smoothstep(t);
}

export function ClothRevealPicker({ onBack }) {
  const [photoUrl, setPhotoUrl] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);

  const pick = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(file); });
  };

  if (photoUrl) return <ClothRevealViewer photoUrl={photoUrl} onBack={onBack} />;

  return (
    <div style={screenStyle}>
      <input ref={inputRef} type="file" accept="image/*" style={{ display:'none' }} onChange={pick} />
      <div style={headerStyle}>
        <button onClick={onBack} style={backBtn}>← Back</button>
        <div style={{ fontSize:18, fontWeight:700, color:'#fff' }}>Cloth Reveal</div>
      </div>
      <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
        padding:'0 28px 40px', textAlign:'center', gap:18 }}>
        <img src={framePath(0)} alt="" style={{ width:'66%', maxWidth:240, opacity:0.85 }} />
        <div style={{ fontSize:14, color:'rgba(255,255,255,0.75)', lineHeight:1.6, maxWidth:340 }}>
          Pick a photo, logo, or product shot. It gets hidden under the cloth —
          drag to pull the cloth away and reveal it.
        </div>
        <button onClick={() => inputRef.current?.click()}
          style={{ background:`linear-gradient(135deg, ${TEAL}, #00E5CC)`, border:'none', borderRadius:50,
            color:'#040D0B', fontSize:15, fontWeight:700, fontFamily:FONT, padding:'14px 34px', cursor:'pointer' }}>
          Choose Photo
        </button>
      </div>
    </div>
  );
}

export default function ClothRevealViewer({ photoUrl, onBack, title = 'Cloth Reveal' }) {
  const clothRef  = useRef(null);
  const photoRef  = useRef(null);
  const photoImg  = useRef(null);
  const framesRef = useRef([]);
  const dragRef   = useRef(null);
  const frameRef  = useRef(0);
  const colourRef = useRef(COLOURS[0].hex);
  const sizeRef   = useRef(GROW_DEFAULT);
  const dirRef    = useRef(0);

  const [colour, setColour]   = useState(COLOURS[0].hex);
  const [photoSize, setPhotoSize] = useState(GROW_DEFAULT);
  const [direction, setDirection] = useState('up');
  const [loaded, setLoaded]   = useState(0);
  const [ready, setReady]     = useState(false);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving]   = useState('');

  useEffect(() => {
    let cancelled = false;
    let done = 0;
    const imgs = [];
    for (let i = 0; i < TOTAL; i++) {
      const img = new Image();
      img.onload = img.onerror = () => {
        if (cancelled) return;
        done += 1;
        setLoaded(done);
        if (done === TOTAL) setReady(true);
      };
      img.src = framePath(i);
      imgs.push(img);
    }
    framesRef.current = imgs;
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!photoUrl) return;
    const img = new Image();
    img.onload = () => { photoImg.current = img; };
    img.src = photoUrl;
  }, [photoUrl]);

  // Paints one frame of cloth, tinted. The multiply pass floods the whole
  // canvas — blending against transparent pixels leaves the source colour — so
  // destination-in afterwards is what re-clips it back to the cloth's shape.
  const paintCloth = useCallback((ctx, index, tint, w, h) => {
    const img = framesRef.current[Math.max(0, Math.min(TOTAL - 1, Math.round(index)))];
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, w, h);
    if (!img || !img.complete || !img.naturalWidth) return;
    ctx.drawImage(img, 0, 0, w, h);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(img, 0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
  }, []);

  // Writes straight to the DOM: a pointermove fires far more often than React
  // should re-render, and only a transform and one canvas change per move.
  const show = useCallback((index) => {
    frameRef.current = index;
    const progress = index / (TOTAL - 1);
    const canvas = clothRef.current;
    if (canvas) {
      paintCloth(canvas.getContext('2d'), index, colourRef.current, FW, FH);
      canvas.style.transform = `translateX(${drift(progress, dirRef.current) * 100}%)`;
    }
    const photo = photoRef.current;
    if (photo) photo.style.transform = `scale(${growth(progress, sizeRef.current)})`;
  }, [paintCloth]);

  useEffect(() => { if (ready) show(frameRef.current); }, [ready, show]);

  const applyColour = (hex) => {
    colourRef.current = hex;
    setColour(hex);
    show(frameRef.current);
  };

  const applySize = (value) => {
    sizeRef.current = value;
    setPhotoSize(value);
    show(frameRef.current);
  };

  const applyDirection = (id) => {
    dirRef.current = DIRECTIONS.find((d) => d.id === id)?.sign ?? 0;
    setDirection(id);
    show(frameRef.current);
  };

  // Deliberately no auto-play — the reveal belongs to the drag.
  const onDown = (e) => {
    if (!ready) return;
    setTouched(true);
    dragRef.current = { x: e.clientX, from: frameRef.current };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    const drag = dragRef.current;
    if (!drag) return;
    const width = e.currentTarget.getBoundingClientRect().width || 1;
    const travel = (e.clientX - drag.x) / (width * DRAG_FRACTION);
    show(Math.max(0, Math.min(TOTAL - 1, drag.from + travel * (TOTAL - 1))));
  };
  const onUp = (e) => {
    dragRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  // ── Export ──────────────────────────────────────────────────────────────
  // Renders the whole reveal offscreen at 2x and records it. Recorded rather
  // than assembled frame-by-frame into a file because there is no encoder in
  // the browser otherwise, and captureStream(0) + requestFrame lets the pace be
  // driven explicitly instead of hoping the display refresh cooperates.
  const drawComposite = useCallback((ctx, index, tint, w, h) => {
    ctx.clearRect(0, 0, w, h);

    const photo = photoImg.current;
    if (photo && photo.naturalWidth) {
      const s = growth(index / (TOTAL - 1), sizeRef.current);
      const rw = REVEAL.w * w, rh = REVEAL.h * h;
      const cx = REVEAL.x * w + rw / 2;
      const bottom = REVEAL.y * h + rh;
      const nw = rw * s, nh = rh * s;
      const nx = cx - nw / 2, ny = bottom - nh;   // grows from its base
      const cover = Math.max(nw / photo.naturalWidth, nh / photo.naturalHeight);
      const dw = photo.naturalWidth * cover, dh = photo.naturalHeight * cover;
      ctx.save();
      ctx.beginPath();
      ctx.rect(nx, ny, nw, nh);
      ctx.clip();
      ctx.drawImage(photo, nx + (nw - dw) / 2, ny + (nh - dh) / 2, dw, dh);
      ctx.restore();
    }

    const cloth = document.createElement('canvas');
    cloth.width = w; cloth.height = h;
    paintCloth(cloth.getContext('2d'), index, tint, w, h);
    // Same sideways drift the on-screen version applies, so the file matches
    // what was set up rather than always exiting straight up.
    ctx.drawImage(cloth, drift(index / (TOTAL - 1), dirRef.current) * w, 0);
  }, [paintCloth]);

  const download = (blob, name) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const handleSave = useCallback(async () => {
    if (!ready || saving) return;
    const w = FW * 2, h = FH * 2;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    const tint = colourRef.current;

    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']
      .find((t) => window.MediaRecorder?.isTypeSupported?.(t));

    // No recorder (older Safari): still give them something — the finished
    // frame as an image beats a button that does nothing.
    if (!mime || !canvas.captureStream) {
      setSaving('image');
      drawComposite(ctx, TOTAL - 1, tint, w, h);
      canvas.toBlob((b) => {
        if (b) download(b, 'cloth-reveal.png');
        setSaving('');
      }, 'image/png');
      return;
    }

    setSaving('video');
    try {
      const stream = canvas.captureStream(0);
      const track = stream.getVideoTracks()[0];
      const chunks = [];
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      const done = new Promise((res) => { rec.onstop = res; });
      rec.start();

      const FPS = 30;
      // A couple of beats on the finished photo so the clip doesn't cut dead
      // on the last frame of movement.
      const HOLD = 18;
      for (let i = 0; i < TOTAL + HOLD; i++) {
        drawComposite(ctx, Math.min(TOTAL - 1, i), tint, w, h);
        track.requestFrame?.();
        await new Promise((r) => setTimeout(r, 1000 / FPS));
      }
      rec.stop();
      await done;
      track.stop();

      const ext = mime.includes('mp4') ? 'mp4' : 'webm';
      download(new Blob(chunks, { type: mime }), `cloth-reveal.${ext}`);
    } catch {
      drawComposite(ctx, TOTAL - 1, tint, w, h);
      canvas.toBlob((b) => { if (b) download(b, 'cloth-reveal.png'); }, 'image/png');
    } finally {
      setSaving('');
    }
  }, [ready, saving, drawComposite]);

  const pct = Math.round((loaded / TOTAL) * 100);

  return (
    <div style={screenStyle}>
      <div style={headerStyle}>
        <button onClick={onBack} style={backBtn}>← Back</button>
        <div style={{ fontSize:18, fontWeight:700, color:'#fff' }}>{title}</div>
      </div>

      <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', alignItems:'center',
        justifyContent:'center', padding:'0 12px 24px', minHeight:0 }}>

        {!ready && <div style={{ color:'rgba(255,255,255,0.6)', fontSize:13 }}>Loading… {pct}%</div>}

        <div style={{ width:'100%', maxWidth:560, display: ready ? 'block' : 'none' }}>
          <div
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
            style={{ position:'relative', width:'100%', aspectRatio:String(ASPECT),
              touchAction:'none', cursor:'grab', userSelect:'none' }}
          >
            <div ref={photoRef} style={{ position:'absolute',
              left:`${REVEAL.x * 100}%`, top:`${REVEAL.y * 100}%`,
              width:`${REVEAL.w * 100}%`, height:`${REVEAL.h * 100}%`,
              overflow:'hidden', transformOrigin:'50% 100%' }}>
              <img src={photoUrl} alt="" draggable={false}
                style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
            </div>

            <canvas ref={clothRef} width={FW} height={FH}
              style={{ position:'absolute', inset:0, width:'100%', height:'100%',
                display:'block', pointerEvents:'none' }} />
          </div>

          <div style={{ textAlign:'center', marginTop:12, minHeight:18, fontSize:12.5,
            color: touched ? 'rgba(255,255,255,0.35)' : TEAL, transition:'color .3s' }}>
            {touched ? 'Drag back and forth to replay' : '← Drag to pull the cloth away →'}
          </div>

          {/* Cloth colour */}
          <div style={{ marginTop:16 }}>
            <div style={labelStyle}>Cloth Colour</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:9, alignItems:'center' }}>
              {COLOURS.map((c) => (
                <button key={c.hex} onClick={() => applyColour(c.hex)} title={c.name}
                  aria-label={c.name}
                  style={{ width:32, height:32, borderRadius:'50%', cursor:'pointer', padding:0,
                    background:c.hex, flexShrink:0,
                    border: colour === c.hex ? `2.5px solid ${TEAL}` : '2px solid rgba(255,255,255,0.2)' }} />
              ))}
              <label style={{ display:'flex', alignItems:'center', gap:7, cursor:'pointer',
                fontSize:11, color:'rgba(255,255,255,0.45)' }}>
                <input type="color" value={colour} onChange={(e) => applyColour(e.target.value)}
                  aria-label="Custom cloth colour"
                  style={{ width:32, height:32, padding:0, border:'none', borderRadius:'50%',
                    background:'none', cursor:'pointer' }} />
                Custom
              </label>
            </div>
          </div>

          {/* Photo size — drives the revealed size only, so the hidden state
              stays perfectly covered no matter where this is set. */}
          <div style={{ marginTop:16 }}>
            <div style={{ ...labelStyle, display:'flex', justifyContent:'space-between' }}>
              <span>Photo Size</span>
              <span style={{ color:TEAL, letterSpacing:0 }}>{photoSize.toFixed(2)}×</span>
            </div>
            <input type="range" min={GROW_MIN} max={GROW_MAX} step="0.05" value={photoSize}
              onChange={(e) => applySize(Number(e.target.value))}
              aria-label="Revealed photo size"
              style={{ width:'100%', accentColor:TEAL, cursor:'pointer' }} />
          </div>

          {/* Cloth exit direction */}
          <div style={{ marginTop:14 }}>
            <div style={labelStyle}>Cloth Pulls</div>
            <div style={{ display:'flex', gap:8 }}>
              {DIRECTIONS.map((d) => (
                <button key={d.id} onClick={() => applyDirection(d.id)}
                  style={{ flex:1, borderRadius:20, padding:'9px 0', fontSize:12, fontWeight:700,
                    fontFamily:FONT, cursor:'pointer',
                    background: direction === d.id ? 'rgba(0,201,167,0.2)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${direction === d.id ? TEAL : 'rgba(255,255,255,0.15)'}`,
                    color: direction === d.id ? TEAL : 'rgba(255,255,255,0.55)' }}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display:'flex', gap:10, justifyContent:'center', marginTop:18, flexWrap:'wrap' }}>
            <button onClick={() => { show(0); setTouched(false); }} style={ghostBtn}>Cover again</button>
            <button onClick={handleSave} disabled={!!saving}
              style={{ ...ghostBtn, background:`linear-gradient(135deg, ${TEAL}, #00E5CC)`,
                border:'none', color:'#040D0B', opacity: saving ? 0.65 : 1,
                cursor: saving ? 'default' : 'pointer' }}>
              {saving === 'video' ? 'Recording…' : saving === 'image' ? 'Saving…' : 'Download animation'}
            </button>
          </div>
          <div style={{ textAlign:'center', fontSize:10.5, color:'rgba(255,255,255,0.3)', marginTop:9 }}>
            Downloads the full reveal as a video, with your photo and cloth colour
          </div>
        </div>
      </div>
    </div>
  );
}

const screenStyle = { position:'fixed', inset:0,
  background:'linear-gradient(160deg,#061A1F 0%,#0A2229 50%,#061820 100%)',
  display:'flex', flexDirection:'column', fontFamily:FONT, overflow:'hidden' };
const headerStyle = { padding:'48px 20px 10px', display:'flex', alignItems:'center', gap:12, flexShrink:0 };
const backBtn = { background:'transparent', border:'1.5px solid rgba(255,255,255,0.2)', borderRadius:20,
  color:'rgba(255,255,255,0.7)', fontSize:13, fontWeight:600, fontFamily:FONT, padding:'7px 16px', cursor:'pointer' };
const ghostBtn = { background:'rgba(0,201,167,0.15)', border:`1px solid ${TEAL}55`, borderRadius:20,
  color:TEAL, fontSize:12.5, fontWeight:700, fontFamily:FONT, padding:'10px 20px', cursor:'pointer' };
const labelStyle = { fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.5)',
  letterSpacing:'0.08em', marginBottom:9, textTransform:'uppercase' };
