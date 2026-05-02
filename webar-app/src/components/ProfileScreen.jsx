import { useState, useRef, useEffect } from "react";
import { API_BASE } from "../config/api.js";
import CameraCapture from "./CameraCapture.jsx";
import { useTheme } from "../context/ThemeContext.jsx";

export default function ProfileScreen({ user, onBack, onUserUpdate }) {
  const { colors } = useTheme();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    firstName: user?.firstName || "",
    lastName: user?.lastName || "",
    dateOfBirth: user?.dateOfBirth || "",
  });
  const [profilePhoto, setProfilePhoto] = useState(user?.profilePhotoUrl || "");
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const galleryInputRef = useRef(null);

  useEffect(() => {
    setProfilePhoto(user?.profilePhotoUrl || "");
  }, [user?.profilePhotoUrl]);

  const dob = form.dateOfBirth;
  const dobParts = dob ? dob.split("-") : [];
  const dobDisplay = dobParts.length === 3
    ? (dobParts[2] + " | " + dobParts[1] + " | " + dobParts[0])
    : dob || "Not set";
  const initials = (((user?.firstName || " ")[0]) + ((user?.lastName || " ")[0])).toUpperCase();

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem("memoera_token") || "";
      const res = await fetch(API_BASE + "/api/auth/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || "Failed to save"); return; }
      onUserUpdate(data);
      setEditing(false);
    } catch (e) {
      alert("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoFile = async (file) => {
    if (!file) return;
    setShowPhotoPicker(false);
    setShowCamera(false);
    setPhotoUploading(true);
    try {
      const token = localStorage.getItem("memoera_token") || "";
      const blob = await resizeImage(file, 400);
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
    } catch (e) {
      alert("Failed to upload photo. Please try again.");
    } finally {
      setPhotoUploading(false);
    }
  };

  return (
    <div style={{ ...styles.screen, background: colors.bg }}>
      {showCamera && (
        <CameraCapture facingMode="user"
          onCapture={(file) => { setShowCamera(false); handlePhotoFile(file); }}
          onClose={() => setShowCamera(false)}
        />
      )}
      {showPhotoPicker && (
        <div>
          <div style={styles.pickerBackdrop} onClick={() => setShowPhotoPicker(false)} />
          <div style={{ ...styles.pickerSheet, background: colors.surface }}>
            <div style={styles.pickerHandle} />
            <p style={{ ...styles.pickerTitle, color: colors.text }}>Profile Photo</p>
            <button style={{ ...styles.pickerBtn, color: colors.text }} onClick={() => { setShowPhotoPicker(false); setShowCamera(true); }}>Camera</button>
            <button style={{ ...styles.pickerBtn, color: colors.text }} onClick={() => { setShowPhotoPicker(false); galleryInputRef.current?.click(); }}>Gallery</button>
            <button style={{ ...styles.pickerCancelBtn, color: colors.textMuted }} onClick={() => setShowPhotoPicker(false)}>Cancel</button>
          </div>
        </div>
      )}
      <input ref={galleryInputRef} type="file" accept="image/*" style={{ display: "none" }}
        onChange={(e) => handlePhotoFile(e.target.files?.[0])}
        onClick={(e) => { e.target.value = ""; }} />

      <button onClick={onBack} style={{ ...styles.backBtn, color: colors.textMuted }}>Back</button>

      <div style={styles.avatarWrap} onClick={() => !photoUploading && setShowPhotoPicker(true)}>
        <div style={styles.hexOuter}>
          <div style={styles.hexInner}>
            {profilePhoto
              ? <img src={profilePhoto} alt="Profile" style={styles.profileImg} />
              : <span style={styles.initials}>{photoUploading ? "..." : initials}</span>
            }
          </div>
        </div>
        <div style={{ ...styles.editPhotoHint, color: colors.textMuted }}>{photoUploading ? "Uploading..." : "Tap to change photo"}</div>
      </div>

      <div style={{ width: "80%", display: "flex", flexDirection: "column", alignItems: "center" }}>
        {editing ? (
          <>
            <input style={{ ...styles.editInput, color: colors.text, background: colors.surface }} placeholder="First Name" value={form.firstName}
              onChange={(e) => setForm(f => ({ ...f, firstName: e.target.value }))} />
            <div style={{ ...styles.divider, background: colors.border }} />
            <input style={{ ...styles.editInput, color: colors.text, background: colors.surface }} placeholder="Last Name" value={form.lastName}
              onChange={(e) => setForm(f => ({ ...f, lastName: e.target.value }))} />
            <div style={{ ...styles.divider, background: colors.border }} />
            <input style={{ ...styles.editInput, color: colors.text, background: colors.surface }} type="date" value={form.dateOfBirth}
              onChange={(e) => setForm(f => ({ ...f, dateOfBirth: e.target.value }))} />
          </>
        ) : (
          <>
            <div style={{ ...styles.name, color: colors.text }}>{((form.firstName || "") + " " + (form.lastName || "")).toUpperCase()}</div>
            <div style={{ ...styles.divider, background: colors.border }} />
            <div style={{ ...styles.field, color: colors.text }}>{dobDisplay}</div>
            <div style={{ ...styles.divider, background: colors.border }} />
            <div style={{ ...styles.field, color: colors.text }}>{user?.mobile || ""}</div>
            <div style={{ ...styles.divider, background: colors.border }} />
            <div style={{ ...styles.field, fontSize: 11, color: colors.textMuted }}>{user?.securityQuestion || "Security Question"}</div>
            <div style={{ ...styles.divider, background: colors.border }} />
          </>
        )}
      </div>

      <div style={styles.buttonRow}>
        {editing ? (
          <>
            <button style={{ ...styles.editBtn, color: colors.text, borderColor: colors.border }} onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
            <button style={styles.doneBtn} onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "DONE"}</button>
          </>
        ) : (
          <>
            <button style={{ ...styles.editBtn, color: colors.text, borderColor: colors.border }} onClick={() => setEditing(true)}>EDIT</button>
            <button style={styles.doneBtn} onClick={onBack}>DONE</button>
          </>
        )}
      </div>
    </div>
  );
}

function blobToBase64(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(",")[1]);
    reader.readAsDataURL(blob);
  });
}

function resizeImage(file, maxSize) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(resolve, "image/jpeg", 0.85);
    };
    img.src = url;
  });
}

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const GOLD = "#C9A84C";
const styles = {
  screen: {
    position: "fixed", inset: 0,
    background: "linear-gradient(160deg, #061A1F 0%, #0A2229 50%, #061820 100%)",
    display: "flex", flexDirection: "column", alignItems: "center",
    fontFamily: FONT, padding: "24px 20px 40px", overflowY: "auto",
  },
  backBtn: {
    alignSelf: "flex-start", background: "transparent", border: "none",
    color: "rgba(255,255,255,0.6)", fontSize: 14, fontFamily: FONT,
    cursor: "pointer", marginBottom: 16,
  },
  avatarWrap: { marginBottom: 12, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center" },
  hexOuter: {
    width: 120, height: 120,
    background: "linear-gradient(135deg," + GOLD + ",#fff8dc)",
    clipPath: "polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%)",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  hexInner: {
    width: 108, height: 108, background: "#1a3f7a",
    clipPath: "polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%)",
    display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  profileImg: { width: "100%", height: "100%", objectFit: "cover" },
  initials: { fontSize: 36, fontWeight: 700, color: "#fff", fontFamily: FONT },
  editPhotoHint: { fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 6, fontFamily: FONT },
  name: { fontSize: 22, fontWeight: 700, color: "#fff", letterSpacing: "1px", marginBottom: 8, textAlign: "center" },
  divider: { width: "100%", height: 1, background: "rgba(255,255,255,0.25)", margin: "6px 0" },
  field: { fontSize: 14, color: "rgba(255,255,255,0.85)", fontFamily: FONT, padding: "6px 0", textAlign: "center" },
  editInput: {
    background: "rgba(255,255,255,0.07)", border: "none",
    borderBottom: "1.5px solid rgba(201,168,76,0.5)", borderRadius: "6px 6px 0 0",
    padding: "10px 14px", fontSize: 14, fontFamily: FONT, color: "#fff",
    outline: "none", width: "100%", marginBottom: 8, textAlign: "center", boxSizing: "border-box",
  },
  buttonRow: { display: "flex", gap: 16, marginTop: 24 },
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
  pickerHandle: { width: 40, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.2)", alignSelf: "center", marginBottom: 8 },
  pickerTitle: { fontSize: 15, fontWeight: 600, fontFamily: FONT, color: "rgba(255,255,255,0.7)", textAlign: "center", margin: "0 0 8px" },
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
