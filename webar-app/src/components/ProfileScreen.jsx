import { useState, useRef, useEffect, useCallback } from "react";
import { API_BASE } from "../config/api.js";
import CameraCapture from "./CameraCapture.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { useLanguage } from "../context/LanguageContext.jsx";

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const GOLD = "#C9A84C";
const TEAL = "#00C9A7";

const SECURITY_QUESTIONS = [
  "What was the name of your first pet?",
  "What is your mother's maiden name?",
  "What city were you born in?",
  "What was the name of your primary school?",
  "What is your oldest sibling's middle name?",
];

const FILTER_PRESETS = [
  { name: "Natural",  css: "" },
  { name: "Bright",   css: "brightness(1.25) contrast(1.05)" },
  { name: "Warm",     css: "brightness(1.1) sepia(0.35) saturate(1.4)" },
  { name: "Cool",     css: "saturate(0.85) hue-rotate(25deg)" },
  { name: "B&W",      css: "grayscale(1) contrast(1.1)" },
  { name: "Vivid",    css: "saturate(1.9) contrast(1.2)" },
  { name: "Vintage",  css: "sepia(0.55) contrast(0.9) brightness(0.9) saturate(0.85)" },
  { name: "Fade",     css: "brightness(1.1) contrast(0.82) saturate(0.65)" },
  { name: "Cartoon",  css: "saturate(2.5) contrast(1.8) brightness(1.1)" },
  { name: "Anime",    css: "saturate(2) contrast(1.4) brightness(1.15) hue-rotate(5deg)" },
  { name: "Neon",     css: "saturate(3) contrast(1.5) brightness(1.2) hue-rotate(30deg)" },
  { name: "Pop Art",  css: "saturate(3.5) contrast(2) brightness(1.05)" },
  { name: "Sketch",   css: "grayscale(1) contrast(3.5) brightness(1.3)" },
];

export default function ProfileScreen({ user, onBack, onUserUpdate }) {
  const { colors } = useTheme();
  const { tr } = useLanguage();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    firstName: user?.firstName || "",
    lastName: user?.lastName || "",
    dateOfBirth: user?.dateOfBirth || "",
    email: user?.email || "",
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [profilePhoto, setProfilePhoto] = useState(user?.profilePhotoUrl || "");
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [editorFile, setEditorFile] = useState(null);
  const galleryInputRef = useRef(null);

  const [editingSecurity, setEditingSecurity] = useState(false);
  const [securityQuestion, setSecurityQuestion] = useState(user?.securityQuestion || SECURITY_QUESTIONS[0]);
  const [securityAnswer, setSecurityAnswer] = useState("");
  const [savingSecurity, setSavingSecurity] = useState(false);
  const [securityMsg, setSecurityMsg] = useState("");

  const handleSaveSecurity = async () => {
    if (!securityAnswer.trim()) { setSecurityMsg(tr.prfErrAnswerRequired); return; }
    setSavingSecurity(true); setSecurityMsg("");
    try {
      const token = localStorage.getItem("memoera_token") || "";
      const res = await fetch(API_BASE + "/api/auth/security-question", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ securityQuestion, securityAnswer: securityAnswer.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setSecurityMsg(data.error || tr.prfErrSaveFailed); return; }
      onUserUpdate({ ...user, securityQuestion });
      setSecurityAnswer("");
      setEditingSecurity(false);
    } catch {
      setSecurityMsg(tr.prfErrNetwork);
    } finally {
      setSavingSecurity(false);
    }
  };

  useEffect(() => {
    setProfilePhoto(user?.profilePhotoUrl || "");
  }, [user?.profilePhotoUrl]);

  // Existing sessions logged in before the Memoera ID format changed won't
  // have `createdAt` cached locally yet — refresh once from /api/me so the
  // date-based ID below has what it needs without requiring a re-login.
  useEffect(() => {
    if (user?.createdAt) return;
    const token = localStorage.getItem("memoera_token");
    if (!token) return;
    fetch(API_BASE + "/api/me", { headers: { Authorization: "Bearer " + token } })
      .then(r => r.ok ? r.json() : null)
      .then(fresh => { if (fresh) onUserUpdate(fresh); })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dob = form.dateOfBirth;
  const dobParts = dob ? dob.split("-") : [];
  const dobDisplay = dobParts.length === 3
    ? (dobParts[2] + " | " + dobParts[1] + " | " + dobParts[0])
    : dob || tr.prfNotSet;
  const initials = (((user?.firstName || " ")[0]) + ((user?.lastName || " ")[0])).toUpperCase();

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
  const validateProfile = () => {
    const errors = {};
    if (!form.firstName.trim()) errors.firstName = tr.prfErrFirstNameRequired;
    if (!form.lastName.trim()) errors.lastName = tr.prfErrLastNameRequired;
    if (form.email.trim() && !EMAIL_RE.test(form.email.trim())) errors.email = tr.prfErrEmailInvalid;
    return errors;
  };

  const handleSave = async () => {
    const errors = validateProfile();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setSaving(true);
    try {
      const token = localStorage.getItem("memoera_token") || "";
      const res = await fetch(API_BASE + "/api/auth/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || tr.prfErrSaveGeneric); return; }
      onUserUpdate(data);
      setEditing(false);
    } catch {
      alert(tr.prfErrNetwork);
    } finally {
      setSaving(false);
    }
  };

  // Called with raw File from camera or gallery — opens editor
  const openEditor = useCallback((file) => {
    if (!file) return;
    setShowPhotoPicker(false);
    setShowCamera(false);
    setEditorFile(file);
  }, []);

  // Called when user confirms in editor
  const handleEditorApply = useCallback(async (blob) => {
    setEditorFile(null);
    setPhotoUploading(true);
    try {
      const token = localStorage.getItem("memoera_token") || "";
      const base64 = await blobToBase64(blob);
      const res = await fetch(API_BASE + "/api/auth/profile/photo", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ imageBase64: base64 }),
      });
      if (!res.ok) { alert("Failed to upload photo. Please try again."); return; }
      const data = await res.json();
      const photoUrl = data.photoUrl || "";
      setProfilePhoto(photoUrl);
      onUserUpdate({ ...user, profilePhotoUrl: photoUrl });
    } catch {
      alert("Failed to upload photo. Please try again.");
    } finally {
      setPhotoUploading(false);
    }
  }, [user, onUserUpdate]);

  return (
    <div style={{ ...styles.screen, background: colors.bg }}>
      {showCamera && (
        <CameraCapture facingMode="user"
          onCapture={(file) => { setShowCamera(false); openEditor(file); }}
          onClose={() => setShowCamera(false)}
        />
      )}
      {editorFile && (
        <PhotoEditorModal
          file={editorFile}
          onApply={handleEditorApply}
          onCancel={() => setEditorFile(null)}
          tr={tr}
        />
      )}
      {showPhotoPicker && (
        <div>
          <div style={styles.pickerBackdrop} onClick={() => setShowPhotoPicker(false)} />
          <div style={{ ...styles.pickerSheet, background: colors.surface }}>
            <div style={styles.pickerHandle} />
            <p style={{ ...styles.pickerTitle, color: colors.text }}>{tr.prfProfilePhoto}</p>
            <button style={{ ...styles.pickerBtn, color: colors.text }}
              onClick={() => { setShowPhotoPicker(false); setShowCamera(true); }}>
              📷  {tr.prfCamera}
            </button>
            <button style={{ ...styles.pickerBtn, color: colors.text }}
              onClick={() => { setShowPhotoPicker(false); galleryInputRef.current?.click(); }}>
              🖼️  {tr.prfGallery}
            </button>
            <button style={{ ...styles.pickerCancelBtn, color: colors.textMuted }}
              onClick={() => setShowPhotoPicker(false)}>
              {tr.cancel}
            </button>
          </div>
        </div>
      )}
      <input ref={galleryInputRef} type="file" accept="image/*" style={{ display: "none" }}
        onChange={(e) => openEditor(e.target.files?.[0])}
        onClick={(e) => { e.target.value = ""; }} />

      <button onClick={onBack} style={{ ...styles.backBtn, color: colors.textMuted }}>← {tr.back}</button>

      <div style={styles.avatarWrap} onClick={() => !photoUploading && setShowPhotoPicker(true)}>
        <div style={styles.hexOuter}>
          <div style={styles.hexInner}>
            {profilePhoto
              ? <img src={profilePhoto} alt="Profile" style={styles.profileImg} />
              : <span style={styles.initials}>{photoUploading ? "…" : initials}</span>
            }
          </div>
        </div>
        <div style={{ ...styles.editPhotoHint, color: colors.textMuted }}>
          {photoUploading ? tr.prfUploading : tr.prfTapToChangePhoto}
        </div>
        {user?.id != null && (
          <div style={{ marginTop: 8, fontSize: 11, fontWeight: 700, fontFamily: FONT,
            letterSpacing: "0.06em", color: GOLD, background: "rgba(201,168,76,0.12)",
            border: "1px solid rgba(201,168,76,0.35)", borderRadius: 20, padding: "4px 12px" }}>
            {tr.prfMemoeraId}: {formatMemoeraId(user)}
          </div>
        )}
      </div>

      <div style={{ width: "80%", display: "flex", flexDirection: "column", alignItems: "center" }}>
        {editing ? (
          <>
            <p style={{ ...styles.fieldLabel, color: colors.textMuted }}>{tr.firstName} *</p>
            <input style={{ ...styles.editInput, color: colors.text, background: colors.surface, borderBottomColor: fieldErrors.firstName ? '#FF6B6B' : undefined }}
              placeholder={tr.firstName} value={form.firstName}
              onChange={(e) => { setForm(f => ({ ...f, firstName: e.target.value })); setFieldErrors(fe => ({ ...fe, firstName: undefined })); }} />
            {fieldErrors.firstName && <p style={styles.fieldErrorText}>⚠ {fieldErrors.firstName}</p>}
            <div style={{ ...styles.divider, background: colors.border }} />

            <p style={{ ...styles.fieldLabel, color: colors.textMuted }}>{tr.lastName} *</p>
            <input style={{ ...styles.editInput, color: colors.text, background: colors.surface, borderBottomColor: fieldErrors.lastName ? '#FF6B6B' : undefined }}
              placeholder={tr.lastName} value={form.lastName}
              onChange={(e) => { setForm(f => ({ ...f, lastName: e.target.value })); setFieldErrors(fe => ({ ...fe, lastName: undefined })); }} />
            {fieldErrors.lastName && <p style={styles.fieldErrorText}>⚠ {fieldErrors.lastName}</p>}
            <div style={{ ...styles.divider, background: colors.border }} />

            <p style={{ ...styles.fieldLabel, color: colors.textMuted }}>{tr.dateOfBirth}</p>
            <input style={{ ...styles.editInput, color: colors.text, background: colors.surface }}
              type="date" value={form.dateOfBirth}
              onChange={(e) => setForm(f => ({ ...f, dateOfBirth: e.target.value }))} />
            <div style={{ ...styles.divider, background: colors.border }} />

            <p style={{ ...styles.fieldLabel, color: colors.textMuted }}>{tr.prfEmailOptional}</p>
            <input style={{ ...styles.editInput, color: colors.text, background: colors.surface, borderBottomColor: fieldErrors.email ? '#FF6B6B' : undefined }}
              type="email" placeholder={tr.prfEmailOptional} value={form.email}
              onChange={(e) => { setForm(f => ({ ...f, email: e.target.value })); setFieldErrors(fe => ({ ...fe, email: undefined })); }} />
            {fieldErrors.email && <p style={styles.fieldErrorText}>⚠ {fieldErrors.email}</p>}
          </>
        ) : (
          <>
            <div style={{ ...styles.name, color: colors.text }}>
              {((form.firstName || "") + " " + (form.lastName || "")).toUpperCase()}
            </div>
            <div style={{ ...styles.divider, background: colors.border }} />
            <div style={{ ...styles.field, color: colors.text }}>{dobDisplay}</div>
            <div style={{ ...styles.divider, background: colors.border }} />
            <div style={{ ...styles.field, color: colors.text }}>{user?.mobile || ""}</div>
            <div style={{ ...styles.divider, background: colors.border }} />
            <div style={{ ...styles.field, color: colors.text }}>{form.email || tr.prfNoEmailSet}</div>
            <div style={{ ...styles.divider, background: colors.border }} />
            <div style={{ ...styles.field, fontSize: 11, color: colors.textMuted }}>
              {user?.securityQuestion || tr.securityQuestion}
            </div>
            <div style={{ ...styles.divider, background: colors.border }} />
          </>
        )}
      </div>

      <div style={{ width: "80%", marginTop: 20, padding: "14px 16px", borderRadius: 14,
        background: "rgba(0,201,167,0.06)", border: "1px solid rgba(0,201,167,0.25)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: colors.text, fontFamily: FONT }}>{tr.securityQuestion}</div>
            <div style={{ fontSize: 11, color: colors.textMuted, fontFamily: FONT, marginTop: 2 }}>
              {editingSecurity ? tr.prfSecurityHint : (user?.securityQuestion || tr.prfNotSetYet)}
            </div>
          </div>
          {!editingSecurity && (
            <button onClick={() => setEditingSecurity(true)}
              style={{ background: "transparent", border: `1px solid ${TEAL}`, color: TEAL,
                borderRadius: 20, padding: "6px 14px", fontSize: 12, fontWeight: 700, fontFamily: FONT, cursor: "pointer" }}>
              {user?.securityQuestion ? tr.prfUpdate : tr.prfSetUp}
            </button>
          )}
        </div>
        {editingSecurity && (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            <select value={securityQuestion} onChange={(e) => setSecurityQuestion(e.target.value)}
              style={{ ...styles.editInput, marginBottom: 0, cursor: "pointer" }}>
              {SECURITY_QUESTIONS.map(q => <option key={q} value={q} style={{ background: "#0E1628", color: "#fff" }}>{q}</option>)}
            </select>
            <input style={{ ...styles.editInput, marginBottom: 0 }}
              placeholder={tr.prfYourAnswer} value={securityAnswer}
              onChange={(e) => setSecurityAnswer(e.target.value)} />
            {securityMsg && <div style={{ fontSize: 11, color: "#FF6B6B", fontFamily: FONT, textAlign: "center" }}>{securityMsg}</div>}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setEditingSecurity(false); setSecurityAnswer(""); setSecurityMsg(""); }} disabled={savingSecurity}
                style={{ flex: 1, background: "transparent", border: `1px solid ${colors.border}`, color: colors.text,
                  borderRadius: 20, padding: "9px 0", fontSize: 12, fontWeight: 700, fontFamily: FONT, cursor: "pointer" }}>
                {tr.cancel}
              </button>
              <button onClick={handleSaveSecurity} disabled={savingSecurity}
                style={{ flex: 1, background: TEAL, border: "none", color: "#04211C",
                  borderRadius: 20, padding: "9px 0", fontSize: 12, fontWeight: 700, fontFamily: FONT, cursor: "pointer" }}>
                {savingSecurity ? tr.prfSaving : tr.save}
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={styles.buttonRow}>
        {editing ? (
          <>
            <button style={{ ...styles.editBtn, color: colors.text, borderColor: colors.border }}
              onClick={() => setEditing(false)} disabled={saving}>{tr.cancel}</button>
            <button style={styles.doneBtn} onClick={handleSave} disabled={saving}>
              {saving ? tr.prfSaving : tr.done}
            </button>
          </>
        ) : (
          <>
            <button style={{ ...styles.editBtn, color: colors.text, borderColor: colors.border }}
              onClick={() => setEditing(true)}>{tr.edit}</button>
            <button style={styles.doneBtn} onClick={onBack}>{tr.done}</button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Photo Editor Modal ────────────────────────────────────────────────────────

function PhotoEditorModal({ file, onApply, onCancel, tr }) {
  const [tab, setTab]           = useState("crop");
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast]     = useState(100);
  const [warmth, setWarmth]         = useState(0);
  const [filterIdx, setFilterIdx]   = useState(0);
  const [panY, setPanY]             = useState(0);
  const [imgH, setImgH]             = useState(0);
  const [applying, setApplying]     = useState(false);
  const [imgSrc, setImgSrc]         = useState("");
  const imgRef   = useRef(null);
  const dragRef  = useRef(null);
  const VIEW = Math.min(280, window.innerWidth - 60);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImgSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const editFilter  = `brightness(${brightness / 100}) contrast(${contrast / 100})${warmth !== 0 ? ` hue-rotate(${warmth}deg)` : ""}`;
  const presetFilter = FILTER_PRESETS[filterIdx].css;
  const fullFilter  = [editFilter, presetFilter].filter(Boolean).join(" ");

  const handleImgLoad = () => {
    const img = imgRef.current;
    if (!img) return;
    const h = Math.round(VIEW * img.naturalHeight / img.naturalWidth);
    setImgH(h);
    setPanY(-Math.max(0, (h - VIEW) / 2));
  };

  const clamp = (v, h) => Math.min(0, Math.max(-(Math.max(h, VIEW) - VIEW), v));

  const onTouchStart = (e) => { dragRef.current = { y: e.touches[0].clientY, panY }; };
  const onTouchMove  = (e) => {
    if (!dragRef.current) return;
    e.preventDefault();
    const dy = e.touches[0].clientY - dragRef.current.y;
    setPanY(clamp(dragRef.current.panY + dy, imgH));
  };
  const onMouseDown  = (e) => { dragRef.current = { y: e.clientY, panY }; };
  const onMouseMove  = (e) => {
    if (!dragRef.current || e.buttons === 0) { dragRef.current = null; return; }
    setPanY(clamp(dragRef.current.panY + (e.clientY - dragRef.current.y), imgH));
  };
  const onMouseUp    = () => { dragRef.current = null; };

  const handleApply = async () => {
    setApplying(true);
    const img = imgRef.current;
    if (!img || !img.complete) { setApplying(false); return; }

    const displayedH = imgH || VIEW;
    const scaleY = img.naturalHeight / displayedH;
    const cropY  = Math.max(0, -panY) * scaleY;
    const cropH  = VIEW * scaleY;

    const canvas = document.createElement("canvas");
    canvas.width = 400; canvas.height = 400;
    const ctx = canvas.getContext("2d");
    if (fullFilter) ctx.filter = fullFilter;
    ctx.drawImage(img, 0, cropY, img.naturalWidth, cropH, 0, 0, 400, 400);
    canvas.toBlob((blob) => { onApply(blob); setApplying(false); }, "image/jpeg", 0.88);
  };

  return (
    <div style={pe.backdrop}>
      <div style={pe.sheet}>
        <p style={pe.title}>{tr.peEditPhoto}</p>

        {/* Tabs */}
        <div style={pe.tabs}>
          {["crop", "edit", "filter"].map(t => (
            <button key={t} style={{ ...pe.tab, ...(tab === t ? pe.tabActive : {}) }}
              onClick={() => setTab(t)}>
              {t === "crop" ? `✂️ ${tr.peTabCrop}` : t === "edit" ? `✨ ${tr.peTabAdjust}` : `🎨 ${tr.peTabFilters}`}
            </button>
          ))}
        </div>

        {/* Square preview viewport */}
        <div
          style={{ ...pe.viewBox, width: VIEW, height: VIEW }}
          onTouchStart={tab === "crop" ? onTouchStart : undefined}
          onTouchMove={tab === "crop" ? onTouchMove : undefined}
          onMouseDown={tab === "crop" ? onMouseDown : undefined}
          onMouseMove={tab === "crop" ? onMouseMove : undefined}
          onMouseUp={tab === "crop" ? onMouseUp : undefined}
        >
          {imgSrc && (
            <img ref={imgRef} src={imgSrc} alt=""
              onLoad={handleImgLoad}
              style={{
                width: VIEW, height: "auto", display: "block",
                transform: `translateY(${panY}px)`,
                filter: fullFilter || "none",
                userSelect: "none", touchAction: "none", pointerEvents: "none",
              }}
            />
          )}
          {/* Grid overlay for crop */}
          {tab === "crop" && (
            <svg style={pe.gridSvg} viewBox={`0 0 ${VIEW} ${VIEW}`} fill="none">
              <line x1={VIEW/3} y1="0" x2={VIEW/3} y2={VIEW} stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
              <line x1={VIEW*2/3} y1="0" x2={VIEW*2/3} y2={VIEW} stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
              <line x1="0" y1={VIEW/3} x2={VIEW} y2={VIEW/3} stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
              <line x1="0" y1={VIEW*2/3} x2={VIEW} y2={VIEW*2/3} stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
            </svg>
          )}
        </div>
        {tab === "crop" && <p style={pe.hint}>{tr.peHint}</p>}

        {/* Edit sliders */}
        {tab === "edit" && (
          <div style={pe.editPanel}>
            <SliderRow label={tr.peBrightness}    value={brightness} onChange={setBrightness} min={50}  max={150} unit="%" />
            <SliderRow label={tr.peContrast}      value={contrast}   onChange={setContrast}   min={50}  max={150} unit="%" />
            <WarmthRow label={tr.peWhiteBalance}  value={warmth}     onChange={setWarmth}     min={-60} max={60} tr={tr} />
          </div>
        )}

        {/* Filter swatches */}
        {tab === "filter" && (
          <div style={pe.filterRow}>
            {FILTER_PRESETS.map((f, i) => (
              <button key={f.name}
                style={{ ...pe.filterBtn, outline: filterIdx === i ? `2px solid ${GOLD}` : "none" }}
                onClick={() => setFilterIdx(i)}>
                <div style={{
                  ...pe.filterThumb,
                  backgroundImage: imgSrc ? `url(${imgSrc})` : "none",
                  filter: f.css || "none",
                }} />
                <span style={{ ...pe.filterName, color: filterIdx === i ? GOLD : "rgba(255,255,255,0.7)" }}>
                  {f.name}
                </span>
              </button>
            ))}
          </div>
        )}

        <div style={pe.actions}>
          <button style={pe.cancelBtn} onClick={onCancel}>{tr.cancel}</button>
          <button style={pe.applyBtn} onClick={handleApply} disabled={applying}>
            {applying ? tr.peApplying : tr.peUsePhoto}
          </button>
        </div>
      </div>
    </div>
  );
}

function SliderRow({ label, value, onChange, min = 50, max = 150 }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", fontFamily: FONT }}>{label}</span>
        <span style={{ fontSize: 12, color: GOLD, fontFamily: FONT }}>{value}%</span>
      </div>
      <input type="range" min={min} max={max} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: GOLD }} />
    </div>
  );
}

function WarmthRow({ label, value, onChange, min = -60, max = 60, tr }) {
  const display = value === 0 ? tr.peNeutral : value < 0 ? `${tr.peWarm} ${Math.abs(value)}` : `${tr.peCool} ${value}`;
  const color   = value < 0 ? "#F4A261" : value > 0 ? "#74B9FF" : GOLD;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", fontFamily: FONT }}>{label}</span>
        <span style={{ fontSize: 12, color, fontFamily: FONT }}>{display}</span>
      </div>
      <input type="range" min={min} max={max} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: color }} />
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
        <span style={{ fontSize: 10, color: "#F4A261", fontFamily: FONT }}>🌅 {tr.peWarm}</span>
        <span style={{ fontSize: 10, color: "#74B9FF", fontFamily: FONT }}>❄️ {tr.peCool}</span>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Memoera ID = the actual account-creation date (DDMMYYYY) + account number,
// e.g. 0507202601, 06082026115 — never today's date, always the day the
// account was created. Uses UTC date parts (the server stores/sends UTC
// timestamps) so the date doesn't shift by a day depending on the viewer's
// local timezone.
function formatMemoeraId(user) {
  if (!user?.id) return "";
  const seq = String(user.id).padStart(2, "0");
  if (!user.createdAt) return seq;
  const d = new Date(user.createdAt);
  if (Number.isNaN(d.getTime())) return seq;
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}${mm}${yyyy}${seq}`;
}

function blobToBase64(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(",")[1]);
    reader.readAsDataURL(blob);
  });
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = {
  screen: {
    position: "fixed", inset: 0,
    background: "linear-gradient(160deg, #061A1F 0%, #0A2229 50%, #061820 100%)",
    display: "flex", flexDirection: "column", alignItems: "center",
    fontFamily: FONT, padding: "96px 20px 40px", overflowY: "auto",
  },
  backBtn: {
    position: "fixed", top: 48, left: 16, background: "transparent", border: "none",
    color: "rgba(255,255,255,0.6)", fontSize: 14, fontWeight: 600, fontFamily: FONT,
    cursor: "pointer", padding: "6px 4px", zIndex: 2,
  },
  avatarWrap: { marginBottom: 12, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center" },
  hexOuter: {
    width: 120, height: 120,
    background: `linear-gradient(135deg,${GOLD},#fff8dc)`,
    clipPath: "polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%)",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  hexInner: {
    width: 108, height: 108, background: "#1a3f7a",
    clipPath: "polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%)",
    display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  profileImg:    { width: "100%", height: "100%", objectFit: "cover" },
  initials:      { fontSize: 36, fontWeight: 700, color: "#fff", fontFamily: FONT },
  editPhotoHint: { fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 6, fontFamily: FONT },
  name:          { fontSize: 22, fontWeight: 700, color: "#fff", letterSpacing: "1px", marginBottom: 8, textAlign: "center" },
  divider:       { width: "100%", height: 1, background: "rgba(255,255,255,0.25)", margin: "6px 0" },
  fieldLabel:    { fontSize: 11, fontWeight: 600, fontFamily: FONT, letterSpacing: "0.06em", textTransform: "uppercase", width: "100%", margin: "0 0 4px", textAlign: "left" },
  fieldErrorText:{ fontSize: 11, fontWeight: 600, color: "#FF6B6B", fontFamily: FONT, width: "100%", margin: "-4px 0 8px", textAlign: "left" },
  field:         { fontSize: 14, color: "rgba(255,255,255,0.85)", fontFamily: FONT, padding: "6px 0", textAlign: "center" },
  editInput: {
    background: "rgba(255,255,255,0.07)", border: "none",
    borderBottom: "1.5px solid rgba(201,168,76,0.5)", borderRadius: "6px 6px 0 0",
    padding: "10px 14px", fontSize: 14, fontFamily: FONT, color: "#fff",
    outline: "none", width: "100%", marginBottom: 8, textAlign: "center", boxSizing: "border-box",
  },
  buttonRow:  { display: "flex", gap: 16, marginTop: 24 },
  editBtn: {
    background: "transparent", border: "2px solid rgba(255,255,255,0.5)",
    borderRadius: 8, color: "#fff", fontSize: 14, fontWeight: 700,
    fontFamily: FONT, padding: "10px 32px", cursor: "pointer",
  },
  doneBtn: {
    background: GOLD, border: "none", borderRadius: 8,
    color: "#fff", fontSize: 14, fontWeight: 700,
    fontFamily: FONT, padding: "10px 32px", cursor: "pointer",
  },
  pickerBackdrop: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", zIndex: 100 },
  pickerSheet: {
    position: "fixed", bottom: 0, left: 0, right: 0,
    background: "#0E1628", border: "1px solid rgba(201,168,76,0.2)",
    borderBottom: "none", borderRadius: "24px 24px 0 0",
    padding: "12px 20px 40px", zIndex: 101,
    display: "flex", flexDirection: "column", gap: 10,
  },
  pickerHandle:    { width: 40, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.2)", alignSelf: "center", marginBottom: 8 },
  pickerTitle:     { fontSize: 15, fontWeight: 600, fontFamily: FONT, color: "rgba(255,255,255,0.7)", textAlign: "center", margin: "0 0 8px" },
  pickerBtn: {
    background: "rgba(201,168,76,0.08)", border: "1px solid rgba(201,168,76,0.25)",
    borderRadius: 14, padding: "14px 18px", cursor: "pointer",
    fontSize: 15, fontFamily: FONT, color: "#fff", textAlign: "left",
  },
  pickerCancelBtn: {
    marginTop: 4, background: "transparent", border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 14, padding: 14, color: "rgba(255,255,255,0.4)",
    fontSize: 15, fontFamily: FONT, cursor: "pointer",
  },
};

const pe = {
  backdrop: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" },
  sheet: {
    width: "100%", maxWidth: 420,
    background: "#0E1628", borderRadius: "24px 24px 0 0",
    padding: "20px 20px 40px", display: "flex", flexDirection: "column", alignItems: "center",
  },
  title:     { fontSize: 17, fontWeight: 700, color: "#fff", fontFamily: FONT, margin: "0 0 14px" },
  tabs:      { display: "flex", gap: 8, marginBottom: 16 },
  tab: {
    background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 20, padding: "7px 16px", fontSize: 12, fontFamily: FONT,
    color: "rgba(255,255,255,0.55)", cursor: "pointer",
  },
  tabActive: { background: `rgba(201,168,76,0.18)`, borderColor: GOLD, color: GOLD },
  viewBox:   { overflow: "hidden", borderRadius: 12, background: "#000", position: "relative", cursor: "grab", flexShrink: 0 },
  gridSvg:   { position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" },
  hint:      { fontSize: 11, color: "rgba(255,255,255,0.35)", fontFamily: FONT, margin: "8px 0 0", textAlign: "center" },
  editPanel: { width: "100%", padding: "16px 8px 4px" },
  filterRow: { display: "flex", gap: 8, marginTop: 14, overflowX: "auto", width: "100%", paddingBottom: 4 },
  filterBtn: {
    display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
    background: "transparent", border: "2px solid transparent",
    borderRadius: 10, padding: "4px", cursor: "pointer", flexShrink: 0,
  },
  filterThumb: { width: 56, height: 56, borderRadius: 8, backgroundSize: "cover", backgroundPosition: "center" },
  filterName: { fontSize: 10, fontFamily: FONT },
  actions:   { display: "flex", gap: 12, marginTop: 20, width: "100%" },
  cancelBtn: {
    flex: 1, background: "transparent", border: "1.5px solid rgba(255,255,255,0.2)",
    borderRadius: 12, color: "rgba(255,255,255,0.6)", fontSize: 15, fontFamily: FONT,
    padding: "13px 0", cursor: "pointer",
  },
  applyBtn: {
    flex: 2, background: GOLD, border: "none", borderRadius: 12,
    color: "#fff", fontSize: 15, fontWeight: 700, fontFamily: FONT,
    padding: "13px 0", cursor: "pointer",
  },
};
