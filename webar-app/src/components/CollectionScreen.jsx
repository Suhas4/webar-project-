import { useState, useEffect, useRef } from 'react';
import FrameViewer        from './FrameViewer.jsx';
import CarFrameViewer     from './CarFrameViewer.jsx';
import UserAnimationViewer from './UserAnimationViewer.jsx';
import { saveAnimation, loadAnimations, deleteAnimation } from '../hooks/usePhotoAnimations.js';

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const TEAL = "#00C9A7";
const GOLD = "#C9A84C";

const SAMPLES = [
  {
    id: 'sample1',
    title: 'Sample 1',
    framesPath: '/collection-frames',
    total: 93,
    thumb: '/collection-frames/frame_0000.jpg',
    kind: 'sample',
  },
  {
    id: 'sample2',
    title: 'Sample 2 — Car',
    framesPath: '/car-frames',
    total: 98,
    thumb: '/car-frames/frame_0000.jpg',
    kind: 'car',
  },
  {
    id: 'sample3',
    title: 'Sample 3 — Invitation 29',
    framesPath: '/invitation-29-frames',
    total: 360,
    thumb: '/invitation-29-frames/frame_0000.jpg',
    kind: 'sample',
    canvasWidth: 540,
    canvasHeight: 960,
  },
];

function VideoSampleViewer({ title, videoUrl, onBack }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'#000', display:'flex',
      flexDirection:'column', fontFamily:FONT, overflow:'hidden' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', padding:'48px 16px 12px',
        background:'rgba(0,0,0,0.7)', flexShrink:0, zIndex:2 }}>
        <button onClick={onBack}
          style={{ background:'transparent', border:'1.5px solid rgba(255,255,255,0.25)',
            borderRadius:20, color:'#fff', fontSize:13, fontWeight:600,
            fontFamily:FONT, padding:'8px 16px', cursor:'pointer' }}>
          ← Back
        </button>
        <div style={{ marginLeft:14, flex:1 }}>
          <div style={{ fontSize:15, fontWeight:700, color:'#fff' }}>{title}</div>
          <div style={{ fontSize:11, color:TEAL, fontFamily:FONT, marginTop:1 }}>
            Birthday Animation · Moveable
          </div>
        </div>
      </div>

      {/* Video */}
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center',
        position:'relative', overflow:'hidden' }}>
        <video
          src={videoUrl}
          autoPlay
          loop
          playsInline
          controls
          style={{ maxWidth:'100%', maxHeight:'100%', objectFit:'contain', borderRadius:12 }}
        />
        {/* Draggable hint overlay */}
        <div style={{ position:'absolute', top:12, right:12, background:'rgba(0,0,0,0.6)',
          borderRadius:20, padding:'6px 12px', display:'flex', alignItems:'center', gap:6,
          backdropFilter:'blur(6px)', pointerEvents:'none' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke={TEAL} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/>
            <polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/>
            <line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/>
          </svg>
          <span style={{ fontSize:10, color:TEAL, fontWeight:800, letterSpacing:'0.06em' }}>DRAG TO MOVE</span>
        </div>
      </div>
    </div>
  );
}

export default function CollectionScreen({ onBack }) {
  const [active,      setActive]      = useState(null);
  const [userAnims,   setUserAnims]   = useState([]);
  const [uploading,   setUploading]   = useState(false);
  const [uploadMsg,   setUploadMsg]   = useState('');
  const [namePrompt,  setNamePrompt]  = useState(null); // { files }
  const [customName,  setCustomName]  = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadAnimations()
      .then((anims) => setUserAnims(anims.reverse()))
      .catch(() => {});
  }, []);

  const handleFilePick = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    if (files.length < 2) { alert('Please select at least 2 photos for an animation.'); return; }
    const defaultName = `My Animation ${userAnims.length + 1}`;
    setCustomName(defaultName);
    setNamePrompt({ files });
  };

  const handleSave = async () => {
    if (!namePrompt) return;
    const name = customName.trim() || `My Animation ${userAnims.length + 1}`;
    setNamePrompt(null);
    setUploading(true);
    setUploadMsg(`Processing ${namePrompt.files.length} photos...`);
    try {
      await saveAnimation(name, namePrompt.files);
      const anims = await loadAnimations();
      setUserAnims(anims.reverse());
      setUploadMsg('');
    } catch (err) {
      setUploadMsg('Failed to save. Try fewer or smaller photos.');
    }
    setUploading(false);
  };

  const handleDelete = async (id) => {
    await deleteAnimation(id).catch(() => {});
    setUserAnims((prev) => prev.filter((a) => a.id !== id));
    setActive(null);
  };

  // ── Active viewer ──
  if (active?.kind === 'car')    return <CarFrameViewer onBack={() => setActive(null)} />;
  if (active?.kind === 'sample') return (
    <FrameViewer title={active.title} framesPath={active.framesPath}
      total={active.total} onBack={() => setActive(null)}
      canvasWidth={active.canvasWidth} canvasHeight={active.canvasHeight} />
  );
  if (active?.kind === 'user') return (
    <UserAnimationViewer
      title={active.title}
      frames={active.frames}
      onBack={() => setActive(null)}
      onDelete={() => handleDelete(active.id)}
    />
  );

  return (
    <div style={{ position:'fixed', inset:0, background:'#F7F9FC', display:'flex',
      flexDirection:'column', fontFamily:FONT, overflow:'hidden' }}>

      {/* ── Name prompt modal ── */}
      {namePrompt && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)',
          backdropFilter:'blur(4px)', zIndex:50, display:'flex',
          alignItems:'center', justifyContent:'center', padding:24 }}>
          <div style={{ background:'#fff', borderRadius:20, padding:'28px 24px',
            maxWidth:340, width:'100%', boxShadow:'0 8px 40px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize:16, fontWeight:700, color:'#1A1A2E', fontFamily:FONT, marginBottom:6 }}>
              Name Your Animation
            </div>
            <div style={{ fontSize:12, color:'#666', fontFamily:FONT, marginBottom:16 }}>
              {namePrompt.files.length} photos selected
            </div>
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Animation name"
              autoFocus
              style={{ width:'100%', border:'1.5px solid #ddd', borderRadius:10,
                padding:'10px 14px', fontSize:14, fontFamily:FONT, outline:'none',
                boxSizing:'border-box', marginBottom:16,
                ':focus': { borderColor:TEAL } }}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setNamePrompt(null)}
                style={{ flex:1, background:'transparent', border:'1.5px solid #ddd',
                  borderRadius:50, color:'#666', fontSize:13, fontWeight:600,
                  fontFamily:FONT, padding:'10px', cursor:'pointer' }}>
                Cancel
              </button>
              <button onClick={handleSave}
                style={{ flex:1, background:TEAL, border:'none', borderRadius:50,
                  color:'#fff', fontSize:13, fontWeight:700, fontFamily:FONT,
                  padding:'10px', cursor:'pointer' }}>
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" accept="image/*" multiple
        style={{ display:'none' }} onChange={handleFilePick} />

      {/* ── Header ── */}
      <div style={{ display:'flex', alignItems:'center', padding:'48px 16px 12px',
        background:'#fff', borderBottom:'1px solid rgba(0,0,0,0.07)', flexShrink:0 }}>
        <button onClick={onBack}
          style={{ background:'transparent', border:'1.5px solid rgba(0,0,0,0.15)',
            borderRadius:20, color:'#1A1A2E', fontSize:13, fontWeight:600,
            fontFamily:FONT, padding:'8px 16px', cursor:'pointer' }}>
          Back
        </button>
        <div style={{ marginLeft:14, flex:1 }}>
          <div style={{ fontSize:16, fontWeight:700, color:'#1A1A2E' }}>Photo Animation</div>
          <div style={{ fontSize:11, color:'#888', fontFamily:FONT, marginTop:1 }}>
            Upload photos to create animations
          </div>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          style={{ background:`linear-gradient(135deg,${TEAL},#00E5CC)`,
            border:'none', borderRadius:20, color:'#fff', fontSize:12,
            fontWeight:700, fontFamily:FONT, padding:'9px 18px',
            cursor:'pointer', opacity: uploading ? 0.6 : 1 }}>
          + Upload
        </button>
      </div>

      {/* ── Upload progress ── */}
      {uploading && (
        <div style={{ background:`rgba(0,201,167,0.1)`, borderBottom:`1px solid ${TEAL}44`,
          padding:'10px 16px', textAlign:'center', flexShrink:0 }}>
          <span style={{ fontSize:12, color:TEAL, fontFamily:FONT, fontWeight:600 }}>
            {uploadMsg || 'Processing...'}
          </span>
        </div>
      )}

      {/* ── Scrollable body ── */}
      <div style={{ flex:1, overflowY:'auto', padding:'20px 16px 32px' }}>

        {/* YOUR ANIMATIONS */}
        <div style={{ marginBottom:24 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'#888', letterSpacing:'0.1em',
            textTransform:'uppercase', marginBottom:12, fontFamily:FONT }}>
            Your Animations
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            {/* Upload card */}
            <div onClick={() => !uploading && fileInputRef.current?.click()}
              style={{ cursor:'pointer', borderRadius:16, border:`2px dashed ${TEAL}66`,
                background:`rgba(0,201,167,0.05)`, aspectRatio:'4/3',
                display:'flex', flexDirection:'column', alignItems:'center',
                justifyContent:'center', gap:8, transition:'background 0.2s' }}>
              <div style={{ width:44, height:44, borderRadius:'50%',
                background:`rgba(0,201,167,0.15)`, display:'flex',
                alignItems:'center', justifyContent:'center',
                fontSize:22, color:TEAL }}>+</div>
              <div style={{ fontSize:11, fontWeight:700, color:TEAL, fontFamily:FONT,
                textAlign:'center', lineHeight:1.4 }}>Upload{'\n'}Photos</div>
            </div>

            {/* User animation cards */}
            {userAnims.map((anim) => (
              <div key={anim.id}
                onClick={() => setActive({ kind:'user', id:anim.id, title:anim.name, frames:anim.frames })}
                style={{ cursor:'pointer', borderRadius:16, overflow:'hidden',
                  border:'1px solid rgba(0,0,0,0.08)', background:'#fff',
                  boxShadow:'0 2px 10px rgba(0,0,0,0.06)' }}>
                <div style={{ position:'relative', aspectRatio:'4/3', overflow:'hidden',
                  background:'#F0F0F0' }}>
                  <img src={anim.frames[0]} alt={anim.name}
                    style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
                  {/* Frame count badge */}
                  <div style={{ position:'absolute', bottom:6, right:8,
                    background:'rgba(0,0,0,0.55)', borderRadius:10,
                    padding:'2px 8px', fontSize:10, color:'#fff', fontFamily:FONT,
                    fontWeight:600 }}>
                    {anim.frames.length} frames
                  </div>
                </div>
                <div style={{ padding:'8px 10px' }}>
                  <div style={{ fontSize:12, fontWeight:700, color:'#1A1A2E',
                    fontFamily:FONT, overflow:'hidden', textOverflow:'ellipsis',
                    whiteSpace:'nowrap' }}>
                    {anim.name}
                  </div>
                  <div style={{ fontSize:10, color:'#888', fontFamily:FONT, marginTop:2 }}>
                    Tap to play
                  </div>
                </div>
              </div>
            ))}
          </div>

          {userAnims.length === 0 && !uploading && (
            <div style={{ textAlign:'center', padding:'24px 0 8px',
              fontSize:12, color:'#aaa', fontFamily:FONT, lineHeight:1.6 }}>
              No animations yet.{'\n'}Tap <strong style={{ color:TEAL }}>+ Upload</strong> to create one from your photos.
            </div>
          )}
        </div>

        {/* SAMPLES */}
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:'#888', letterSpacing:'0.1em',
            textTransform:'uppercase', marginBottom:12, fontFamily:FONT }}>
            Sample Animations
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            {SAMPLES.map((s) => (
              <div key={s.id}
                onClick={() => setActive({ kind: s.kind, id: s.id, title: s.title,
                  framesPath: s.framesPath, total: s.total,
                  canvasWidth: s.canvasWidth, canvasHeight: s.canvasHeight })}
                style={{ cursor:'pointer', borderRadius:16, overflow:'hidden',
                  border: s.id === 'sample3' ? `1.5px solid ${TEAL}55` : '1px solid rgba(0,0,0,0.08)',
                  background:'#fff', boxShadow:'0 2px 10px rgba(0,0,0,0.06)' }}>
                <div style={{ position:'relative', width:'100%', aspectRatio:'4/3', overflow:'hidden', background:'#eee' }}>
                  <img src={s.thumb} alt={s.title}
                    style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
                  {s.id === 'sample3' && (
                    <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center',
                      justifyContent:'center', pointerEvents:'none' }}>
                      <div style={{ background:'rgba(0,0,0,0.5)', borderRadius:20, padding:'5px 11px',
                        display:'flex', alignItems:'center', gap:5, backdropFilter:'blur(3px)' }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                          stroke={TEAL} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/>
                          <polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/>
                          <line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/>
                        </svg>
                        <span style={{ fontSize:9, color:TEAL, fontWeight:800, letterSpacing:'0.06em' }}>DRAG</span>
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ padding:'8px 10px' }}>
                  <div style={{ fontSize:12, fontWeight:700, color:'#1A1A2E', fontFamily:FONT }}>
                    {s.title}
                  </div>
                  <div style={{ display:'inline-block', marginTop:4, background:`rgba(0,201,167,0.12)`,
                    borderRadius:10, padding:'2px 8px', fontSize:9,
                    color:TEAL, fontWeight:700, fontFamily:FONT, letterSpacing:'0.05em' }}>
                    {s.id === 'sample3' ? 'BIRTHDAY · 360 FRAMES' : '360 SPIN'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
