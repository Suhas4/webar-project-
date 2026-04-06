package main

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"math/big"
	"net/http"
	"net/smtp"
	"os"
	"strings"
	"sync"
	"time"
)

// ─── Data Models ──────────────────────────────────────────────────────────────

type User struct {
	FirstName        string `json:"firstName"`
	LastName         string `json:"lastName"`
	Mobile           string `json:"mobile"`
	Email            string `json:"email"`
	PasswordHash     string `json:"-"`
	SecurityQuestion string `json:"securityQuestion"`
	SecurityAnswer   string `json:"-"`
}

type SignUpRequest struct {
	FirstName        string `json:"firstName"`
	LastName         string `json:"lastName"`
	Mobile           string `json:"mobile"`
	Email            string `json:"email"`
	Password         string `json:"password"`
	SecurityQuestion string `json:"securityQuestion"`
	SecurityAnswer   string `json:"securityAnswer"`
}

type SignInRequest struct {
	Identifier string `json:"identifier"` // email or mobile
	Password   string `json:"password"`
}

type AuthResponse struct {
	Token string `json:"token"`
	User  User   `json:"user"`
}

// OTP entry stored in memory
type OTPEntry struct {
	OTP       string
	Email     string // always resolved to email
	ExpiresAt time.Time
}

// ─── In-memory store ──────────────────────────────────────────────────────────

var (
	users       = map[string]User{}   // keyed by email (lowercase)
	mobileIndex = map[string]string{} // mobile → email
	otpStore    = map[string]OTPEntry{} // identifier → OTPEntry
	mu          sync.RWMutex
	otpMu       sync.Mutex
	jwtSecret   []byte
)

func init() {
	secret := os.Getenv("JWT_SECRET")
	if secret != "" {
		jwtSecret = []byte(secret)
	} else {
		jwtSecret = make([]byte, 32)
		if _, err := rand.Read(jwtSecret); err != nil {
			log.Fatal("failed to generate JWT secret:", err)
		}
	}
}

// ─── Token helpers ────────────────────────────────────────────────────────────

func hashPassword(password, salt string) string {
	h := sha256.New()
	h.Write([]byte(salt + password))
	return fmt.Sprintf("%x", h.Sum(nil))
}

func generateSalt() string {
	b := make([]byte, 16)
	rand.Read(b)
	return fmt.Sprintf("%x", b)
}

func makeToken(email string) string {
	payload := map[string]interface{}{
		"email": email,
		"exp":   time.Now().Add(30 * 24 * time.Hour).Unix(),
	}
	payloadJSON, _ := json.Marshal(payload)
	payloadB64 := base64.RawURLEncoding.EncodeToString(payloadJSON)

	mac := hmac.New(sha256.New, jwtSecret)
	mac.Write([]byte(payloadB64))
	sig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))

	return payloadB64 + "." + sig
}

func verifyToken(token string) (string, error) {
	parts := strings.SplitN(token, ".", 2)
	if len(parts) != 2 {
		return "", fmt.Errorf("invalid token format")
	}
	payloadB64, sig := parts[0], parts[1]

	mac := hmac.New(sha256.New, jwtSecret)
	mac.Write([]byte(payloadB64))
	expectedSig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(sig), []byte(expectedSig)) {
		return "", fmt.Errorf("invalid token signature")
	}

	payloadJSON, err := base64.RawURLEncoding.DecodeString(payloadB64)
	if err != nil {
		return "", fmt.Errorf("invalid token payload")
	}

	var payload map[string]interface{}
	if err := json.Unmarshal(payloadJSON, &payload); err != nil {
		return "", fmt.Errorf("invalid token JSON")
	}

	exp, ok := payload["exp"].(float64)
	if !ok || time.Now().Unix() > int64(exp) {
		return "", fmt.Errorf("token expired")
	}

	email, _ := payload["email"].(string)
	return email, nil
}

// ─── OTP helpers ──────────────────────────────────────────────────────────────

func generateOTP() string {
	n, _ := rand.Int(rand.Reader, big.NewInt(900000))
	return fmt.Sprintf("%06d", n.Int64()+100000)
}

func sendEmailOTP(toEmail, otp, firstName string) error {
	smtpHost := os.Getenv("SMTP_HOST")
	smtpPort := os.Getenv("SMTP_PORT")
	smtpUser := os.Getenv("SMTP_USER")
	smtpPass := os.Getenv("SMTP_PASS")
	fromEmail := os.Getenv("SMTP_FROM")

	if smtpHost == "" || smtpUser == "" || smtpPass == "" {
		log.Printf("[OTP] SMTP not configured — OTP for %s: %s", toEmail, otp)
		return nil // In dev, just log it
	}
	if smtpPort == "" {
		smtpPort = "587"
	}
	if fromEmail == "" {
		fromEmail = smtpUser
	}

	subject := "Your Memoera OTP Code"
	body := fmt.Sprintf(`Hi %s,

Your OTP for resetting your Memoera password is:

  %s

This code expires in 10 minutes. Do not share it with anyone.

— The Memoera Team`, firstName, otp)

	msg := fmt.Sprintf("From: Memoera <%s>\r\nTo: %s\r\nSubject: %s\r\n\r\n%s",
		fromEmail, toEmail, subject, body)

	auth := smtp.PlainAuth("", smtpUser, smtpPass, smtpHost)

	// Try TLS first (port 465), fallback to STARTTLS (port 587)
	if smtpPort == "465" {
		tlsConfig := &tls.Config{ServerName: smtpHost}
		conn, err := tls.Dial("tcp", smtpHost+":"+smtpPort, tlsConfig)
		if err != nil {
			return fmt.Errorf("TLS dial failed: %w", err)
		}
		client, err := smtp.NewClient(conn, smtpHost)
		if err != nil {
			return fmt.Errorf("SMTP client failed: %w", err)
		}
		defer client.Close()
		if err = client.Auth(auth); err != nil {
			return err
		}
		if err = client.Mail(fromEmail); err != nil {
			return err
		}
		if err = client.Rcpt(toEmail); err != nil {
			return err
		}
		w, err := client.Data()
		if err != nil {
			return err
		}
		_, err = fmt.Fprint(w, msg)
		if err != nil {
			return err
		}
		return w.Close()
	}

	return smtp.SendMail(smtpHost+":"+smtpPort, auth, fromEmail, []string{toEmail}, []byte(msg))
}

func sendSMSOTP(mobile, otp string) error {
	accountSID := os.Getenv("TWILIO_ACCOUNT_SID")
	authToken := os.Getenv("TWILIO_AUTH_TOKEN")
	fromNumber := os.Getenv("TWILIO_FROM_NUMBER")

	if accountSID == "" || authToken == "" || fromNumber == "" {
		log.Printf("[OTP] Twilio not configured — OTP for %s: %s", mobile, otp)
		return nil // In dev, just log it
	}

	// Format mobile to E.164 if not already
	to := mobile
	if !strings.HasPrefix(to, "+") {
		to = "+91" + to // default to India prefix
	}

	body := fmt.Sprintf("Your Memoera OTP is: %s. Valid for 10 minutes. Do not share.", otp)

	msgData := fmt.Sprintf("To=%s&From=%s&Body=%s", urlEncode(to), urlEncode(fromNumber), urlEncode(body))

	url := fmt.Sprintf("https://api.twilio.com/2010-04-01/Accounts/%s/Messages.json", accountSID)
	req, err := http.NewRequest("POST", url, strings.NewReader(msgData))
	if err != nil {
		return err
	}
	req.SetBasicAuth(accountSID, authToken)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("Twilio request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("Twilio error: status %d", resp.StatusCode)
	}
	return nil
}

func urlEncode(s string) string {
	var b strings.Builder
	for _, c := range s {
		switch {
		case c >= 'A' && c <= 'Z', c >= 'a' && c <= 'z', c >= '0' && c <= '9',
			c == '-', c == '_', c == '.', c == '~':
			b.WriteRune(c)
		default:
			b.WriteString(fmt.Sprintf("%%%02X", c))
		}
	}
	return b.String()
}

// ─── Config helpers ───────────────────────────────────────────────────────────

func getAllowedOrigin() string {
	if origin := os.Getenv("FRONTEND_ORIGIN"); origin != "" {
		return origin
	}
	return "http://localhost:5173"
}

func getPort() string {
	if port := os.Getenv("PORT"); port != "" {
		return ":" + port
	}
	return ":8181"
}

// ─── Middleware ───────────────────────────────────────────────────────────────

func corsMiddleware(allowedOrigin string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin == allowedOrigin || allowedOrigin == "*" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
		} else if origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Max-Age", "86400")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s  (%s)", r.Method, r.URL.Path, time.Since(start))
	})
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

func healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"status":    "ok",
		"timestamp": time.Now().UTC().Format(time.RFC3339),
		"service":   "webar-backend",
	})
}

func signUpHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req SignUpRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.FirstName == "" || req.LastName == "" || req.Email == "" || req.Password == "" || req.Mobile == "" {
		writeError(w, http.StatusBadRequest, "All fields are required")
		return
	}
	if len(req.Password) < 6 {
		writeError(w, http.StatusBadRequest, "Password must be at least 6 characters")
		return
	}

	email := strings.ToLower(strings.TrimSpace(req.Email))

	mu.Lock()
	defer mu.Unlock()

	if _, exists := users[email]; exists {
		writeError(w, http.StatusConflict, "An account with this email already exists")
		return
	}
	if _, exists := mobileIndex[req.Mobile]; exists {
		writeError(w, http.StatusConflict, "An account with this mobile number already exists")
		return
	}

	salt := generateSalt()
	passwordHash := salt + ":" + hashPassword(req.Password, salt)

	answerSalt := generateSalt()
	answerHash := answerSalt + ":" + hashPassword(strings.ToLower(req.SecurityAnswer), answerSalt)

	user := User{
		FirstName:        req.FirstName,
		LastName:         req.LastName,
		Mobile:           req.Mobile,
		Email:            email,
		PasswordHash:     passwordHash,
		SecurityQuestion: req.SecurityQuestion,
		SecurityAnswer:   answerHash,
	}

	users[email] = user
	mobileIndex[req.Mobile] = email

	token := makeToken(email)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(AuthResponse{Token: token, User: user})
}

func signInHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req SignInRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.Identifier == "" || req.Password == "" {
		writeError(w, http.StatusBadRequest, "Email/mobile and password are required")
		return
	}

	identifier := strings.TrimSpace(req.Identifier)

	mu.RLock()
	defer mu.RUnlock()

	var user User
	var found bool

	email := strings.ToLower(identifier)
	if u, ok := users[email]; ok {
		user = u
		found = true
	} else if mappedEmail, ok := mobileIndex[identifier]; ok {
		if u, ok := users[mappedEmail]; ok {
			user = u
			found = true
		}
	}

	if !found {
		writeError(w, http.StatusUnauthorized, "Invalid email/mobile or password")
		return
	}

	parts := strings.SplitN(user.PasswordHash, ":", 2)
	if len(parts) != 2 {
		writeError(w, http.StatusInternalServerError, "Account data corrupted")
		return
	}
	salt, storedHash := parts[0], parts[1]
	if hashPassword(req.Password, salt) != storedHash {
		writeError(w, http.StatusUnauthorized, "Invalid email/mobile or password")
		return
	}

	token := makeToken(user.Email)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(AuthResponse{Token: token, User: user})
}

// ─── Forgot Password: Step 1 — Send OTP ──────────────────────────────────────
// POST /api/auth/forgot-password
// Body: { "identifier": "email or mobile" }
// Sends OTP to both email and mobile of the matched account

func forgotPasswordHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Identifier string `json:"identifier"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	identifier := strings.TrimSpace(req.Identifier)
	if identifier == "" {
		writeError(w, http.StatusBadRequest, "Email or mobile number is required")
		return
	}

	mu.RLock()
	var user User
	var found bool
	email := strings.ToLower(identifier)
	if u, ok := users[email]; ok {
		user = u
		found = true
	} else if mappedEmail, ok := mobileIndex[identifier]; ok {
		if u, ok := users[mappedEmail]; ok {
			user = u
			found = true
		}
	}
	mu.RUnlock()

	if !found {
		// Don't reveal whether account exists — return success anyway
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"message": "If an account exists, an OTP has been sent.",
			"maskedEmail":  "",
			"maskedMobile": "",
		})
		return
	}

	otp := generateOTP()

	otpMu.Lock()
	otpStore[user.Email] = OTPEntry{
		OTP:       otp,
		Email:     user.Email,
		ExpiresAt: time.Now().Add(10 * time.Minute),
	}
	otpMu.Unlock()

	// Send OTP via email
	emailErr := sendEmailOTP(user.Email, otp, user.FirstName)
	if emailErr != nil {
		log.Printf("[OTP] Email send failed for %s: %v", user.Email, emailErr)
	}

	// Send OTP via SMS
	smsErr := sendSMSOTP(user.Mobile, otp)
	if smsErr != nil {
		log.Printf("[OTP] SMS send failed for %s: %v", user.Mobile, smsErr)
	}

	// Mask email and mobile for display
	maskedEmail := maskEmail(user.Email)
	maskedMobile := maskMobile(user.Mobile)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"message":      "OTP sent to your registered email and mobile.",
		"maskedEmail":  maskedEmail,
		"maskedMobile": maskedMobile,
	})
}

// ─── Forgot Password: Step 2 — Verify OTP ────────────────────────────────────
// POST /api/auth/verify-otp
// Body: { "identifier": "email or mobile", "otp": "123456" }

func verifyOTPHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Identifier string `json:"identifier"`
		OTP        string `json:"otp"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.Identifier == "" || req.OTP == "" {
		writeError(w, http.StatusBadRequest, "Identifier and OTP are required")
		return
	}

	// Resolve identifier to email
	resolvedEmail := resolveEmail(req.Identifier)
	if resolvedEmail == "" {
		writeError(w, http.StatusUnauthorized, "Invalid OTP or expired")
		return
	}

	otpMu.Lock()
	entry, exists := otpStore[resolvedEmail]
	otpMu.Unlock()

	if !exists || time.Now().After(entry.ExpiresAt) {
		writeError(w, http.StatusUnauthorized, "OTP has expired. Please request a new one.")
		return
	}

	if entry.OTP != strings.TrimSpace(req.OTP) {
		writeError(w, http.StatusUnauthorized, "Incorrect OTP. Please try again.")
		return
	}

	// OTP valid — issue a short-lived reset token
	resetToken := makeResetToken(resolvedEmail)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{
		"message":    "OTP verified successfully.",
		"resetToken": resetToken,
	})
}

// ─── Forgot Password: Step 3 — Reset Password ────────────────────────────────
// POST /api/auth/reset-password
// Body: { "resetToken": "...", "newPassword": "..." }

func resetPasswordHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		ResetToken  string `json:"resetToken"`
		NewPassword string `json:"newPassword"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.ResetToken == "" || req.NewPassword == "" {
		writeError(w, http.StatusBadRequest, "Reset token and new password are required")
		return
	}
	if len(req.NewPassword) < 6 {
		writeError(w, http.StatusBadRequest, "Password must be at least 6 characters")
		return
	}

	email, err := verifyResetToken(req.ResetToken)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "Invalid or expired reset token. Please start over.")
		return
	}

	mu.Lock()
	user, exists := users[email]
	if !exists {
		mu.Unlock()
		writeError(w, http.StatusNotFound, "Account not found")
		return
	}

	salt := generateSalt()
	user.PasswordHash = salt + ":" + hashPassword(req.NewPassword, salt)
	users[email] = user
	mu.Unlock()

	// Clear OTP after successful reset
	otpMu.Lock()
	delete(otpStore, email)
	otpMu.Unlock()

	// Sign them in automatically
	token := makeToken(email)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(AuthResponse{Token: token, User: user})
}

// ─── Reset token (short-lived 15min token for password reset only) ────────────

func makeResetToken(email string) string {
	payload := map[string]interface{}{
		"email": email,
		"type":  "reset",
		"exp":   time.Now().Add(15 * time.Minute).Unix(),
	}
	payloadJSON, _ := json.Marshal(payload)
	payloadB64 := base64.RawURLEncoding.EncodeToString(payloadJSON)
	mac := hmac.New(sha256.New, jwtSecret)
	mac.Write([]byte(payloadB64))
	sig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return payloadB64 + "." + sig
}

func verifyResetToken(token string) (string, error) {
	parts := strings.SplitN(token, ".", 2)
	if len(parts) != 2 {
		return "", fmt.Errorf("invalid token")
	}
	mac := hmac.New(sha256.New, jwtSecret)
	mac.Write([]byte(parts[0]))
	expectedSig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(parts[1]), []byte(expectedSig)) {
		return "", fmt.Errorf("invalid signature")
	}
	payloadJSON, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return "", err
	}
	var payload map[string]interface{}
	if err := json.Unmarshal(payloadJSON, &payload); err != nil {
		return "", err
	}
	if payload["type"] != "reset" {
		return "", fmt.Errorf("wrong token type")
	}
	exp, _ := payload["exp"].(float64)
	if time.Now().Unix() > int64(exp) {
		return "", fmt.Errorf("token expired")
	}
	return payload["email"].(string), nil
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func resolveEmail(identifier string) string {
	mu.RLock()
	defer mu.RUnlock()
	email := strings.ToLower(strings.TrimSpace(identifier))
	if _, ok := users[email]; ok {
		return email
	}
	if mapped, ok := mobileIndex[strings.TrimSpace(identifier)]; ok {
		return mapped
	}
	return ""
}

func maskEmail(email string) string {
	parts := strings.SplitN(email, "@", 2)
	if len(parts) != 2 {
		return email
	}
	name := parts[0]
	if len(name) <= 2 {
		return "**@" + parts[1]
	}
	return string(name[0]) + strings.Repeat("*", len(name)-2) + string(name[len(name)-1]) + "@" + parts[1]
}

func maskMobile(mobile string) string {
	if len(mobile) < 4 {
		return "****"
	}
	return strings.Repeat("*", len(mobile)-4) + mobile[len(mobile)-4:]
}

func writeError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": message})
}

// ─── Main ─────────────────────────────────────────────────────────────────────

func main() {
	allowedOrigin := getAllowedOrigin()
	port := getPort()

	mux := http.NewServeMux()

	mux.HandleFunc("/health", healthHandler)
	mux.HandleFunc("/api/auth/signup", signUpHandler)
	mux.HandleFunc("/api/auth/signin", signInHandler)
	mux.HandleFunc("/api/auth/forgot-password", forgotPasswordHandler)
	mux.HandleFunc("/api/auth/verify-otp", verifyOTPHandler)
	mux.HandleFunc("/api/auth/reset-password", resetPasswordHandler)

	handler := loggingMiddleware(corsMiddleware(allowedOrigin, mux))

	server := &http.Server{
		Addr:         port,
		Handler:      handler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	log.Printf("webar-backend listening on %s", port)
	log.Printf("CORS allowed origin: %s", allowedOrigin)

	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("server error: %v", err)
	}
}