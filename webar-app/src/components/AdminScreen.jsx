import { useState, useEffect, useCallback } from 'react';
import { API_BASE as MAIN_API_BASE } from '../config/api.js';

const FONT     = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const TEAL     = "#00C9A7";
const GOLD     = "#C9A84C";
// Festival-blast (below) runs on the Node/Railway backend and uses the
// x-admin-key header; the content-report tools further down run on the main
// Go/Render backend (MAIN_API_BASE) and use the normal signed-in admin's
// Bearer token instead — two different backends, two different auth schemes.
const API_BASE = import.meta.env.VITE_BACKEND_URL || '';

// Preset style suggestions for the AI image
const STYLE_PRESETS = [
  'vibrant, cinematic lighting, digital art',
  'watercolor, soft pastel tones, artistic',
  'glittery, golden bokeh, festive atmosphere',
  'realistic photography, warm tones, celebration',
  'traditional Indian art, colorful, detailed',
];

export default function AdminScreen({ onBack, adminKey, onUploadGlobal }) {
  const [festivalName, setFestivalName] = useState('');
  const [stylePrompt,  setStylePrompt]  = useState(STYLE_PRESETS[0]);
  const [overlayText,  setOverlayText]  = useState('');
  const [sending,      setSending]      = useState(false);
  const [result,       setResult]       = useState(null);
  const [error,        setError]        = useState('');
  const [status,       setStatus]       = useState(null);
  const [statusLoading, setStatusLoading] = useState(false);

  // Content reports — public AR targets flagged via the 🚩 button in the
  // scanner, awaiting admin review (hide/unhide/dismiss).
  const [reports,        setReports]        = useState([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsError,   setReportsError]   = useState('');
  const [resolvingId,    setResolvingId]    = useState(null);

  const loadReports = useCallback(async () => {
    const token = localStorage.getItem('memoera_token');
    if (!token) { setReportsError('Not signed in.'); return; }
    setReportsLoading(true); setReportsError('');
    try {
      const res = await fetch(`${MAIN_API_BASE}/api/admin/reports`, {
        headers: { Authorization: 'Bearer ' + token },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load reports');
      setReports(data.reports || []);
    } catch (e) {
      setReportsError(e.message);
    } finally {
      setReportsLoading(false);
    }
  }, []);

  useEffect(() => { loadReports(); }, [loadReports]);

  const resolveReport = async (targetId, action) => {
    const token = localStorage.getItem('memoera_token');
    if (!token) return;
    setResolvingId(targetId);
    try {
      const res = await fetch(`${MAIN_API_BASE}/api/admin/reports/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ targetId, action }),
      });
      if (!res.ok) throw new Error();
      setReports(prev => prev.filter(r => r.targetId !== targetId));
    } catch {
      setReportsError('Failed to update — please try again.');
    } finally {
      setResolvingId(null);
    }
  };

  const sendBlast = async () => {
    if (!festivalName.trim()) { setError('Please enter a festival name.'); return; }
    if (!overlayText.trim())  { setError('Please enter a greeting message.'); return; }
    if (!API_BASE)            { setError('Backend URL not configured. Set VITE_BACKEND_URL in .env'); return; }

    setSending(true); setError(''); setResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/festival-blast`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey || '' },
        body:    JSON.stringify({ festival_name: festivalName, style_prompt: stylePrompt, overlay_text: overlayText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Blast failed');
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  };

  const checkStatus = async () => {
    if (!API_BASE) return;
    setStatusLoading(true);
    try {
      const res  = await fetch(`${API_BASE}/api/admin/blast-status`, { headers: { 'x-admin-key': adminKey || '' } });
      const data = await res.json();
      setStatus(data);
    } catch { setStatus(null); }
    setStatusLoading(false);
  };

  const inp = {
    width:'100%', padding:'12px 14px', borderRadius:10,
    background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.15)',
    color:'#fff', fontSize:14, fontFamily:FONT, outline:'none',
    boxSizing:'border-box', marginTop:6,
  };

  return (
    <div style={{ position:'fixed', inset:0,
      background:'linear-gradient(160deg,#061A1F 0%,#0a2530 100%)',
      display:'flex', flexDirection:'column', fontFamily:FONT, overflow:'hidden' }}>

      {/* ── Header ── */}
      <div style={{ padding:'48px 20px 16px', flexShrink:0, display:'flex', alignItems:'center', gap:12,
        borderBottom:'1px solid rgba(255,255,255,0.07)' }}>
        <button onClick={onBack}
          style={{ background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.14)',
            borderRadius:20, color:'rgba(255,255,255,0.8)', fontSize:13, fontWeight:600,
            fontFamily:FONT, padding:'7px 16px', cursor:'pointer' }}>← Back</button>
        <div>
          <div style={{ fontSize:18, fontWeight:700, color:'#fff' }}>Festival Greeting Blast</div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', marginTop:1 }}>
            Send AI-generated greetings to all users
          </div>
        </div>
      </div>

      {/* ── Form ── */}
      <div style={{ flex:1, overflowY:'auto', padding:'20px 20px 40px' }}>

        {/* ── Content Reports ── flagged public AR targets awaiting review */}
        <div style={{ marginBottom:28 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#fff' }}>
              🚩 Content Reports {reports.length > 0 && `(${reports.length})`}
            </div>
            <button onClick={loadReports} disabled={reportsLoading}
              style={{ background:'transparent', border:'1px solid rgba(255,255,255,0.15)', borderRadius:14,
                color:'rgba(255,255,255,0.6)', fontSize:11, fontFamily:FONT, padding:'5px 12px', cursor:'pointer' }}>
              {reportsLoading ? '⏳' : '↻'} Refresh
            </button>
          </div>

          {reportsError && (
            <div style={{ background:'rgba(220,50,50,0.10)', border:'1px solid rgba(220,50,50,0.3)',
              borderRadius:10, padding:'10px 14px', marginBottom:10, color:'#FF6B6B', fontSize:12 }}>
              ⚠ {reportsError}
            </div>
          )}

          {!reportsLoading && reports.length === 0 && !reportsError && (
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.35)', padding:'8px 2px' }}>
              No pending reports.
            </div>
          )}

          {reports.map(rep => (
            <div key={rep.id} style={{ display:'flex', gap:10, alignItems:'center',
              background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.1)',
              borderRadius:12, padding:10, marginBottom:8 }}>
              {rep.imageUrl && (
                <img src={rep.imageUrl} alt="" style={{ width:48, height:48, borderRadius:8, objectFit:'cover', flexShrink:0 }} />
              )}
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:12.5, fontWeight:700, color:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {rep.label || 'Untitled'} {rep.reportCount > 1 && `· ${rep.reportCount} reports`}
                </div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,0.5)', marginTop:2 }}>
                  "{rep.reason}"{rep.isHidden ? ' — currently hidden' : ''}
                </div>
              </div>
              <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                <button onClick={() => resolveReport(rep.targetId, rep.isHidden ? 'unhide' : 'hide')}
                  disabled={resolvingId === rep.targetId}
                  style={{ background: rep.isHidden ? 'rgba(0,201,167,0.12)' : 'rgba(220,50,50,0.14)',
                    border:`1px solid ${rep.isHidden ? TEAL : '#FF6B6B'}55`, borderRadius:14,
                    color: rep.isHidden ? TEAL : '#FF6B6B', fontSize:11, fontWeight:700,
                    fontFamily:FONT, padding:'6px 12px', cursor:'pointer' }}>
                  {rep.isHidden ? 'Unhide' : 'Hide'}
                </button>
                <button onClick={() => resolveReport(rep.targetId, 'dismiss')}
                  disabled={resolvingId === rep.targetId}
                  style={{ background:'transparent', border:'1px solid rgba(255,255,255,0.15)', borderRadius:14,
                    color:'rgba(255,255,255,0.6)', fontSize:11, fontFamily:FONT, padding:'6px 12px', cursor:'pointer' }}>
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Upload Global Content — creates public AR content visible to every
            user's scanner (reuses the same is_public mechanism regular users
            get from the "Public" upload flow, with quota bypassed for admin). */}
        {onUploadGlobal && (
          <button onClick={onUploadGlobal}
            style={{ width:'100%', padding:'15px', borderRadius:13, border:`1px solid ${TEAL}55`,
              background:'rgba(0,201,167,0.10)', color:TEAL, fontSize:14, fontWeight:700,
              fontFamily:FONT, cursor:'pointer', marginBottom:24, display:'flex',
              alignItems:'center', justifyContent:'center', gap:8 }}>
            📤 Upload Global Content — visible to all users
          </button>
        )}

        {/* Festival Name */}
        <div style={{ marginBottom:18 }}>
          <label style={{ fontSize:11, fontWeight:700, color:TEAL, letterSpacing:'0.08em' }}>
            FESTIVAL NAME *
          </label>
          <input value={festivalName} onChange={(e) => setFestivalName(e.target.value)}
            placeholder="e.g. Diwali, New Year, Christmas, Eid, Pongal"
            style={inp} />
        </div>

        {/* Style Prompt */}
        <div style={{ marginBottom:8 }}>
          <label style={{ fontSize:11, fontWeight:700, color:TEAL, letterSpacing:'0.08em' }}>
            AI IMAGE STYLE
          </label>
          <input value={stylePrompt} onChange={(e) => setStylePrompt(e.target.value)}
            placeholder="e.g. vibrant, cinematic lighting, watercolor"
            style={inp} />
        </div>
        {/* Quick presets */}
        <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:18 }}>
          {STYLE_PRESETS.map((p) => (
            <button key={p} onClick={() => setStylePrompt(p)}
              style={{ fontSize:10, padding:'4px 10px', borderRadius:16, cursor:'pointer', fontFamily:FONT,
                border: stylePrompt === p ? `1px solid ${TEAL}` : '1px solid rgba(255,255,255,0.15)',
                background: stylePrompt === p ? 'rgba(0,201,167,0.15)' : 'rgba(255,255,255,0.04)',
                color: stylePrompt === p ? TEAL : 'rgba(255,255,255,0.55)' }}>
              {p.split(',')[0]}
            </button>
          ))}
        </div>

        {/* Greeting Message */}
        <div style={{ marginBottom:20 }}>
          <label style={{ fontSize:11, fontWeight:700, color:TEAL, letterSpacing:'0.08em' }}>
            GREETING MESSAGE *
          </label>
          <textarea value={overlayText} onChange={(e) => setOverlayText(e.target.value)}
            placeholder="e.g. Wishing you a year filled with joy and success!"
            rows={3}
            style={{ ...inp, resize:'vertical', lineHeight:1.6 }} />
          <div style={{ fontSize:10, color:'rgba(255,255,255,0.32)', marginTop:5 }}>
            This text appears on the image below the user's personalized name.
          </div>
        </div>

        {/* Live preview of what text will look like on image */}
        <div style={{ background:'rgba(0,201,167,0.07)', border:'1px solid rgba(0,201,167,0.22)',
          borderRadius:12, padding:'14px 16px', marginBottom:24 }}>
          <div style={{ fontSize:10, color:TEAL, fontWeight:700, letterSpacing:'0.08em', marginBottom:8 }}>
            IMAGE TEXT PREVIEW
          </div>
          <div style={{ fontSize:16, fontWeight:700, color:'#fff', marginBottom:4 }}>
            Happy {festivalName || '[Festival Name]'}, [User Name]!
          </div>
          <div style={{ fontSize:13, color:'rgba(255,255,255,0.55)', lineHeight:1.5 }}>
            {overlayText || '[Your greeting message here]'}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ background:'rgba(220,50,50,0.10)', border:'1px solid rgba(220,50,50,0.3)',
            borderRadius:10, padding:'10px 14px', marginBottom:16, color:'#FF6B6B', fontSize:13 }}>
            ⚠ {error}
          </div>
        )}

        {/* Success */}
        {result && (
          <div style={{ background:'rgba(0,201,167,0.08)', border:'1px solid rgba(0,201,167,0.28)',
            borderRadius:10, padding:'12px 16px', marginBottom:16 }}>
            <div style={{ fontSize:14, fontWeight:700, color:TEAL, marginBottom:4 }}>
              ✅ Blast Queued Successfully!
            </div>
            <div style={{ fontSize:13, color:'rgba(255,255,255,0.6)' }}>
              {result.message}
            </div>
          </div>
        )}

        {/* Send Button */}
        <button onClick={sendBlast} disabled={sending}
          style={{ width:'100%', padding:'15px', borderRadius:13, border:'none',
            background: sending ? 'rgba(0,201,167,0.35)' : `linear-gradient(135deg,${TEAL},#00E5CC)`,
            color: sending ? 'rgba(255,255,255,0.6)' : '#040D0B',
            fontSize:15, fontWeight:700, fontFamily:FONT,
            cursor: sending ? 'not-allowed' : 'pointer', marginBottom:14,
            boxShadow: sending ? 'none' : '0 4px 20px rgba(0,201,167,0.35)' }}>
          {sending ? '⏳  Sending Blast…' : '🚀  Send Festival Blast to All Users'}
        </button>

        {/* Status Button */}
        <button onClick={checkStatus} disabled={statusLoading}
          style={{ width:'100%', padding:'12px', borderRadius:12,
            background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.12)',
            color:'rgba(255,255,255,0.65)', fontSize:13, fontWeight:600,
            fontFamily:FONT, cursor:'pointer' }}>
          {statusLoading ? 'Checking…' : '📊  Check Queue Status'}
        </button>

        {/* Status Grid */}
        {status && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginTop:12 }}>
            {[
              { label:'Waiting',   value: status.waiting,   color: GOLD },
              { label:'Active',    value: status.active,    color: '#00E5CC' },
              { label:'Completed', value: status.completed, color: TEAL },
              { label:'Failed',    value: status.failed,    color: '#FF6B6B' },
            ].map(({ label, value, color }) => (
              <div key={label}
                style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)',
                  borderRadius:10, padding:'12px', textAlign:'center' }}>
                <div style={{ fontSize:26, fontWeight:700, color }}>{value}</div>
                <div style={{ fontSize:10, color:'rgba(255,255,255,0.4)', marginTop:3 }}>{label}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
