import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { API_BASE } from "../config/api.js";
import CameraCapture from "./CameraCapture.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { useLanguage } from "../context/LanguageContext.jsx";

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const GOLD = "#C9A84C";
const TEAL = "#00C9A7";
const DANGER = "#FF6B6B";

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

const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: "Bearer " + (localStorage.getItem("memoera_token") || ""),
});

export default function ProfileScreen({ user, onBack, onUserUpdate, onSwitchToBusiness, onGallery }) {
  const { colors, theme } = useTheme();
  const { tr, lang } = useLanguage();

  // ── Server-truth profile. `user` from App.jsx is the cached login payload and
  // lacks the verification/business fields, so /api/me is the source of record
  // for everything this screen renders.
  const [me, setMe] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [activity, setActivity] = useState([]);
  const [toast, setToast] = useState("");
  const [saving, setSaving] = useState(false);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }, []);

  // App.jsx passes onUserUpdate as an inline arrow, so it's a new function every
  // render. Holding it in a ref keeps refreshMe's identity stable — otherwise the
  // mount effect below would re-fire on every render and loop forever, since
  // refreshMe itself triggers a re-render through onUserUpdate.
  const onUserUpdateRef = useRef(onUserUpdate);
  useEffect(() => { onUserUpdateRef.current = onUserUpdate; }, [onUserUpdate]);

  const refreshMe = useCallback(async () => {
    try {
      const res = await fetch(API_BASE + "/api/me", { headers: authHeaders() });
      if (!res.ok) { setLoadError("Couldn't load your profile."); return null; }
      const fresh = await res.json();
      setMe(fresh);
      onUserUpdateRef.current?.(fresh);
      return fresh;
    } catch {
      setLoadError("Couldn't reach the server.");
      return null;
    }
  }, []);

  useEffect(() => { refreshMe(); }, [refreshMe]);

  useEffect(() => {
    fetch(API_BASE + "/api/auth/login-activity", { headers: authHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.activity) setActivity(d.activity); })
      .catch(() => {});
  }, []);

  // Editable drafts, seeded from server truth each time a section opens.
  const [editPersonal, setEditPersonal] = useState(false);
  const [editBusiness, setEditBusiness] = useState(false);
  const [editPrefs, setEditPrefs] = useState(false);
  const [form, setForm] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    if (!me) return;
    setForm({
      firstName: me.firstName || "", lastName: me.lastName || "",
      dateOfBirth: me.dateOfBirth || "", email: me.email || "",
      businessName: me.businessName || "", businessCategory: me.businessCategory || "",
      businessWebsite: me.businessWebsite || "", businessAddress: me.businessAddress || "",
      businessHours: me.businessHours || "", businessGstin: me.businessGstin || "",
      businessPhone: me.businessPhone || "", businessEmail: me.businessEmail || "",
      businessInstagram: me.businessInstagram || "",
      notifyEmail: !!me.notifyEmail, notifyMarketing: !!me.notifyMarketing,
    });
  }, [me]);

  const dirty = useMemo(() => {
    if (!me || !form) return false;
    return form.firstName !== (me.firstName || "") || form.lastName !== (me.lastName || "")
      || form.dateOfBirth !== (me.dateOfBirth || "") || form.email !== (me.email || "")
      || form.businessName !== (me.businessName || "") || form.businessCategory !== (me.businessCategory || "")
      || form.businessWebsite !== (me.businessWebsite || "") || form.businessAddress !== (me.businessAddress || "")
      || form.businessHours !== (me.businessHours || "") || form.businessGstin !== (me.businessGstin || "")
      || form.notifyEmail !== !!me.notifyEmail || form.notifyMarketing !== !!me.notifyMarketing;
  }, [me, form]);

  // ── Photo upload (unchanged flow, restyled trigger) ─────────────────────────
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [editorFile, setEditorFile] = useState(null);
  const galleryInputRef = useRef(null);

  const openEditor = useCallback((file) => {
    if (!file) return;
    setShowPhotoPicker(false);
    setShowCamera(false);
    setEditorFile(file);
  }, []);

  const handleEditorApply = useCallback(async (blob) => {
    setEditorFile(null);
    setPhotoUploading(true);
    try {
      const base64 = await blobToBase64(blob);
      const res = await fetch(API_BASE + "/api/auth/profile/photo", {
        method: "PUT", headers: authHeaders(), body: JSON.stringify({ imageBase64: base64 }),
      });
      if (!res.ok) { showToast("Couldn't upload that photo."); return; }
      await refreshMe();
      showToast("Profile photo updated.");
    } catch {
      showToast("Couldn't upload that photo.");
    } finally {
      setPhotoUploading(false);
    }
  }, [refreshMe, showToast]);

  const isBusiness = me?.accountType === "business";

  // ── Save ────────────────────────────────────────────────────────────────────
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

  const handleSave = useCallback(async () => {
    if (!form) return;
    const errors = {};
    if (!form.firstName.trim()) errors.firstName = "First name is required";
    if (!form.lastName.trim()) errors.lastName = "Last name is required";
    if (form.email.trim() && !EMAIL_RE.test(form.email.trim())) errors.email = "Enter a valid email address";
    setFieldErrors(errors);
    if (Object.keys(errors).length) { showToast("Please fix the highlighted fields."); return; }

    setSaving(true);
    try {
      const profileRes = await fetch(API_BASE + "/api/auth/profile", {
        method: "PUT", headers: authHeaders(),
        body: JSON.stringify({
          firstName: form.firstName, lastName: form.lastName,
          dateOfBirth: form.dateOfBirth, email: form.email,
        }),
      });
      if (!profileRes.ok) {
        const e = await profileRes.json().catch(() => ({}));
        showToast(e.error || "Couldn't save your profile."); return;
      }

      if (isBusiness) {
        const bizRes = await fetch(API_BASE + "/api/business/details", {
          method: "PUT", headers: authHeaders(),
          body: JSON.stringify({
            businessName: form.businessName, businessAddress: form.businessAddress,
            phone: form.businessPhone, email: form.businessEmail,
            website: form.businessWebsite, instagram: form.businessInstagram,
            gstin: form.businessGstin, category: form.businessCategory, hours: form.businessHours,
          }),
        });
        if (!bizRes.ok) { showToast("Couldn't save your business details."); return; }
      }

      const prefRes = await fetch(API_BASE + "/api/preferences", {
        method: "PUT", headers: authHeaders(),
        body: JSON.stringify({ notifyEmail: form.notifyEmail, notifyMarketing: form.notifyMarketing }),
      });
      if (!prefRes.ok) { showToast("Couldn't save your preferences."); return; }

      await refreshMe();
      setEditPersonal(false); setEditBusiness(false); setEditPrefs(false);
      showToast("Changes saved.");
    } catch {
      showToast("Network error — please try again.");
    } finally {
      setSaving(false);
    }
  }, [form, isBusiness, refreshMe, showToast]);

  // ── Derived: profile score & completion ─────────────────────────────────────
  const { score, completion, missing } = useMemo(() => computeScore(me, isBusiness), [me, isBusiness]);

  if (!me) {
    return (
      <div style={{ ...st.screen, background: colors.bg, alignItems: "center", justifyContent: "center" }}>
        <button onClick={onBack} style={{ ...st.backBtn, color: colors.textMuted }}>← {tr.back}</button>
        <div style={{ color: colors.textMuted, fontFamily: FONT, fontSize: 14 }}>
          {loadError || "Loading your profile…"}
        </div>
      </div>
    );
  }

  const fullName = `${me.firstName || ""} ${me.lastName || ""}`.trim() || "Your profile";
  const handle = "@" + (me.firstName || "user").toLowerCase().replace(/[^a-z0-9]/g, "");

  return (
    <div className="prf-screen" style={{ ...st.screen, background: colors.bg }}>
      <style>{profileCss(colors)}</style>

      {showCamera && (
        <CameraCapture facingMode="user"
          onCapture={(file) => { setShowCamera(false); openEditor(file); }}
          onClose={() => setShowCamera(false)} />
      )}
      {editorFile && (
        <PhotoEditorModal file={editorFile} onApply={handleEditorApply}
          onCancel={() => setEditorFile(null)} tr={tr} />
      )}
      {showPhotoPicker && (
        <div>
          <div style={st.pickerBackdrop} onClick={() => setShowPhotoPicker(false)} />
          <div style={{ ...st.pickerSheet, background: colors.bgSolid }}>
            <div style={st.pickerHandle} />
            <p style={{ ...st.pickerTitle, color: colors.text }}>{tr.prfProfilePhoto}</p>
            <button style={{ ...st.pickerBtn, color: colors.text }}
              onClick={() => { setShowPhotoPicker(false); setShowCamera(true); }}>📷  {tr.prfCamera}</button>
            <button style={{ ...st.pickerBtn, color: colors.text }}
              onClick={() => { setShowPhotoPicker(false); galleryInputRef.current?.click(); }}>🖼️  {tr.prfGallery}</button>
            <button style={{ ...st.pickerCancelBtn, color: colors.textMuted }}
              onClick={() => setShowPhotoPicker(false)}>{tr.cancel}</button>
          </div>
        </div>
      )}
      <input ref={galleryInputRef} type="file" accept="image/*" style={{ display: "none" }}
        onChange={(e) => openEditor(e.target.files?.[0])}
        onClick={(e) => { e.target.value = ""; }} />

      <div className="prf-shell">
        {/* ── Sidebar ── */}
        <aside className="prf-sidebar">
          <button onClick={onBack} className="prf-navitem" style={{ color: colors.textMuted }}>
            <BackIcon /> <span>Back</span>
          </button>
          <div className="prf-navitem prf-navitem--active">
            <PersonIcon color={TEAL} /> <span>Profile</span>
          </div>
          {onGallery && (
            <button onClick={onGallery} className="prf-navitem" style={{ color: colors.text }}>
              <BrochureIcon color={colors.text} /> <span>My Brochures</span>
            </button>
          )}
          <button onClick={() => setEditPrefs(true)} className="prf-navitem" style={{ color: colors.text }}>
            <BellIcon color={colors.text} /> <span>Notifications</span>
          </button>
        </aside>

        {/* ── Main column ── */}
        <main className="prf-main">

          {/* Identity header + score cards */}
          <section className="prf-hero">
            <div className="prf-hero-id">
              <div style={{ position: "relative", flexShrink: 0 }}>
                <div style={st.avatarRing}>
                  {me.profilePhotoUrl
                    ? <img src={me.profilePhotoUrl} alt="" style={st.avatarImg} />
                    : <span style={st.avatarInitials}>{initialsOf(me)}</span>}
                </div>
                <button onClick={() => !photoUploading && setShowPhotoPicker(true)}
                  aria-label="Change profile photo" style={st.avatarCam}>
                  {photoUploading ? "…" : <CameraIcon />}
                </button>
              </div>

              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <h1 style={{ ...st.name, color: colors.text }}>{fullName}</h1>
                  {isBusiness && <VerifiedBadge />}
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                  {isBusiness
                    ? <>
                        <span style={st.chipGold}>Verified Business</span>
                        <span style={{ ...st.chipPlain, color: colors.text, borderColor: colors.border }}>Business Account</span>
                      </>
                    : <span style={{ ...st.chipPlain, color: colors.text, borderColor: colors.border }}>Individual Account</span>}
                </div>

                <div style={{ ...st.handle, color: colors.textMuted }}>{handle}</div>

                <div style={{ ...st.metaLabel, color: colors.textMuted }}>MEMOERA ID</div>
                <div style={{ ...st.idBox, borderColor: colors.border }}>
                  <span style={{ ...st.idText, color: colors.text }}>{formatMemoeraId(me)}</span>
                  <button aria-label="Copy Memoera ID" style={{ ...st.idCopy, color: colors.textMuted }}
                    onClick={() => {
                      navigator.clipboard?.writeText(formatMemoeraId(me))
                        .then(() => showToast("Memoera ID copied."))
                        .catch(() => showToast("Couldn't copy."));
                    }}><CopyIcon /></button>
                </div>

                <div style={{ ...st.dates, color: colors.textMuted }}>
                  <span><CalendarIcon /> Member since: {formatDate(me.createdAt)}</span>
                </div>
              </div>
            </div>

            <div className="prf-hero-cards">
              <div style={{ ...st.card, ...st.scoreCard, background: colors.surface, borderColor: colors.border }}>
                <div style={{ ...st.cardEyebrow, color: colors.textMuted }}>PROFILE SCORE</div>
                <ScoreRing value={score} />
                <div style={{ ...st.scoreCaption, color: colors.textMuted }}>
                  {score >= 80 ? "Great! Your profile looks good."
                    : score >= 50 ? "Good start — a few things left."
                    : "Add more detail to build trust."}
                </div>
              </div>

              <div style={{ ...st.card, background: colors.surface, borderColor: colors.border, padding: 18 }}>
                <div style={{ ...st.cardEyebrow, color: colors.textMuted }}>PROFILE COMPLETION</div>
                <div style={{ ...st.bigPct, color: colors.text }}>{completion}%</div>
                <div style={st.barTrack}>
                  <div style={{ ...st.barFill, width: `${completion}%` }} />
                </div>
                <div style={{ ...st.scoreCaption, color: colors.textMuted, textAlign: "left", marginTop: 12 }}>
                  {missing.length
                    ? `Next: ${missing[0]}`
                    : "Everything's filled in — nice work."}
                </div>
                {missing.length > 0 && (
                  <button onClick={() => { setEditPersonal(true); setEditBusiness(isBusiness); }}
                    style={st.linkBtn}>Complete Now →</button>
                )}
              </div>
            </div>
          </section>

          {/* Personal Information */}
          <SectionCard colors={colors} icon={<PersonIcon color={TEAL} />} title="Personal Information"
            action={
              <button style={st.editBtn} onClick={() => setEditPersonal(v => !v)}>
                <PencilIcon /> {editPersonal ? "Done" : "Edit"}
              </button>
            }>
            {editPersonal && form ? (
              <div className="prf-formgrid">
                <Field label="First Name" required error={fieldErrors.firstName} colors={colors}>
                  <input style={inputStyle(colors, fieldErrors.firstName)} value={form.firstName}
                    onChange={(e) => setForm(f => ({ ...f, firstName: e.target.value }))} />
                </Field>
                <Field label="Last Name" required error={fieldErrors.lastName} colors={colors}>
                  <input style={inputStyle(colors, fieldErrors.lastName)} value={form.lastName}
                    onChange={(e) => setForm(f => ({ ...f, lastName: e.target.value }))} />
                </Field>
                <Field label="Date of Birth" colors={colors}>
                  <input type="date" style={inputStyle(colors)} value={form.dateOfBirth}
                    onChange={(e) => setForm(f => ({ ...f, dateOfBirth: e.target.value }))} />
                </Field>
                <Field label="Email Address" error={fieldErrors.email} colors={colors}>
                  <input type="email" style={inputStyle(colors, fieldErrors.email)} value={form.email}
                    onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} />
                </Field>
              </div>
            ) : (
              <>
                <InfoRow colors={colors} label="Full Name" value={fullName} />
                <InfoRow colors={colors} label="Date of Birth" value={formatDob(me.dateOfBirth)} />
                <InfoRow colors={colors} label="Mobile Number" value={me.mobile}
                  tag={<span style={st.tagOk}>Verified</span>} />
                <InfoRow colors={colors} label="Email Address" value={me.email || "Not set"}
                  tag={me.email
                    ? (me.emailVerified
                        ? <span style={st.tagOk}>Verified</span>
                        : <span style={st.tagWarn}>Not Verified</span>)
                    : null}
                  action={me.email && !me.emailVerified
                    ? <EmailVerifyFlow onDone={refreshMe} showToast={showToast} colors={colors} />
                    : null} />
              </>
            )}
          </SectionCard>

          {/* Account Type — the only place an Individual can upgrade to a
              Business account, which is what unlocks the Seller Dashboard and
              product listings. */}
          <SectionCard colors={colors} icon={<BuildingIcon color={TEAL} />} title="Account Type">
            <div style={st.acctRow}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ ...st.acctCurrent, color: colors.text }}>
                  {isBusiness ? "Business Account" : "Individual Account"}
                </div>
                <div style={{ ...st.secSub, color: colors.textMuted, marginTop: 4 }}>
                  {isBusiness
                    ? "You can publish product listings and appear to buyers who tap Buy Now on your scanned products."
                    : "Switch to a Business account to list products, set prices and let buyers contact you directly from a scan."}
                </div>
              </div>
              {!isBusiness && onSwitchToBusiness && (
                <button onClick={onSwitchToBusiness} style={st.switchBtn}>
                  Switch to Business →
                </button>
              )}
            </div>
          </SectionCard>

          {/* Business Information — business accounts only */}
          {isBusiness && (
            <SectionCard colors={colors} icon={<BuildingIcon color={TEAL} />} title="Business Information"
              action={
                <button style={st.editBtn} onClick={() => setEditBusiness(v => !v)}>
                  <PencilIcon /> {editBusiness ? "Done" : "Edit"}
                </button>
              }>
              {editBusiness && form ? (
                <div className="prf-formgrid">
                  <Field label="Business Name" colors={colors}>
                    <input style={inputStyle(colors)} value={form.businessName}
                      onChange={(e) => setForm(f => ({ ...f, businessName: e.target.value }))} />
                  </Field>
                  <Field label="Business Address" colors={colors}>
                    <input style={inputStyle(colors)} value={form.businessAddress}
                      onChange={(e) => setForm(f => ({ ...f, businessAddress: e.target.value }))} />
                  </Field>
                  <Field label="Business Category" colors={colors}>
                    <input style={inputStyle(colors)} placeholder="e.g. Technology / Digital Services"
                      value={form.businessCategory}
                      onChange={(e) => setForm(f => ({ ...f, businessCategory: e.target.value }))} />
                  </Field>
                  <Field label="Business Hours" colors={colors}>
                    <input style={inputStyle(colors)} placeholder="e.g. Mon - Sat : 10:00 AM - 7:00 PM"
                      value={form.businessHours}
                      onChange={(e) => setForm(f => ({ ...f, businessHours: e.target.value }))} />
                  </Field>
                  <Field label="Website" colors={colors}>
                    <input style={inputStyle(colors)} placeholder="https://" value={form.businessWebsite}
                      onChange={(e) => setForm(f => ({ ...f, businessWebsite: e.target.value }))} />
                  </Field>
                  <Field label="GSTIN (Optional)" colors={colors}>
                    <input style={inputStyle(colors)} value={form.businessGstin}
                      onChange={(e) => setForm(f => ({ ...f, businessGstin: e.target.value }))} />
                  </Field>
                </div>
              ) : (
                <div className="prf-formgrid">
                  <InfoRow colors={colors} label="Business Name" value={me.businessName || "Not set"} />
                  <InfoRow colors={colors} label="Business Address" value={me.businessAddress || "Not set"} />
                  <InfoRow colors={colors} label="Business Category" value={me.businessCategory || "Not set"} />
                  <InfoRow colors={colors} label="Business Hours" value={me.businessHours || "Not set"} />
                  <InfoRow colors={colors} label="Website" value={me.businessWebsite || "Not set"} link={me.businessWebsite} />
                  <InfoRow colors={colors} label="GSTIN (Optional)" value={me.businessGstin || "Not set"} />
                </div>
              )}
            </SectionCard>
          )}

          {/* Security & Login */}
          <SectionCard colors={colors} icon={<ShieldIcon color={TEAL} />} title="Security &amp; Login">
            <div className="prf-2col">
              <div>
                <SecurityRow colors={colors} title="Mobile Verified" sub="Your mobile number is verified"
                  right={<CheckCircle />} />

                <SecurityRow colors={colors} title="Email Verification"
                  sub={me.emailVerified ? "Your email address is verified"
                    : me.email ? "Verify your email to secure your account"
                    : "Add an email address above first"}
                  right={me.emailVerified ? <CheckCircle />
                    : me.email ? <EmailVerifyFlow onDone={refreshMe} showToast={showToast} colors={colors} />
                    : <span style={{ ...st.tagMuted, color: colors.textMuted }}>No email</span>} />

                <SecurityQuestionRow me={me} colors={colors} onDone={refreshMe} showToast={showToast} />

                <TwoFactorRow me={me} colors={colors} onDone={refreshMe} showToast={showToast} />
              </div>

              <div>
                <div style={{ ...st.subhead, color: colors.text }}>Recent Login Activity</div>
                {activity.length === 0 ? (
                  <div style={{ ...st.emptyNote, color: colors.textMuted }}>
                    No sign-ins recorded yet. New sign-ins will appear here.
                  </div>
                ) : activity.map((a, i) => (
                  <div key={i} style={{ ...st.activityRow, borderColor: colors.border }}>
                    <span style={{ ...st.activityDot, background: i === 0 ? TEAL : colors.textMuted }} />
                    {a.isMobile ? <PhoneIcon color={colors.textMuted} /> : <LaptopIcon color={colors.textMuted} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ ...st.activityTitle, color: colors.text }}>{a.browser} on {a.platform}</div>
                    </div>
                    <span style={{ ...st.activityTime, color: i === 0 ? TEAL : colors.textMuted }}>
                      {i === 0 ? "Most recent" : timeAgo(a.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>

          {/* Preferences + Connected Accounts */}
          <div className="prf-2col prf-2col--gap">
            <SectionCard colors={colors} icon={<GearIcon color={TEAL} />} title="Preferences"
              action={
                <button style={st.editBtn} onClick={() => setEditPrefs(v => !v)}>
                  <PencilIcon /> {editPrefs ? "Done" : "Edit"}
                </button>
              }>
              <div className="prf-prefgrid">
                <div>
                  <div style={{ ...st.prefLabel, color: colors.textMuted }}>Language</div>
                  <div style={{ ...st.prefValue, color: colors.text }}>{(lang || "en").toUpperCase()}</div>
                </div>
                <div>
                  <div style={{ ...st.prefLabel, color: colors.textMuted }}>Theme</div>
                  <div style={{ ...st.prefValue, color: colors.text, textTransform: "capitalize" }}>{theme}</div>
                </div>
                <div>
                  <div style={{ ...st.prefLabel, color: colors.textMuted }}>Email Notifications</div>
                  {editPrefs && form
                    ? <Toggle on={form.notifyEmail} onChange={(v) => setForm(f => ({ ...f, notifyEmail: v }))} />
                    : <div style={{ ...st.prefValue, color: me.notifyEmail ? TEAL : colors.textMuted }}>
                        {me.notifyEmail ? "Enabled" : "Disabled"}
                      </div>}
                </div>
                <div>
                  <div style={{ ...st.prefLabel, color: colors.textMuted }}>Marketing Emails</div>
                  {editPrefs && form
                    ? <Toggle on={form.notifyMarketing} onChange={(v) => setForm(f => ({ ...f, notifyMarketing: v }))} />
                    : <div style={{ ...st.prefValue, color: me.notifyMarketing ? TEAL : colors.textMuted }}>
                        {me.notifyMarketing ? "Enabled" : "Disabled"}
                      </div>}
                </div>
              </div>
            </SectionCard>

            <SectionCard colors={colors} icon={<LinkIcon color={TEAL} />} title="Connected Accounts">
              <div className="prf-connected">
                <ConnectedAccount label="WhatsApp" emoji="💬" tint="#25D366"
                  connected={!!me.businessPhone} colors={colors}
                  note={me.businessPhone ? "Buyers can reach you" : "Add a business phone"} />
                <ConnectedAccount label="Instagram" emoji="📷" tint="#E1306C"
                  connected={!!me.businessInstagram} colors={colors}
                  note={me.businessInstagram || "Not linked"} />
                <ConnectedAccount label="Google" emoji="🔍" tint="#4285F4"
                  connected={false} colors={colors} note="Sign-in not set up" />
                <ConnectedAccount label="Facebook" emoji="👥" tint="#1877F2"
                  connected={false} colors={colors} note="Sign-in not set up" />
              </div>
              <div style={{ ...st.emptyNote, color: colors.textMuted, marginTop: 12 }}>
                WhatsApp and Instagram come from your business details. Google and
                Facebook sign-in aren't available yet.
              </div>
            </SectionCard>
          </div>

          <div style={{ height: 92 }} />
        </main>
      </div>

      {/* Sticky action bar */}
      <div className="prf-actionbar" style={{ background: colors.bgSolid, borderColor: colors.border }}>
        <button onClick={onBack} style={{ ...st.cancelBtn, color: colors.text, borderColor: colors.border }}>
          <CancelIcon /> Cancel
        </button>
        <button onClick={handleSave} disabled={saving || !dirty} style={{ ...st.saveBtn, opacity: saving || !dirty ? 0.5 : 1 }}>
          <SaveIcon /> {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>

      {toast && (
        <div style={{ ...st.toast, background: colors.bgSolid, borderColor: colors.border, color: colors.text }}>
          {toast}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function SectionCard({ colors, icon, title, action, children }) {
  return (
    <section style={{ ...st.card, background: colors.surface, borderColor: colors.border, padding: "18px 20px", marginTop: 16 }}>
      <div style={st.sectionHead}>
        <span style={st.sectionIcon}>{icon}</span>
        <h2 style={{ ...st.sectionTitle, color: colors.text }}>{title}</h2>
        {action && <div style={{ marginLeft: "auto" }}>{action}</div>}
      </div>
      {children}
    </section>
  );
}

function InfoRow({ colors, label, value, tag, action, link }) {
  return (
    <div style={{ ...st.infoRow, borderColor: colors.border }}>
      <span style={{ ...st.infoLabel, color: colors.textMuted }}>{label}</span>
      <span style={{ ...st.infoValue, color: link ? TEAL : colors.text }}>
        {link
          ? <a href={link} target="_blank" rel="noopener noreferrer" style={{ color: TEAL, textDecoration: "none" }}>{value}</a>
          : value}
      </span>
      {tag}
      {action && <div style={{ marginLeft: "auto" }}>{action}</div>}
    </div>
  );
}

function Field({ label, required, error, colors, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ ...st.fieldLabel, color: colors.textMuted }}>{label}{required ? " *" : ""}</div>
      {children}
      {error && <div style={st.fieldError}>⚠ {error}</div>}
    </div>
  );
}

function SecurityRow({ colors, title, sub, right }) {
  return (
    <div style={{ ...st.secRow, borderColor: colors.border }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...st.secTitle, color: colors.text }}>{title}</div>
        <div style={{ ...st.secSub, color: colors.textMuted }}>{sub}</div>
      </div>
      <div style={{ flexShrink: 0 }}>{right}</div>
    </div>
  );
}

// Sends a code to the user's saved email, then swaps to a 6-digit input.
function EmailVerifyFlow({ onDone, showToast, colors }) {
  const [stage, setStage] = useState("idle"); // idle | sending | entering | verifying
  const [code, setCode] = useState("");

  const send = async () => {
    setStage("sending");
    try {
      const res = await fetch(API_BASE + "/api/auth/email/send-code", { method: "POST", headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data.error || "Couldn't send the code."); setStage("idle"); return; }
      showToast("Code sent — check your inbox.");
      setStage("entering");
    } catch { showToast("Network error."); setStage("idle"); }
  };

  const verify = async () => {
    setStage("verifying");
    try {
      const res = await fetch(API_BASE + "/api/auth/email/verify", {
        method: "POST", headers: authHeaders(), body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data.error || "Incorrect code."); setStage("entering"); return; }
      showToast("Email verified.");
      setCode(""); setStage("idle");
      onDone?.();
    } catch { showToast("Network error."); setStage("entering"); }
  };

  if (stage === "entering" || stage === "verifying") {
    return (
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="000000" inputMode="numeric"
          style={{ ...inputStyle(colors), width: 90, textAlign: "center", letterSpacing: "0.18em", padding: "8px 6px" }} />
        <button onClick={verify} disabled={code.length !== 6 || stage === "verifying"} style={st.tagBtnGold}>
          {stage === "verifying" ? "…" : "Confirm"}
        </button>
      </div>
    );
  }
  return (
    <button onClick={send} disabled={stage === "sending"} style={st.tagBtnGold}>
      {stage === "sending" ? "Sending…" : "Verify Now"}
    </button>
  );
}

function SecurityQuestionRow({ me, colors, onDone, showToast }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState(me.securityQuestion || SECURITY_QUESTIONS[0]);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!answer.trim()) { showToast("Enter an answer."); return; }
    setBusy(true);
    try {
      const res = await fetch(API_BASE + "/api/auth/security-question", {
        method: "PUT", headers: authHeaders(),
        body: JSON.stringify({ securityQuestion: question, securityAnswer: answer.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data.error || "Couldn't save."); return; }
      showToast("Security question saved.");
      setAnswer(""); setOpen(false);
      onDone?.();
    } catch { showToast("Network error."); } finally { setBusy(false); }
  };

  return (
    <>
      <SecurityRow colors={colors} title="Security Question"
        sub={me.securityQuestion || "Set a security question for account recovery"}
        right={<button onClick={() => setOpen(o => !o)} style={st.tagBtnTeal}>
          {open ? "Close" : me.securityQuestion ? "Update" : "Set Up"}
        </button>} />
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "4px 0 14px" }}>
          <select value={question} onChange={(e) => setQuestion(e.target.value)} style={inputStyle(colors)}>
            {SECURITY_QUESTIONS.map(q => <option key={q} value={q} style={{ background: colors.bgSolid, color: colors.text }}>{q}</option>)}
          </select>
          <input value={answer} onChange={(e) => setAnswer(e.target.value)}
            placeholder="Your answer" style={inputStyle(colors)} />
          <button onClick={save} disabled={busy} style={{ ...st.tagBtnTeal, alignSelf: "flex-start" }}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </>
  );
}

// TOTP setup: POST creates a secret, the user adds it to their authenticator,
// then PUT with a generated code switches it on.
function TwoFactorRow({ me, colors, onDone, showToast }) {
  const [setup, setSetup] = useState(null); // { secret, otpauthUrl }
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    try {
      const res = await fetch(API_BASE + "/api/auth/2fa", { method: "POST", headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data.error || "Couldn't start setup."); return; }
      setSetup(data);
    } catch { showToast("Network error."); } finally { setBusy(false); }
  };

  const enable = async () => {
    setBusy(true);
    try {
      const res = await fetch(API_BASE + "/api/auth/2fa", {
        method: "PUT", headers: authHeaders(), body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data.error || "That code didn't match."); return; }
      showToast("Two-factor authentication enabled.");
      setSetup(null); setCode(""); onDone?.();
    } catch { showToast("Network error."); } finally { setBusy(false); }
  };

  const disable = async () => {
    if (!window.confirm("Turn off two-factor authentication?")) return;
    setBusy(true);
    try {
      const res = await fetch(API_BASE + "/api/auth/2fa", { method: "DELETE", headers: authHeaders() });
      if (!res.ok) { showToast("Couldn't disable 2FA."); return; }
      showToast("Two-factor authentication turned off.");
      onDone?.();
    } catch { showToast("Network error."); } finally { setBusy(false); }
  };

  return (
    <>
      <SecurityRow colors={colors} title="Two-Factor Authentication"
        sub={me.twoFactorEnabled ? "Enabled — codes from your authenticator app" : "Add an extra layer of security"}
        right={me.twoFactorEnabled
          ? <button onClick={disable} disabled={busy} style={{ ...st.tagBtnTeal, borderColor: DANGER, color: DANGER }}>Turn Off</button>
          : <button onClick={start} disabled={busy} style={st.tagBtnTeal}>{setup ? "Restart" : "Set Up"}</button>} />
      {setup && !me.twoFactorEnabled && (
        <div style={{ padding: "4px 0 14px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ ...st.secSub, color: colors.textMuted }}>
            Add this key to Google Authenticator (or any TOTP app), then enter the 6-digit code it shows.
          </div>
          <code style={{ ...st.secretBox, color: colors.text, borderColor: colors.border }}>{setup.secret}</code>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000" inputMode="numeric"
              style={{ ...inputStyle(colors), width: 110, textAlign: "center", letterSpacing: "0.18em" }} />
            <button onClick={enable} disabled={code.length !== 6 || busy} style={st.tagBtnTeal}>
              {busy ? "…" : "Enable"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function ConnectedAccount({ label, emoji, tint, connected, note, colors }) {
  return (
    <div style={st.connItem}>
      <div style={{ ...st.connCircle, background: connected ? tint : "transparent",
        border: connected ? "none" : `1.5px dashed ${colors.border}`, opacity: connected ? 1 : 0.55 }}>
        <span style={{ fontSize: 20, filter: connected ? "none" : "grayscale(1)" }}>{emoji}</span>
      </div>
      <div style={{ ...st.connLabel, color: colors.text }}>{label}</div>
      <div style={{ ...st.connStatus, color: connected ? TEAL : colors.textMuted }}>
        {connected ? "✓ Connected" : "Not connected"}
      </div>
      <div style={{ ...st.connNote, color: colors.textMuted }}>{note}</div>
    </div>
  );
}

function Toggle({ on, onChange }) {
  return (
    <button onClick={() => onChange(!on)} role="switch" aria-checked={on}
      style={{ ...st.toggle, background: on ? TEAL : "rgba(128,128,128,0.35)" }}>
      <span style={{ ...st.toggleKnob, transform: on ? "translateX(18px)" : "translateX(0)" }} />
    </button>
  );
}

function ScoreRing({ value }) {
  const R = 42, C = 2 * Math.PI * R;
  const dash = (Math.max(0, Math.min(100, value)) / 100) * C;
  return (
    <div style={{ position: "relative", width: 116, height: 116, margin: "6px auto 0" }}>
      <svg width="116" height="116" viewBox="0 0 116 116" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="58" cy="58" r={R} fill="none" stroke="rgba(128,128,128,0.22)" strokeWidth="9" />
        <circle cx="58" cy="58" r={R} fill="none" stroke="url(#prfScoreGrad)" strokeWidth="9"
          strokeLinecap="round" strokeDasharray={`${dash} ${C}`} />
        <defs>
          <linearGradient id="prfScoreGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={GOLD} />
            <stop offset="100%" stopColor={TEAL} />
          </linearGradient>
        </defs>
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ display: "flex", alignItems: "baseline", gap: 1 }}>
          <span style={{ fontFamily: FONT, fontSize: 30, fontWeight: 800, color: TEAL, lineHeight: 1 }}>{value}</span>
          <span style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600, color: "rgba(128,128,128,0.9)", lineHeight: 1 }}>/100</span>
        </span>
      </div>
    </div>
  );
}

// ── Icons ────────────────────────────────────────────────────────────────────
const sv = (p) => ({ width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", ...p });
function PersonIcon({ color = "#fff" }) { return <svg {...sv({ stroke: color })}><circle cx="12" cy="8" r="4" /><path d="M4 20c0-3.6 3.1-6 8-6s8 2.4 8 6" /></svg>; }
function BuildingIcon({ color = "#fff" }) { return <svg {...sv({ stroke: color })}><path d="M3 21h18M5 21V5a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v16M13 21V10a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v11M8 8h1M8 12h1M8 16h1M16 13h1M16 17h1" /></svg>; }
function ShieldIcon({ color = "#fff" }) { return <svg {...sv({ stroke: color })}><path d="M12 3l7 3v6c0 4.5-3 8.2-7 9-4-.8-7-4.5-7-9V6z" /></svg>; }
function GearIcon({ color = "#fff" }) { return <svg {...sv({ stroke: color })}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" /></svg>; }
function LinkIcon({ color = "#fff" }) { return <svg {...sv({ stroke: color })}><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></svg>; }
function BellIcon({ color = "#fff" }) { return <svg {...sv({ stroke: color })}><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>; }
function BrochureIcon({ color = "#fff" }) { return <svg {...sv({ stroke: color })}><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M9 3v18M13 8h4M13 12h4" /></svg>; }
function BackIcon() { return <svg {...sv({ stroke: "currentColor" })}><path d="M19 12H5M12 19l-7-7 7-7" /></svg>; }
function PencilIcon() { return <svg {...sv({ stroke: "currentColor", width: 14, height: 14 })}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>; }
function CopyIcon() { return <svg {...sv({ stroke: "currentColor", width: 15, height: 15 })}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>; }
function CalendarIcon() { return <svg {...sv({ stroke: "currentColor", width: 13, height: 13 })}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>; }
function CameraIcon() { return <svg {...sv({ stroke: "#04211d", width: 16, height: 16 })}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>; }
function LaptopIcon({ color = "#fff" }) { return <svg {...sv({ stroke: color, width: 17, height: 17 })}><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M2 20h20" /></svg>; }
function PhoneIcon({ color = "#fff" }) { return <svg {...sv({ stroke: color, width: 17, height: 17 })}><rect x="6" y="2" width="12" height="20" rx="2" /><path d="M11 18h2" /></svg>; }
function CancelIcon() { return <svg {...sv({ stroke: "currentColor", width: 16, height: 16 })}><circle cx="12" cy="12" r="10" /><path d="M15 9l-6 6M9 9l6 6" /></svg>; }
function SaveIcon() { return <svg {...sv({ stroke: "#2b1002", width: 16, height: 16 })}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><path d="M17 21v-8H7v8M7 3v5h8" /></svg>; }
function CheckCircle() { return <span style={st.checkCircle}>✓</span>; }
// A slim gold ring with a fine check, rather than the chunky scalloped
// social-media style seal this replaced. The "Verified Business" chip sits
// directly below the name, so this only needs to be a quiet accent.
function VerifiedBadge() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" aria-label="Verified" role="img" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" fill="none" stroke={GOLD} strokeWidth="1.6" opacity="0.85" />
      <path fill="none" stroke={GOLD} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"
        d="M7.8 12.3l2.8 2.8 5.6-5.9" />
    </svg>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// Trust score, weighted toward things that actually prove identity. Kept
// separate from `completion`, which is just "how many fields are filled".
function computeScore(me, isBusiness) {
  if (!me) return { score: 0, completion: 0, missing: [] };
  let score = 10; // mobile is always OTP-verified at signup
  const missing = [];

  if (me.profilePhotoUrl) score += 15; else missing.push("Add a profile photo");
  if (me.firstName && me.lastName) score += 10; else missing.push("Add your full name");
  if (me.dateOfBirth) score += 10; else missing.push("Add your date of birth");
  if (me.email) score += 10; else missing.push("Add an email address");
  if (me.emailVerified) score += 15; else if (me.email) missing.push("Verify your email");
  if (me.securityQuestion) score += 15; else missing.push("Set a security question");
  if (me.twoFactorEnabled) score += 15; else missing.push("Turn on two-factor authentication");

  const fields = [me.profilePhotoUrl, me.firstName, me.lastName, me.dateOfBirth, me.email,
    me.securityQuestion];
  if (isBusiness) {
    fields.push(me.businessName, me.businessAddress, me.businessCategory, me.businessHours, me.businessWebsite);
    if (!me.businessName) missing.push("Add your business name");
    if (!me.businessCategory) missing.push("Add a business category");
    if (!me.businessHours) missing.push("Add your business hours");
  }
  const filled = fields.filter(Boolean).length;
  const completion = Math.round((filled / fields.length) * 100);

  return { score: Math.min(100, score), completion, missing };
}

function initialsOf(u) {
  return (((u?.firstName || " ")[0]) + ((u?.lastName || " ")[0])).toUpperCase().trim() || "?";
}

// Memoera ID = the actual account-creation date (DDMMYYYY) + account number.
// Uses UTC parts so it doesn't shift a day depending on the viewer's timezone.
function formatMemoeraId(user) {
  if (!user?.id) return "";
  const seq = String(user.id).padStart(2, "0");
  if (!user.createdAt) return seq;
  const d = new Date(user.createdAt);
  if (Number.isNaN(d.getTime())) return seq;
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `MMR-${dd}${mm}-${d.getUTCFullYear()}-${seq}`;
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

function formatDob(dob) {
  if (!dob) return "Not set";
  const p = dob.split("-");
  return p.length === 3 ? `${p[2]} / ${p[1]} / ${p[0]}` : dob;
}

function timeAgo(iso) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs > 1 ? "s" : ""} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

function blobToBase64(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(",")[1]);
    reader.readAsDataURL(blob);
  });
}

function inputStyle(colors, hasError) {
  return {
    width: "100%", boxSizing: "border-box", background: "rgba(128,128,128,0.10)",
    border: `1px solid ${hasError ? DANGER : colors.border}`, borderRadius: 10,
    padding: "10px 12px", fontSize: 13.5, fontFamily: FONT, color: colors.text, outline: "none",
  };
}

// ── Responsive layout ────────────────────────────────────────────────────────
// The mockup is a wide two-column dashboard; below 900px the sidebar becomes a
// scrollable tab strip and every grid collapses to a single column so the same
// screen works inside the Android app.
function profileCss(colors) {
  return `
    .prf-shell { display: flex; gap: 0; min-height: 100%; }
    .prf-sidebar {
      width: 232px; flex-shrink: 0; padding: 26px 14px; display: flex; flex-direction: column; gap: 4px;
      border-right: 1px solid ${colors.border}; position: sticky; top: 0; align-self: flex-start;
    }
    .prf-navitem {
      display: flex; align-items: center; gap: 12px; width: 100%;
      background: transparent; border: none; border-radius: 12px; cursor: pointer;
      padding: 12px 14px; font-family: ${FONT}; font-size: 14px; font-weight: 600;
      color: ${colors.text}; text-align: left; transition: background .15s ease;
    }
    .prf-navitem:hover { background: rgba(128,128,128,0.12); }
    .prf-navitem--active {
      background: rgba(0,201,167,0.10); color: ${TEAL};
      box-shadow: inset 3px 0 0 ${TEAL}; cursor: default;
    }
    .prf-main { flex: 1; min-width: 0; padding: 26px 24px 0; }

    .prf-hero { display: grid; grid-template-columns: 1.35fr 1fr; gap: 18px; align-items: start; }
    .prf-hero-id { display: flex; gap: 20px; align-items: flex-start; }
    .prf-hero-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }

    .prf-formgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 28px; }
    .prf-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 0 28px; }
    .prf-2col--gap { gap: 0 16px; }
    .prf-prefgrid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
    .prf-connected { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }

    .prf-actionbar {
      position: fixed; left: 0; right: 0; bottom: 0; z-index: 40;
      display: flex; gap: 14px; padding: 12px 24px;
      border-top: 1px solid ${colors.border};
    }
    .prf-actionbar > button { flex: 1; }

    @media (max-width: 900px) {
      .prf-shell { flex-direction: column; }
      .prf-sidebar {
        width: auto; position: static; flex-direction: row; overflow-x: auto;
        border-right: none; border-bottom: 1px solid ${colors.border};
        padding: 14px 12px; gap: 6px; -webkit-overflow-scrolling: touch;
      }
      .prf-navitem { width: auto; flex-shrink: 0; padding: 9px 13px; font-size: 13px; white-space: nowrap; }
      .prf-navitem--active { box-shadow: inset 0 -3px 0 ${TEAL}; }
      .prf-main { padding: 18px 14px 0; }

      .prf-hero { grid-template-columns: 1fr; gap: 16px; }
      .prf-hero-id { gap: 14px; }
      .prf-formgrid, .prf-2col, .prf-2col--gap { grid-template-columns: 1fr; gap: 0; }
      .prf-prefgrid { grid-template-columns: 1fr 1fr; }
      .prf-connected { grid-template-columns: repeat(2, 1fr); }
      .prf-actionbar { padding: 10px 14px calc(10px + env(safe-area-inset-bottom)); }
    }
    @media (max-width: 420px) {
      .prf-hero-cards { grid-template-columns: 1fr; }
    }
  `;
}

// ── Styles ───────────────────────────────────────────────────────────────────

const st = {
  screen: { position: "fixed", inset: 0, display: "flex", flexDirection: "column",
    fontFamily: FONT, overflowY: "auto", overflowX: "hidden" },
  backBtn: { position: "fixed", top: 48, left: 16, background: "transparent", border: "none",
    fontSize: 14, fontWeight: 600, fontFamily: FONT, cursor: "pointer", padding: "6px 4px", zIndex: 2 },

  avatarRing: { width: 108, height: 108, borderRadius: "50%", overflow: "hidden",
    background: `linear-gradient(135deg,${GOLD},${TEAL})`, display: "flex",
    alignItems: "center", justifyContent: "center", border: "3px solid rgba(255,255,255,0.14)" },
  avatarImg: { width: "100%", height: "100%", objectFit: "cover" },
  avatarInitials: { fontSize: 34, fontWeight: 800, color: "#04211d", fontFamily: FONT },
  avatarCam: { position: "absolute", right: -2, bottom: 2, width: 32, height: 32, borderRadius: "50%",
    background: TEAL, border: "3px solid rgba(0,0,0,0.35)", cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center", padding: 0, fontSize: 13, color: "#04211d" },

  name: { fontSize: 30, fontWeight: 800, margin: 0, letterSpacing: "-0.02em", lineHeight: 1.1 },
  chipGold: { fontSize: 11.5, fontWeight: 700, color: GOLD, background: "rgba(201,168,76,0.13)",
    border: `1px solid ${GOLD}66`, borderRadius: 8, padding: "6px 12px", fontFamily: FONT },
  chipPlain: { fontSize: 11.5, fontWeight: 600, background: "transparent",
    border: "1px solid", borderRadius: 8, padding: "6px 12px", fontFamily: FONT },
  handle: { fontSize: 14, fontFamily: FONT, marginTop: 10 },
  metaLabel: { fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", fontFamily: FONT, marginTop: 14 },
  idBox: { display: "inline-flex", alignItems: "center", gap: 10, marginTop: 6,
    border: "1px solid", borderRadius: 10, padding: "9px 12px", maxWidth: "100%" },
  idText: { fontFamily: "ui-monospace, monospace", fontSize: 14, fontWeight: 700, letterSpacing: "0.02em" },
  idCopy: { background: "transparent", border: "none", cursor: "pointer", padding: 0, display: "flex" },
  dates: { fontSize: 12, fontFamily: FONT, marginTop: 14, display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center" },

  card: { borderRadius: 18, border: "1px solid" },
  scoreCard: { padding: 18, textAlign: "center" },
  cardEyebrow: { fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", fontFamily: FONT },
  scoreCaption: { fontSize: 12, fontFamily: FONT, lineHeight: 1.5, marginTop: 10 },
  bigPct: { fontSize: 38, fontWeight: 800, fontFamily: FONT, margin: "10px 0 12px", letterSpacing: "-0.02em" },
  barTrack: { height: 8, borderRadius: 5, background: "rgba(128,128,128,0.22)", overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 5, background: `linear-gradient(90deg,${GOLD},${TEAL})`, transition: "width .4s ease" },
  linkBtn: { marginTop: 12, background: "transparent", border: "none", color: TEAL, cursor: "pointer",
    fontSize: 13, fontWeight: 700, fontFamily: FONT, padding: 0 },

  sectionHead: { display: "flex", alignItems: "center", gap: 12, marginBottom: 14 },
  sectionIcon: { width: 36, height: 36, borderRadius: 12, background: "rgba(0,201,167,0.13)",
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  sectionTitle: { fontSize: 17, fontWeight: 700, margin: 0, fontFamily: FONT, letterSpacing: "-0.01em" },
  editBtn: { display: "flex", alignItems: "center", gap: 7, background: "transparent",
    border: `1px solid ${TEAL}66`, borderRadius: 10, color: TEAL, cursor: "pointer",
    fontSize: 12.5, fontWeight: 700, fontFamily: FONT, padding: "8px 15px" },

  infoRow: { display: "flex", alignItems: "center", gap: 12, padding: "13px 0",
    borderBottom: "1px solid", flexWrap: "wrap" },
  infoLabel: { fontSize: 12.5, fontFamily: FONT, minWidth: 150, flexShrink: 0 },
  infoValue: { fontSize: 13.5, fontFamily: FONT, fontWeight: 600, wordBreak: "break-word" },

  fieldLabel: { fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
    fontFamily: FONT, marginBottom: 5 },
  fieldError: { fontSize: 11, color: DANGER, fontFamily: FONT, marginTop: 4 },

  tagOk: { fontSize: 11, fontWeight: 700, color: TEAL, background: "rgba(0,201,167,0.14)",
    borderRadius: 7, padding: "4px 10px", fontFamily: FONT },
  tagWarn: { fontSize: 11, fontWeight: 700, color: GOLD, background: "rgba(201,168,76,0.14)",
    borderRadius: 7, padding: "4px 10px", fontFamily: FONT },
  tagMuted: { fontSize: 11, fontWeight: 600, fontFamily: FONT },
  tagBtnGold: { fontSize: 11.5, fontWeight: 700, color: GOLD, background: "transparent",
    border: `1px solid ${GOLD}88`, borderRadius: 8, padding: "7px 13px", fontFamily: FONT, cursor: "pointer" },
  tagBtnTeal: { fontSize: 11.5, fontWeight: 700, color: TEAL, background: "transparent",
    border: `1px solid ${TEAL}88`, borderRadius: 8, padding: "7px 13px", fontFamily: FONT, cursor: "pointer" },

  acctRow: { display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", padding: "2px 0" },
  acctCurrent: { fontSize: 15, fontWeight: 800, fontFamily: FONT, letterSpacing: "-0.01em" },
  switchBtn: { flexShrink: 0, background: `linear-gradient(135deg,${TEAL},#00E5CC)`, border: "none",
    borderRadius: 12, color: "#04211d", cursor: "pointer", fontSize: 13.5, fontWeight: 800,
    fontFamily: FONT, padding: "12px 20px" },

  secRow: { display: "flex", alignItems: "center", gap: 14, padding: "13px 0", borderBottom: "1px solid" },
  secTitle: { fontSize: 13.5, fontWeight: 700, fontFamily: FONT },
  secSub: { fontSize: 11.5, fontFamily: FONT, marginTop: 3, lineHeight: 1.45 },
  secretBox: { fontFamily: "ui-monospace, monospace", fontSize: 13, letterSpacing: "0.08em",
    border: "1px dashed", borderRadius: 10, padding: "10px 12px", wordBreak: "break-all" },
  checkCircle: { width: 26, height: 26, borderRadius: "50%", background: TEAL, color: "#04211d",
    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 800 },

  subhead: { fontSize: 13.5, fontWeight: 700, fontFamily: FONT, marginBottom: 10, marginTop: 4 },
  emptyNote: { fontSize: 11.5, fontFamily: FONT, lineHeight: 1.5 },
  activityRow: { display: "flex", alignItems: "center", gap: 11, padding: "11px 0", borderBottom: "1px solid" },
  activityDot: { width: 7, height: 7, borderRadius: "50%", flexShrink: 0 },
  activityTitle: { fontSize: 12.5, fontWeight: 600, fontFamily: FONT },
  activityTime: { fontSize: 11, fontFamily: FONT, flexShrink: 0, fontWeight: 600 },

  prefLabel: { fontSize: 11, fontFamily: FONT, marginBottom: 6 },
  prefValue: { fontSize: 13.5, fontWeight: 700, fontFamily: FONT },
  toggle: { width: 40, height: 22, borderRadius: 12, border: "none", cursor: "pointer",
    padding: 2, display: "flex", alignItems: "center", transition: "background .18s ease" },
  toggleKnob: { width: 18, height: 18, borderRadius: "50%", background: "#fff",
    transition: "transform .18s ease", display: "block" },

  connItem: { textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 },
  connCircle: { width: 44, height: 44, borderRadius: "50%", display: "flex",
    alignItems: "center", justifyContent: "center", marginBottom: 2 },
  connLabel: { fontSize: 12, fontWeight: 700, fontFamily: FONT },
  connStatus: { fontSize: 10.5, fontWeight: 600, fontFamily: FONT },
  connNote: { fontSize: 9.5, fontFamily: FONT, lineHeight: 1.3, wordBreak: "break-word" },

  cancelBtn: { display: "flex", alignItems: "center", justifyContent: "center", gap: 9,
    background: "transparent", border: "1px solid", borderRadius: 12, cursor: "pointer",
    fontSize: 14, fontWeight: 700, fontFamily: FONT, padding: "13px 0" },
  saveBtn: { display: "flex", alignItems: "center", justifyContent: "center", gap: 9,
    background: `linear-gradient(135deg,${GOLD},#e8c96a)`, border: "none", borderRadius: 12,
    color: "#2b1002", cursor: "pointer", fontSize: 14, fontWeight: 800, fontFamily: FONT, padding: "13px 0" },

  toast: { position: "fixed", left: "50%", bottom: 84, transform: "translateX(-50%)", zIndex: 60,
    border: "1px solid", borderRadius: 22, padding: "10px 20px", fontSize: 13, fontFamily: FONT,
    maxWidth: "90vw", textAlign: "center" },

  pickerBackdrop: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", zIndex: 100 },
  pickerSheet: { position: "fixed", bottom: 0, left: 0, right: 0, borderRadius: "24px 24px 0 0",
    padding: "12px 20px 40px", zIndex: 101, display: "flex", flexDirection: "column", gap: 10 },
  pickerHandle: { width: 40, height: 4, borderRadius: 2, background: "rgba(128,128,128,0.4)", alignSelf: "center", marginBottom: 8 },
  pickerTitle: { fontSize: 15, fontWeight: 600, fontFamily: FONT, textAlign: "center", margin: "0 0 8px" },
  pickerBtn: { background: "rgba(201,168,76,0.08)", border: "1px solid rgba(201,168,76,0.25)",
    borderRadius: 14, padding: "14px 18px", cursor: "pointer", fontSize: 15, fontFamily: FONT, textAlign: "left" },
  pickerCancelBtn: { marginTop: 4, background: "transparent", border: "1px solid rgba(128,128,128,0.25)",
    borderRadius: 14, padding: 14, fontSize: 15, fontFamily: FONT, cursor: "pointer" },
};

// ── Photo Editor Modal (unchanged) ───────────────────────────────────────────

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

        <div style={pe.tabs}>
          {["crop", "edit", "filter"].map(t => (
            <button key={t} style={{ ...pe.tab, ...(tab === t ? pe.tabActive : {}) }}
              onClick={() => setTab(t)}>
              {t === "crop" ? `✂️ ${tr.peTabCrop}` : t === "edit" ? `✨ ${tr.peTabAdjust}` : `🎨 ${tr.peTabFilters}`}
            </button>
          ))}
        </div>

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

        {tab === "edit" && (
          <div style={pe.editPanel}>
            <SliderRow label={tr.peBrightness}    value={brightness} onChange={setBrightness} min={50}  max={150} unit="%" />
            <SliderRow label={tr.peContrast}      value={contrast}   onChange={setContrast}   min={50}  max={150} unit="%" />
            <WarmthRow label={tr.peWhiteBalance}  value={warmth}     onChange={setWarmth}     min={-60} max={60} tr={tr} />
          </div>
        )}

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
