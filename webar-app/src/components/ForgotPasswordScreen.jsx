import { useState, useCallback, useRef, useEffect } from "react";
import { API_BASE, parseApiResponse } from "../config/api.js";

export default function ForgotPasswordScreen({ onBack, onSuccess }) {
  const [step, setStep] = useState(1);
  const [mobile, setMobile] = useState("");
  const [securityQuestion, setSecurityQuestion] = useState("");
  const [securityAnswer, setSecurityAnswer] = useState("");
  const [otp, setOtp] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  const cooldownRef = useRef(null);
  useEffect(() => () => { if (cooldownRef.current) clearInterval(cooldownRef.current); }, []);

  const startCooldown = () => {
    setResendCooldown(30);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => setResendCooldown((c) => {
      if (c <= 1) { clearInterval(cooldownRef.current); cooldownRef.current = null; return 0; }
      return c - 1;
    }), 1000);
  };

  const handleGetQuestion = useCallback(async (e) => {
    e && e.preventDefault();
    if (!mobile.trim()) { setError("Enter your mobile number."); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(API_BASE+"/api/auth/forgot-password",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mobile:mobile.trim()})});
      const data = await parseApiResponse(res);
      if (!res.ok) { setError(data.error||"Account not found."); return; }
      setSecurityQuestion(data.securityQuestion);
      setStep(2);
    } catch { setError("Cannot connect to server."); } finally { setLoading(false); }
  }, [mobile]);

  const handleVerifyAnswer = useCallback(async (e) => {
    e && e.preventDefault();
    if (!securityAnswer.trim()) { setError("Enter your security answer."); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(API_BASE+"/api/auth/verify-security-question",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mobile:mobile.trim(),securityAnswer:securityAnswer.trim()})});
      const data = await parseApiResponse(res);
      if (!res.ok) { setError(data.error||"Incorrect answer."); return; }
      setStep(3); startCooldown();
    } catch { setError("Cannot connect to server."); } finally { setLoading(false); }
  }, [mobile, securityAnswer]);

  const handleVerifyOTP = useCallback(async (e) => {
    e && e.preventDefault();
    if (otp.trim().length !== 6) { setError("Enter the 6-digit OTP."); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(API_BASE+"/api/auth/verify-otp",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mobile:mobile.trim(),otp:otp.trim()})});
      const data = await parseApiResponse(res);
      if (!res.ok) { setError(data.error||"Invalid OTP."); return; }
      setResetToken(data.resetToken);
      setStep(4);
    } catch { setError("Cannot connect to server."); } finally { setLoading(false); }
  }, [mobile, otp]);

  const handleReset = useCallback(async (e) => {
    e && e.preventDefault();
    if (newPassword.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (newPassword !== confirmPassword) { setError("Passwords do not match."); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(API_BASE+"/api/auth/reset-password",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({resetToken,newPassword})});
      const data = await parseApiResponse(res);
      if (!res.ok) { setError(data.error||"Failed to reset password."); return; }
      localStorage.setItem("memoera_token",data.token);
      localStorage.setItem("memoera_user",JSON.stringify(data.user));
      onSuccess(data.user);
    } catch { setError("Cannot connect to server."); } finally { setLoading(false); }
  }, [resetToken,newPassword,confirmPassword,onSuccess]);

  const resendOTP = async () => {
    await fetch(API_BASE+"/api/auth/verify-security-question",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mobile:mobile.trim(),securityAnswer:securityAnswer.trim()})});
    startCooldown();
  };

  return (
    <div style={S.screen}>
      <div style={S.orb1}/><div style={S.orb2}/>
      <div style={S.container}>
        <img src="/logo.png" alt="Memoera" style={S.logo} />
        <div style={S.card}>
          <div style={S.stepRow}>
            {[1,2,3,4].map(s=>(
              <div key={s} style={{display:"flex",alignItems:"center",gap:2}}>
                <div style={{...S.dot,...(step>=s?S.dotActive:{})}}>{s}</div>
                {s<4&&<div style={{...S.line,...(step>s?S.lineActive:{})}}/>}
              </div>
            ))}
          </div>
          <h2 style={S.heading}>{["FORGOT PASSWORD","SECURITY QUESTION","ENTER OTP","NEW PASSWORD"][step-1]}</h2>
          {error && <div style={S.errorBox}>{error}</div>}
          {step===1 && (
            <form onSubmit={handleGetQuestion} style={S.form}>
              <p style={S.hint}>Enter your registered mobile number.</p>
              <input style={S.input} type="tel" placeholder="Mobile number" maxLength={10} value={mobile} onChange={e=>setMobile(e.target.value)} />
              <button type="submit" disabled={loading} style={{...S.btn,...(loading?S.btnDisabled:{})}}>Continue</button>
            </form>
          )}
          {step===2 && (
            <form onSubmit={handleVerifyAnswer} style={S.form}>
              <p style={S.hint}>{securityQuestion}</p>
              <input style={S.input} type="text" placeholder="Your answer" value={securityAnswer} onChange={e=>setSecurityAnswer(e.target.value)} />
              <button type="submit" disabled={loading} style={{...S.btn,...(loading?S.btnDisabled:{})}}>Verify</button>
            </form>
          )}
          {step===3 && (
            <form onSubmit={handleVerifyOTP} style={S.form}>
              <p style={S.hint}>OTP sent to your mobile. Valid 10 minutes.</p>
              <input style={{...S.input,letterSpacing:"0.3em",fontSize:22,textAlign:"center"}} type="text" inputMode="numeric" maxLength={6} placeholder="000000" value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g,"").slice(0,6))} />
              <button type="submit" disabled={loading} style={{...S.btn,...(loading?S.btnDisabled:{})}}>Verify OTP</button>
              <button type="button" disabled={resendCooldown>0} onClick={resendOTP} style={S.resendBtn}>{resendCooldown>0?"Resend in "+resendCooldown+"s":"Resend OTP"}</button>
            </form>
          )}
          {step===4 && (
            <form onSubmit={handleReset} style={S.form}>
              <p style={S.hint}>Choose a new password.</p>
              <div style={{position:"relative"}}>
                <input style={{...S.input,paddingRight:52}} type={showPass?"text":"password"} placeholder="New password (min 6 chars)" value={newPassword} onChange={e=>setNewPassword(e.target.value)} />
                <button type="button" style={S.eyeBtn} onClick={()=>setShowPass(v=>!v)}>Show</button>
              </div>
              <input style={S.input} type={showPass?"text":"password"} placeholder="Confirm password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} />
              <button type="submit" disabled={loading} style={{...S.btn,...(loading?S.btnDisabled:{})}}>Reset Password</button>
            </form>
          )}
        </div>
        <button onClick={onBack} style={S.backBtn}>← Back</button>
      </div>
    </div>
  );
}

const TEAL = "#00C9A7";
const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const S = {
  screen:{position:"fixed",inset:0,background:"radial-gradient(ellipse at 20% 20%, rgba(0,201,167,0.15) 0%, transparent 55%), radial-gradient(ellipse at 80% 80%, rgba(0,229,204,0.1) 0%, transparent 55%), #080C18",display:"flex",alignItems:"center",justifyContent:"center",overflowY:"auto",padding:"24px 0"},
  orb1:{position:"fixed",top:"-10%",left:"-10%",width:"55vw",height:"55vw",maxWidth:350,maxHeight:350,borderRadius:"50%",background:"radial-gradient(circle, rgba(0,201,167,0.2) 0%, transparent 70%)",pointerEvents:"none"},
  orb2:{position:"fixed",bottom:"-10%",right:"-10%",width:"50vw",height:"50vw",maxWidth:320,maxHeight:320,borderRadius:"50%",background:"radial-gradient(circle, rgba(0,229,204,0.15) 0%, transparent 70%)",pointerEvents:"none"},
  container:{width:"100%",maxWidth:400,padding:"0 24px",display:"flex",flexDirection:"column",alignItems:"center",zIndex:1},
  logo:{width:200,maxWidth:"60vw",objectFit:"contain",marginBottom:20},
  card:{width:"100%",background:"rgba(0,201,167,0.04)",border:"1px solid rgba(0,201,167,0.25)",borderRadius:20,padding:"28px 24px 24px",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)"},
  stepRow:{display:"flex",alignItems:"center",justifyContent:"center",marginBottom:20,gap:0},
  dot:{width:24,height:24,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,fontFamily:FONT,background:"rgba(255,255,255,0.08)",color:"rgba(255,255,255,0.3)",border:"1.5px solid rgba(255,255,255,0.15)",flexShrink:0},
  dotActive:{background:"linear-gradient(135deg,"+TEAL+",#00E5CC)",color:"#080C18",border:"none"},
  line:{width:20,height:2,background:"rgba(255,255,255,0.1)"},
  lineActive:{background:"linear-gradient(90deg,"+TEAL+",#00E5CC)"},
  heading:{fontSize:18,fontWeight:700,fontFamily:FONT,color:"#ffffff",letterSpacing:"2px",marginBottom:16,textAlign:"center"},
  hint:{fontSize:13,color:"rgba(255,255,255,0.45)",fontFamily:FONT,margin:"0 0 16px",lineHeight:1.6,textAlign:"center"},
  errorBox:{background:"rgba(255,80,80,0.08)",border:"1px solid rgba(255,80,80,0.3)",borderRadius:10,padding:"10px 14px",fontSize:13,color:"#ff8080",fontFamily:FONT,marginBottom:16,textAlign:"center"},
  form:{display:"flex",flexDirection:"column",gap:14},
  input:{background:"rgba(255,255,255,0.05)",border:"none",borderBottom:"1.5px solid rgba(0,201,167,0.4)",borderRadius:"8px 8px 0 0",padding:"12px 14px",fontSize:15,fontFamily:FONT,color:"#ffffff",outline:"none",width:"100%"},
  btn:{display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,"+TEAL+",#00E5CC)",border:"none",borderRadius:50,color:"#080C18",fontSize:16,fontWeight:700,fontFamily:FONT,padding:"15px 24px",cursor:"pointer",boxShadow:"0 4px 24px rgba(0,201,167,0.35)"},
  btnDisabled:{opacity:0.65,cursor:"not-allowed",boxShadow:"none"},
  resendBtn:{background:"transparent",border:"none",color:"rgba(255,255,255,0.35)",fontSize:13,fontFamily:FONT,cursor:"pointer",textAlign:"center",textDecoration:"underline"},
  eyeBtn:{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"transparent",border:"none",cursor:"pointer",fontSize:12,color:TEAL,fontFamily:FONT},
  backBtn:{background:"transparent",border:"none",color:"rgba(255,255,255,0.4)",fontSize:14,fontFamily:FONT,cursor:"pointer",marginTop:20},
};
