import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

const FONT = '"Outfit", -apple-system, BlinkMacSystemFont, sans-serif';
const TEAL = '#00C9A7';

// 14 filters — each has CSS filter values + an optional extra (sepia/hue-rotate/grayscale)
const FILTERS = [
  { name: 'Normal',    b: 100, c: 100, sat: 100, extra: '' },
  { name: 'Vivid',     b: 108, c: 120, sat: 150, extra: '' },
  { name: 'Cool',      b: 100, c: 110, sat: 70,  extra: 'hue-rotate(20deg)' },
  { name: 'Warm',      b: 110, c: 105, sat: 130, extra: 'hue-rotate(-20deg)' },
  { name: 'Drama',     b: 88,  c: 150, sat: 65,  extra: '' },
  { name: 'Fade',      b: 118, c: 82,  sat: 65,  extra: '' },
  { name: 'B&W',       b: 100, c: 120, sat: 0,   extra: '' },
  { name: 'Sepia',     b: 105, c: 110, sat: 0,   extra: 'sepia(80%)' },
  { name: 'Vintage',   b: 105, c: 90,  sat: 80,  extra: 'sepia(40%) hue-rotate(-10deg)' },
  { name: 'Bright',    b: 140, c: 100, sat: 110, extra: '' },
  { name: 'Cinematic', b: 85,  c: 140, sat: 80,  extra: 'hue-rotate(5deg)' },
  { name: 'Summer',    b: 115, c: 110, sat: 160, extra: 'hue-rotate(-15deg)' },
  { name: 'Night',     b: 70,  c: 130, sat: 60,  extra: 'hue-rotate(15deg)' },
  { name: 'Pastel',    b: 125, c: 85,  sat: 75,  extra: '' },
];

// Fixed gradient used to render filter swatch previews
const SWATCH_BG = 'linear-gradient(135deg,#e95b5b 0%,#f5a623 25%,#7ed321 50%,#4990e2 75%,#bd10e0 100%)';

const SPEEDS = [0.25, 0.5, 1, 1.5, 2];
function speedLabel(sp) {
  if (sp === 0.25) return '¼× Slo-Mo';
  if (sp === 0.5)  return '½× Slow';
  if (sp === 1)    return '1× Normal';
  if (sp === 1.5)  return '1.5×';
  return '2× Fast';
}

function fmt(s) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

export default function VideoEditorScreen({ videoFile, onDone, onCancel }) {
  const videoRef    = useRef(null);
  const bgAudioRef  = useRef(null); // decoded AudioBuffer for background music

  const [srcUrl,      setSrcUrl]      = useState('');
  const [duration,    setDuration]    = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing,     setPlaying]     = useState(false);
  const [trimStart,   setTrimStart]   = useState(0);
  const [trimEnd,     setTrimEnd]     = useState(0);
  const [speed,       setSpeed]       = useState(1);
  const [brightness,  setBrightness]  = useState(100);
  const [contrast,    setContrast]    = useState(100);
  const [saturation,  setSaturation]  = useState(100);
  const [filterExtra, setFilterExtra] = useState('');
  const [rotation,    setRotation]    = useState(0); // 0 | 90 | 180 | 270 (clockwise)
  const [muted,       setMuted]       = useState(false);
  const [bgMusicName, setBgMusicName] = useState('');
  const [bgMusicVol,  setBgMusicVol]  = useState(100);
  const [exporting,   setExporting]   = useState(false);
  const [exportPct,   setExportPct]   = useState(0);

  const filterStr = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)${filterExtra ? ' ' + filterExtra : ''}`;

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
    v.onloadedmetadata = () => {
      setDuration(v.duration);
      setTrimEnd(v.duration);
    };
  }, [srcUrl]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed;
  }, [speed]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    setCurrentTime(v.currentTime);
    if (v.currentTime >= trimEnd) {
      v.pause(); setPlaying(false);
      v.currentTime = trimStart;
    }
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      if (v.currentTime < trimStart || v.currentTime >= trimEnd) v.currentTime = trimStart;
      v.play(); setPlaying(true);
    } else {
      v.pause(); setPlaying(false);
    }
  };

  const applyFilter = (f) => {
    setBrightness(f.b);
    setContrast(f.c);
    setSaturation(f.sat);
    setFilterExtra(f.extra || '');
  };

  const rotateLeft  = () => setRotation(r => (r + 270) % 360);
  const rotateRight = () => setRotation(r => (r + 90)  % 360);

  const isFilterActive = (f) =>
    brightness === f.b && contrast === f.c &&
    saturation === f.sat && filterExtra === (f.extra || '');

  // Background music picker
  const handleBgMusicFile = useCallback(async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBgMusicName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const tmpCtx = new AudioContext();
      bgAudioRef.current = await tmpCtx.decodeAudioData(buf);
      await tmpCtx.close();
    } catch {
      bgAudioRef.current = null;
      setBgMusicName('');
    }
  }, []);

  const removeBgMusic = () => {
    setBgMusicName('');
    bgAudioRef.current = null;
  };

  // Export: skip re-encoding if nothing changed
  const handleDone = useCallback(async () => {
    const hasBgMusic = !!bgAudioRef.current;
    const noEdits =
      brightness === 100 && contrast === 100 && saturation === 100 &&
      filterExtra === '' && speed === 1 && rotation === 0 &&
      trimStart < 0.05 && Math.abs(trimEnd - duration) < 0.1 &&
      !hasBgMusic;

    if (noEdits) { onDone(videoFile); return; }

    setExporting(true);
    setExportPct(0);
    const video = videoRef.current;
    if (!video) return;

    video.pause(); setPlaying(false);
    video.currentTime = trimStart;
    video.playbackRate = speed;

    const W = video.videoWidth  || 640;
    const H = video.videoHeight || 360;
    const swapped = rotation === 90 || rotation === 270;
    const outW = swapped ? H : W;
    const outH = swapped ? W : H;
    const canvas = document.createElement('canvas');
    canvas.width = outW; canvas.height = outH;
    const ctx = canvas.getContext('2d');
    const rotRad = rotation * Math.PI / 180;

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9' : 'video/webm';

    // Build media stream: canvas video + optional bg music audio track
    let stream;
    let audioCtx = null;
    let audioSource = null;

    if (hasBgMusic && bgAudioRef.current) {
      audioCtx   = new AudioContext();
      const dest = audioCtx.createMediaStreamDestination();
      const gain  = audioCtx.createGain();
      gain.gain.value = bgMusicVol / 100;
      audioSource = audioCtx.createBufferSource();
      audioSource.buffer = bgAudioRef.current;
      audioSource.loop   = true;
      audioSource.connect(gain);
      gain.connect(dest);
      audioSource.start(0);
      stream = new MediaStream([
        ...canvas.captureStream(30).getVideoTracks(),
        ...dest.stream.getAudioTracks(),
      ]);
    } else {
      stream = canvas.captureStream(30);
    }

    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4_000_000 });
    const chunks   = [];

    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => {
      if (audioCtx) { try { audioSource?.stop(); audioCtx.close(); } catch {} }
      const blob = new Blob(chunks, { type: mimeType });
      const file = new File([blob], `edited-${Date.now()}.webm`, { type: mimeType });
      setExporting(false);
      onDone(file);
    };

    const clipLen = (trimEnd - trimStart) / speed;
    const started = performance.now();

    const drawLoop = () => {
      if (video.currentTime >= trimEnd - 0.05 || video.ended) {
        recorder.stop(); return;
      }
      ctx.save();
      ctx.translate(outW / 2, outH / 2);
      ctx.rotate(rotRad);
      ctx.filter = filterStr;
      ctx.drawImage(video, -W / 2, -H / 2, W, H);
      ctx.restore();
      const elapsed = (performance.now() - started) / 1000;
      setExportPct(Math.min(99, Math.round((elapsed / clipLen) * 100)));
      requestAnimationFrame(drawLoop);
    };

    recorder.start(100);
    video.play().then(() => requestAnimationFrame(drawLoop)).catch(() => {
      if (audioCtx) { try { audioSource?.stop(); audioCtx.close(); } catch {} }
      recorder.stop();
      setExporting(false);
      onDone(videoFile);
    });
  }, [trimStart, trimEnd, duration, speed, rotation, brightness, contrast, saturation, filterExtra, bgMusicVol, filterStr, onDone, videoFile]);

  return createPortal(
    <div style={s.screen}>

      {/* Header */}
      <div style={s.header}>
        <button onClick={onCancel} style={s.cancelBtn}>✕</button>
        <span style={s.title}>Edit Video</span>
        <button onClick={handleDone} disabled={exporting} style={s.doneBtn}>
          {exporting ? `${exportPct}%` : 'Use ✓'}
        </button>
      </div>

      {/* Video preview */}
      <div style={s.previewWrap} onClick={togglePlay}>
        <video ref={videoRef}
          style={{ ...s.video, filter: filterStr, transform: `rotate(${rotation}deg)` }}
          playsInline webkit-playsinline onTimeUpdate={handleTimeUpdate} />
        {!playing && !exporting && <div style={s.playCircle}>▶</div>}
      </div>

      {/* Seek bar */}
      <div style={s.seekRow}>
        <span style={s.timeLabel}>{fmt(currentTime)}</span>
        <input type="range" min={0} max={duration || 1} step={0.05} value={currentTime}
          style={s.rangeInput}
          onChange={e => {
            const t = parseFloat(e.target.value);
            if (videoRef.current) videoRef.current.currentTime = t;
            setCurrentTime(t);
          }} />
        <span style={s.timeLabel}>{fmt(duration)}</span>
      </div>

      {/* Scrollable controls */}
      <div style={s.controls}>

        {/* ── Speed + Slow Motion ─────────────────────────────────────── */}
        <div style={s.section}>
          <p style={s.sectionLabel}>SPEED / SLOW MOTION</p>
          <div style={s.chipRow}>
            {SPEEDS.map(sp => (
              <button key={sp} onClick={() => setSpeed(sp)}
                style={{ ...s.chip, ...(speed === sp ? s.chipActive : {}) }}>
                {speedLabel(sp)}
              </button>
            ))}
          </div>
        </div>

        {/* ── Rotation ────────────────────────────────────────────────── */}
        <div style={s.section}>
          <div style={s.labelRow}>
            <p style={s.sectionLabel}>ROTATION <span style={s.sectionHint}>{rotation}°</span></p>
            {rotation !== 0 && <button onClick={() => setRotation(0)} style={s.resetBtn}>Reset</button>}
          </div>
          <div style={s.chipRow}>
            <button onClick={rotateLeft}  style={s.chip}>↺ Rotate Left</button>
            <button onClick={rotateRight} style={s.chip}>↻ Rotate Right</button>
            {[0, 90, 180, 270].map(deg => (
              <button key={deg} onClick={() => setRotation(deg)}
                style={{ ...s.chip, ...(rotation === deg ? s.chipActive : {}) }}>
                {deg}°
              </button>
            ))}
          </div>
        </div>

        {/* ── Trim ────────────────────────────────────────────────────── */}
        <div style={s.section}>
          <p style={s.sectionLabel}>
            TRIM &nbsp;
            <span style={s.sectionHint}>{fmt(trimStart)} → {fmt(trimEnd)} &nbsp;({fmt(trimEnd - trimStart)})</span>
          </p>
          <div style={s.trimRow}>
            <span style={s.timeLabel}>▸ {fmt(trimStart)}</span>
            <input type="range" min={0} max={duration || 1} step={0.1} value={trimStart}
              style={s.rangeInput}
              onChange={e => { const v = parseFloat(e.target.value); if (v < trimEnd - 0.5) setTrimStart(v); }} />
          </div>
          <div style={s.trimRow}>
            <span style={s.timeLabel}>■ {fmt(trimEnd)}</span>
            <input type="range" min={0} max={duration || 1} step={0.1} value={trimEnd}
              style={s.rangeInput}
              onChange={e => { const v = parseFloat(e.target.value); if (v > trimStart + 0.5) setTrimEnd(v); }} />
          </div>
        </div>

        {/* ── Filters with colour swatch previews ─────────────────────── */}
        <div style={s.section}>
          <p style={s.sectionLabel}>FILTERS</p>
          <div style={s.filterScroll}>
            {FILTERS.map(f => (
              <button key={f.name} onClick={() => applyFilter(f)} style={s.filterChipWrap}>
                <div style={{
                  ...s.filterSwatch,
                  background: SWATCH_BG,
                  filter: `brightness(${f.b}%) contrast(${f.c}%) saturate(${f.sat}%)${f.extra ? ' ' + f.extra : ''}`,
                  border: isFilterActive(f) ? `2.5px solid ${TEAL}` : '2.5px solid transparent',
                  boxShadow: isFilterActive(f) ? `0 0 8px ${TEAL}88` : 'none',
                }} />
                <span style={{
                  ...s.filterLabel,
                  color: isFilterActive(f) ? TEAL : 'rgba(255,255,255,0.55)',
                }}>
                  {f.name}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Audio ───────────────────────────────────────────────────── */}
        <div style={s.section}>
          <p style={s.sectionLabel}>AUDIO</p>
          <div style={s.chipRow}>
            <button onClick={() => setMuted(false)}
              style={{ ...s.chip, ...(!muted ? s.chipActive : {}) }}>
              🔊 Sound On
            </button>
            <button onClick={() => setMuted(true)}
              style={{ ...s.chip, ...(muted ? s.chipActive : {}) }}>
              🔇 Muted
            </button>
          </div>
        </div>

        {/* ── Background Music ────────────────────────────────────────── */}
        <div style={s.section}>
          <p style={s.sectionLabel}>BACKGROUND MUSIC</p>
          {bgMusicName ? (
            <>
              <div style={s.bgMusicRow}>
                <span style={{ fontSize: 18 }}>🎵</span>
                <span style={s.bgMusicName}>{bgMusicName}</span>
                <button onClick={removeBgMusic} style={s.bgMusicRemove}>✕</button>
              </div>
              <div style={{ marginTop: 12 }}>
                <div style={s.labelRow}>
                  <p style={s.sectionLabel}>VOLUME <span style={s.sectionHint}>{bgMusicVol}%</span></p>
                  <button onClick={() => setBgMusicVol(100)} style={s.resetBtn}>Reset</button>
                </div>
                <input type="range" min={0} max={200} step={1} value={bgMusicVol}
                  style={s.rangeInput} onChange={e => setBgMusicVol(Number(e.target.value))} />
              </div>
            </>
          ) : (
            <label style={s.bgMusicPickBtn}>
              <input type="file" accept="audio/*" style={{ display: 'none' }} onChange={handleBgMusicFile} />
              <span style={{ fontSize: 20 }}>🎵</span>
              <div>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', fontFamily: FONT, margin: 0, fontWeight: 600 }}>
                  Choose Music / Song
                </p>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: FONT, margin: '2px 0 0' }}>
                  MP3, M4A, AAC, WAV — replaces original audio
                </p>
              </div>
            </label>
          )}
        </div>

        {/* ── Brightness ──────────────────────────────────────────────── */}
        <div style={s.section}>
          <div style={s.labelRow}>
            <p style={s.sectionLabel}>BRIGHTNESS <span style={s.sectionHint}>{brightness}%</span></p>
            <button onClick={() => setBrightness(100)} style={s.resetBtn}>Reset</button>
          </div>
          <input type="range" min={50} max={200} step={1} value={brightness}
            style={s.rangeInput} onChange={e => setBrightness(Number(e.target.value))} />
        </div>

        {/* ── Contrast ────────────────────────────────────────────────── */}
        <div style={s.section}>
          <div style={s.labelRow}>
            <p style={s.sectionLabel}>CONTRAST <span style={s.sectionHint}>{contrast}%</span></p>
            <button onClick={() => setContrast(100)} style={s.resetBtn}>Reset</button>
          </div>
          <input type="range" min={50} max={200} step={1} value={contrast}
            style={s.rangeInput} onChange={e => setContrast(Number(e.target.value))} />
        </div>

        {/* ── Saturation ──────────────────────────────────────────────── */}
        <div style={s.section}>
          <div style={s.labelRow}>
            <p style={s.sectionLabel}>COLOR <span style={s.sectionHint}>{saturation}%</span></p>
            <button onClick={() => setSaturation(100)} style={s.resetBtn}>Reset</button>
          </div>
          <input type="range" min={0} max={200} step={1} value={saturation}
            style={s.rangeInput} onChange={e => setSaturation(Number(e.target.value))} />
        </div>

      </div>

      {/* Export overlay */}
      {exporting && (
        <div style={s.exportOverlay}>
          <div style={s.exportCard}>
            <div style={s.progressRing}>
              <svg width="72" height="72" viewBox="0 0 72 72">
                <circle cx="36" cy="36" r="30" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="5"/>
                <circle cx="36" cy="36" r="30" fill="none" stroke={TEAL} strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 30 * exportPct / 100} ${2 * Math.PI * 30}`}
                  style={{ transformOrigin:'center', transform:'rotate(-90deg)', transition:'stroke-dasharray 0.3s' }} />
              </svg>
              <span style={s.pctText}>{exportPct}%</span>
            </div>
            <p style={s.exportText}>Processing video…</p>
            <p style={s.exportHint}>Please wait, applying edits</p>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}

const s = {
  screen: { position:'fixed', inset:0, background:'#040D0B', zIndex:3200, display:'flex', flexDirection:'column', fontFamily:FONT },

  header: { display:'flex', alignItems:'center', justifyContent:'space-between',
    padding:'52px 20px 12px', background:'rgba(0,0,0,0.6)', backdropFilter:'blur(8px)', WebkitBackdropFilter:'blur(8px)', flexShrink:0 },
  cancelBtn: { background:'transparent', border:'none', color:'rgba(255,255,255,0.6)', fontSize:18, cursor:'pointer', padding:'4px 8px' },
  title:     { color:'#fff', fontSize:16, fontWeight:700, fontFamily:FONT },
  doneBtn:   { background:`linear-gradient(135deg, ${TEAL}, #00E5CC)`, border:'none', borderRadius:20,
    color:'#040D0B', fontSize:14, fontWeight:700, fontFamily:FONT, padding:'8px 20px', cursor:'pointer', minWidth:64 },

  previewWrap: { position:'relative', width:'100%', height:'36vh', background:'#000', overflow:'hidden',
    display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', flexShrink:0 },
  video:       { width:'100%', height:'100%', objectFit:'contain', display:'block', transition:'transform 0.2s ease' },
  playCircle:  { position:'absolute', width:56, height:56, borderRadius:'50%',
    background:'rgba(0,0,0,0.55)', border:'2px solid rgba(255,255,255,0.6)',
    display:'flex', alignItems:'center', justifyContent:'center',
    fontSize:22, color:'#fff', pointerEvents:'none' },

  seekRow:   { display:'flex', alignItems:'center', gap:8, padding:'8px 16px', flexShrink:0 },
  timeLabel: { fontSize:11, color:'rgba(255,255,255,0.5)', fontFamily:FONT, flexShrink:0, minWidth:30, textAlign:'center' },
  rangeInput:{ flex:1, accentColor:TEAL, height:3, cursor:'pointer' },

  controls: { flex:1, overflowY:'auto', padding:'4px 16px 40px', display:'flex', flexDirection:'column', gap:0 },

  section:      { padding:'14px 0', borderBottom:'1px solid rgba(255,255,255,0.06)' },
  sectionLabel: { fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.45)', letterSpacing:'0.1em', margin:'0 0 10px', fontFamily:FONT },
  sectionHint:  { fontSize:11, fontWeight:400, color:TEAL, letterSpacing:0 },
  labelRow:     { display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 },
  resetBtn:     { background:'transparent', border:'1px solid rgba(255,255,255,0.15)', borderRadius:12,
    color:'rgba(255,255,255,0.4)', fontSize:10, fontFamily:FONT, padding:'3px 10px', cursor:'pointer' },

  chipRow:   { display:'flex', flexWrap:'wrap', gap:8 },
  chip:      { background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)',
    borderRadius:20, color:'rgba(255,255,255,0.65)', fontSize:12, fontFamily:FONT,
    padding:'6px 14px', cursor:'pointer' },
  chipActive:{ background:`rgba(0,201,167,0.18)`, border:`1px solid ${TEAL}`, color:TEAL },

  trimRow: { display:'flex', alignItems:'center', gap:8, marginBottom:6 },

  // Filter swatches — horizontally scrollable
  filterScroll:   { display:'flex', overflowX:'auto', gap:10, paddingBottom:8,
    scrollbarWidth:'none', WebkitOverflowScrolling:'touch' },
  filterChipWrap: { display:'flex', flexDirection:'column', alignItems:'center', gap:5,
    flexShrink:0, background:'transparent', border:'none', cursor:'pointer', padding:'2px 0' },
  filterSwatch:   { width:54, height:54, borderRadius:10, transition:'border-color 0.15s, box-shadow 0.15s' },
  filterLabel:    { fontSize:9, fontFamily:FONT, fontWeight:700, letterSpacing:'0.04em', textTransform:'uppercase', whiteSpace:'nowrap' },

  // Background music
  bgMusicPickBtn: { display:'flex', alignItems:'center', gap:12,
    background:'rgba(0,201,167,0.06)', border:'1px dashed rgba(0,201,167,0.35)',
    borderRadius:12, padding:'14px 16px', cursor:'pointer', width:'100%' },
  bgMusicRow:    { display:'flex', alignItems:'center', gap:10,
    background:'rgba(0,201,167,0.08)', border:`1px solid rgba(0,201,167,0.3)`,
    borderRadius:12, padding:'10px 14px' },
  bgMusicName:   { flex:1, fontSize:12, color:'rgba(255,255,255,0.8)', fontFamily:FONT,
    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' },
  bgMusicRemove: { background:'transparent', border:'none', color:'rgba(255,255,255,0.4)',
    fontSize:16, cursor:'pointer', padding:'2px 6px', flexShrink:0 },

  exportOverlay: { position:'fixed', inset:0, background:'rgba(4,13,11,0.9)', zIndex:3300,
    display:'flex', alignItems:'center', justifyContent:'center' },
  exportCard:    { display:'flex', flexDirection:'column', alignItems:'center', gap:14,
    background:'rgba(4,13,11,0.95)', borderRadius:24, padding:'32px 40px',
    border:'1px solid rgba(0,201,167,0.3)' },
  progressRing:  { position:'relative', width:72, height:72 },
  pctText:       { position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center',
    fontSize:16, fontWeight:700, color:TEAL, fontFamily:FONT },
  exportText:    { fontSize:15, fontWeight:700, color:'#fff', fontFamily:FONT, margin:0 },
  exportHint:    { fontSize:12, color:'rgba(255,255,255,0.4)', fontFamily:FONT, margin:0 },
};
