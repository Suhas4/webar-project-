package main

import (
	"bytes"
	"compress/gzip"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/tls"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"math/big"
	"net/http"
	"net/smtp"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/joho/godotenv"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	s3types "github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ─── Data Models ──────────────────────────────────────────────────────────────

type User struct {
	ID               int64  `json:"id"`
	FirstName        string `json:"firstName"`
	LastName         string `json:"lastName"`
	Mobile           string `json:"mobile"`
	Email            string `json:"email,omitempty"`
	DateOfBirth      string `json:"dateOfBirth,omitempty"`
	ProfilePhotoURL  string `json:"profilePhotoUrl,omitempty"`
	PasswordHash     string `json:"-"`
	SecurityQuestion string `json:"securityQuestion"`
	SecurityAnswer   string `json:"-"`
}

type SignUpRequest struct {
	FirstName        string `json:"firstName"`
	LastName         string `json:"lastName"`
	Mobile           string `json:"mobile"`
	DateOfBirth      string `json:"dateOfBirth"`
	Password         string `json:"password"`
	OTP              string `json:"otp"`
	SecurityQuestion string `json:"securityQuestion"`
	SecurityAnswer   string `json:"securityAnswer"`
	ReferralCode     string `json:"referralCode"`
}

type SignInRequest struct {
	Identifier string `json:"identifier"`
	Password   string `json:"password"`
}

type AuthResponse struct {
	Token string `json:"token"`
	User  User   `json:"user"`
}

type OTPEntry struct {
	OTP       string
	Email     string
	ExpiresAt time.Time
}

type ARTarget struct {
	TargetIndex  int     `json:"targetIndex"`
	Label        string  `json:"label"`
	PlaneWidth   float64 `json:"planeWidth"`
	PlaneHeight  float64 `json:"planeHeight"`
	PlaneOffsetY float64 `json:"planeOffsetY"`
	ImageKey     string  `json:"imageKey"`
	VideoKey     string  `json:"videoKey"`
	MindKey      string  `json:"mindKey"`
}

// ─── Globals ──────────────────────────────────────────────────────────────────

var (
	db           *pgxpool.Pool
	s3Client     *s3.Client
	presignClient *s3.PresignClient
	r2Bucket     string
	r2PublicURL  string

	otpStore = map[string]OTPEntry{}
	otpMu    sync.Mutex
	jwtSecret []byte
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

// ─── DB Init ──────────────────────────────────────────────────────────────────

func initDB(ctx context.Context) error {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		return fmt.Errorf("DATABASE_URL env var not set")
	}

	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return fmt.Errorf("pgxpool.New: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		return fmt.Errorf("db ping: %w", err)
	}
	db = pool

	_, err = db.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS users (
			id            BIGSERIAL PRIMARY KEY,
			email         TEXT UNIQUE,
			mobile        TEXT UNIQUE NOT NULL,
			first_name    TEXT NOT NULL,
			last_name     TEXT NOT NULL,
			password_hash TEXT NOT NULL,
			security_question TEXT,
			security_answer   TEXT,
			created_at    TIMESTAMPTZ DEFAULT NOW()
		);

		CREATE TABLE IF NOT EXISTS ar_targets (
			id            BIGSERIAL PRIMARY KEY,
			user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			target_index  INTEGER NOT NULL,
			label         TEXT NOT NULL,
			plane_width   FLOAT8 NOT NULL DEFAULT 1.0,
			plane_height  FLOAT8 NOT NULL DEFAULT 0.5625,
			plane_offset_y FLOAT8 NOT NULL DEFAULT 0.0,
			image_key     TEXT,
			video_key     TEXT,
			mind_key      TEXT,
			created_at    TIMESTAMPTZ DEFAULT NOW()
		);

		CREATE TABLE IF NOT EXISTS poster_history (
			id          BIGSERIAL PRIMARY KEY,
			user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			title       TEXT NOT NULL DEFAULT '',
			name        TEXT NOT NULL DEFAULT '',
			message     TEXT NOT NULL DEFAULT '',
			subtitle    TEXT NOT NULL DEFAULT '',
			emojis      TEXT NOT NULL DEFAULT '',
			colors      JSONB NOT NULL DEFAULT '{}',
			image_key   TEXT NOT NULL DEFAULT '',
			created_at  TIMESTAMPTZ DEFAULT NOW()
		);

		CREATE TABLE IF NOT EXISTS reviews (
			id          BIGSERIAL PRIMARY KEY,
			user_id     BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
			rating      SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
			review_text TEXT NOT NULL,
			created_at  TIMESTAMPTZ DEFAULT NOW()
		);
	`)
	if err != nil {
		return fmt.Errorf("create tables: %w", err)
	}

	// Safe migrations for existing installs
	_, _ = db.Exec(ctx, `ALTER TABLE users ALTER COLUMN email DROP NOT NULL`)
	_, _ = db.Exec(ctx, `ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth TEXT`)
	_, _ = db.Exec(ctx, `ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo_url TEXT NOT NULL DEFAULT ''`)
	_, _ = db.Exec(ctx, `ALTER TABLE ar_targets ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false`)
	_, _ = db.Exec(ctx, `ALTER TABLE ar_targets ADD COLUMN IF NOT EXISTS target_type TEXT NOT NULL DEFAULT 'video'`)
	_, _ = db.Exec(ctx, `ALTER TABLE ar_targets ADD COLUMN IF NOT EXISTS url_link TEXT NOT NULL DEFAULT ''`)
	_, _ = db.Exec(ctx, `ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code TEXT NOT NULL DEFAULT ''`)
	_, _ = db.Exec(ctx, `ALTER TABLE ar_targets ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT NOT NULL DEFAULT 0`)
	_, _ = db.Exec(ctx, `ALTER TABLE ar_targets ADD COLUMN IF NOT EXISTS file_name TEXT NOT NULL DEFAULT ''`)
	_, _ = db.Exec(ctx, `ALTER TABLE ar_targets ADD COLUMN IF NOT EXISTS preview_key TEXT NOT NULL DEFAULT ''`)
	_, _ = db.Exec(ctx, `ALTER TABLE poster_history ADD COLUMN IF NOT EXISTS image_key TEXT NOT NULL DEFAULT ''`)
	_, _ = db.Exec(ctx, `ALTER TABLE ar_targets ADD COLUMN IF NOT EXISTS animation_effect TEXT NOT NULL DEFAULT 'popIn'`)
	// Secondary indexes — ar_targets is filtered by user_id and is_public on nearly
	// every request; Postgres does not auto-index FK/non-PK columns.
	_, _ = db.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_ar_targets_user_id ON ar_targets(user_id)`)
	_, _ = db.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_ar_targets_is_public ON ar_targets(is_public) WHERE is_public = true`)
	_, _ = db.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_poster_history_user_id ON poster_history(user_id)`)

	// Migrate unique constraint: (user_id, target_index) → (user_id, target_index, is_public)
	// so public and private targets can coexist at the same index for the same user.
	_, _ = db.Exec(ctx, `ALTER TABLE ar_targets DROP CONSTRAINT IF EXISTS ar_targets_user_id_target_index_key`)
	_, _ = db.Exec(ctx, `
		DO $body$
		BEGIN
			IF NOT EXISTS (
				SELECT 1 FROM pg_constraint
				WHERE conname = 'ar_targets_user_id_target_index_is_public_key'
			) THEN
				ALTER TABLE ar_targets
				ADD CONSTRAINT ar_targets_user_id_target_index_is_public_key
				UNIQUE (user_id, target_index, is_public);
			END IF;
		END;
		$body$`)

	log.Println("DB connected and tables ready")
	return nil
}

// ─── R2 Init ──────────────────────────────────────────────────────────────────

func initR2() error {
	accountID := os.Getenv("R2_ACCOUNT_ID")
	accessKey := os.Getenv("R2_ACCESS_KEY_ID")
	secretKey := os.Getenv("R2_SECRET_ACCESS_KEY")
	r2Bucket = os.Getenv("R2_BUCKET_NAME")
	r2PublicURL = strings.TrimSuffix(os.Getenv("R2_PUBLIC_URL"), "/")

	if accountID == "" || accessKey == "" || secretKey == "" || r2Bucket == "" {
		return fmt.Errorf("R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME must all be set")
	}

	cfg, err := awsconfig.LoadDefaultConfig(context.Background(),
		awsconfig.WithCredentialsProvider(
			credentials.NewStaticCredentialsProvider(accessKey, secretKey, ""),
		),
		awsconfig.WithRegion("auto"),
	)
	if err != nil {
		return fmt.Errorf("aws config: %w", err)
	}

	endpoint := fmt.Sprintf("https://%s.r2.cloudflarestorage.com", accountID)
	s3Client = s3.NewFromConfig(cfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(endpoint)
		o.UsePathStyle = true
	})
	presignClient = s3.NewPresignClient(s3Client)

	log.Printf("R2 connected: bucket=%s", r2Bucket)
	return nil
}

func fileURL(key string) string {
	if r2PublicURL == "" || key == "" {
		return ""
	}
	return r2PublicURL + "/" + key
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

func makeToken(mobile string) string {
	payload := map[string]interface{}{
		"mobile": mobile,
		"exp":    time.Now().Add(30 * 24 * time.Hour).Unix(),
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
	if !hmac.Equal([]byte(sig), []byte(base64.RawURLEncoding.EncodeToString(mac.Sum(nil)))) {
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
	mobile, _ := payload["mobile"].(string)
	return mobile, nil
}

// getUserFromToken extracts and validates the Bearer token, returns (userID, mobile, error).
func getUserFromToken(r *http.Request) (int64, string, error) {
	auth := r.Header.Get("Authorization")
	if !strings.HasPrefix(auth, "Bearer ") {
		return 0, "", errors.New("missing authorization header")
	}
	token := strings.TrimPrefix(auth, "Bearer ")
	mobile, err := verifyToken(token)
	if err != nil {
		return 0, "", err
	}
	var userID int64
	err = db.QueryRow(r.Context(), "SELECT id FROM users WHERE mobile=$1", mobile).Scan(&userID)
	if err != nil {
		return 0, "", errors.New("user not found")
	}
	return userID, mobile, nil
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
		return nil
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
	apiKey := os.Getenv("TWOFACTOR_API_KEY")
	if apiKey == "" {
		log.Printf("[OTP] 2Factor not configured — OTP for %s: %s", mobile, otp)
		return nil
	}
	to := strings.TrimPrefix(mobile, "+")
	to = strings.TrimPrefix(to, "91") // VOICE API expects 10-digit number only
	url := fmt.Sprintf("https://2factor.in/API/V1/%s/VOICE/%s/%s", apiKey, to, otp)
	resp, err := http.Get(url)
	if err != nil {
		return fmt.Errorf("2Factor request failed: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	log.Printf("[OTP] 2Factor response status=%d body=%s", resp.StatusCode, string(body))
	if resp.StatusCode >= 400 {
		return fmt.Errorf("2Factor error: status %d", resp.StatusCode)
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
		if origin != "" {
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

func recoveryMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				log.Printf("PANIC on %s %s: %v", r.Method, r.URL.Path, rec)
				// JSON, not http.Error's plain text — every frontend call site does
				// `await res.json()` on non-ok responses, so a plain-text body throws
				// a parse error that gets swallowed into a generic "can't reach
				// server" message, masking the real cause (this exact response).
				writeError(w, http.StatusServiceUnavailable, "service temporarily unavailable (DB not configured)")
			}
		}()
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

type gzipResponseWriter struct {
	http.ResponseWriter
	Writer io.Writer
}

func (w gzipResponseWriter) Write(b []byte) (int, error) {
	return w.Writer.Write(b)
}

// gzipMiddleware wraps the entire inner chain (recovery+cors+mux) so that both
// normal handler output and recovery's panic-caught error responses go through
// the same writer — avoiding a mismatched Content-Encoding header if a panic
// happens mid-write.
func gzipMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions || !strings.Contains(r.Header.Get("Accept-Encoding"), "gzip") {
			next.ServeHTTP(w, r)
			return
		}
		w.Header().Set("Content-Encoding", "gzip")
		w.Header().Add("Vary", "Accept-Encoding")
		gz := gzip.NewWriter(w)
		defer gz.Close()
		next.ServeHTTP(gzipResponseWriter{ResponseWriter: w, Writer: gz}, r)
	})
}

// ─── Auth Handlers ────────────────────────────────────────────────────────────

func healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"status":    "ok",
		"timestamp": time.Now().UTC().Format(time.RFC3339),
		"service":   "webar-backend",
	})
}

// POST /api/auth/send-signup-otp — sends OTP to mobile before account creation
func sendSignupOTPHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		Mobile string `json:"mobile"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	mobile := strings.TrimSpace(req.Mobile)
	if mobile == "" {
		writeError(w, http.StatusBadRequest, "Mobile number is required")
		return
	}
	// Check if mobile already registered
	var exists bool
	_ = db.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM users WHERE mobile=$1)", mobile).Scan(&exists)
	if exists {
		writeError(w, http.StatusConflict, "An account with this mobile number already exists")
		return
	}

	otp := generateOTP()
	otpMu.Lock()
	otpStore["signup:"+mobile] = OTPEntry{OTP: otp, Email: mobile, ExpiresAt: time.Now().Add(10 * time.Minute)}
	otpMu.Unlock()

	if err := sendSMSOTP(mobile, otp); err != nil {
		log.Printf("[OTP] SMS send failed for %s: %v", mobile, err)
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{
		"message":      "OTP sent to your mobile.",
		"maskedMobile": maskMobile(mobile),
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

	if req.FirstName == "" || req.LastName == "" || req.Mobile == "" || req.Password == "" || req.OTP == "" {
		writeError(w, http.StatusBadRequest, "All fields are required")
		return
	}
	if len(req.Password) < 6 {
		writeError(w, http.StatusBadRequest, "Password must be at least 6 characters")
		return
	}

	// Verify OTP
	otpMu.Lock()
	entry, exists := otpStore["signup:"+req.Mobile]
	otpMu.Unlock()
	if !exists || time.Now().After(entry.ExpiresAt) {
		writeError(w, http.StatusUnauthorized, "OTP has expired. Please request a new one.")
		return
	}
	if entry.OTP != strings.TrimSpace(req.OTP) {
		writeError(w, http.StatusUnauthorized, "Incorrect OTP. Please try again.")
		return
	}
	otpMu.Lock()
	delete(otpStore, "signup:"+req.Mobile)
	otpMu.Unlock()

	salt := generateSalt()
	passwordHash := salt + ":" + hashPassword(req.Password, salt)
	answerSalt := generateSalt()
	answerHash := answerSalt + ":" + hashPassword(strings.ToLower(req.SecurityAnswer), answerSalt)

	var userID int64
	err := db.QueryRow(r.Context(), `
		INSERT INTO users (mobile, first_name, last_name, password_hash, security_question, security_answer, date_of_birth, referral_code)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id`,
		req.Mobile, req.FirstName, req.LastName, passwordHash, req.SecurityQuestion, answerHash, req.DateOfBirth, req.ReferralCode,
	).Scan(&userID)

	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			writeError(w, http.StatusConflict, "An account with this mobile number already exists")
			return
		}
		log.Printf("[signUp] db error: %v", err)
		writeError(w, http.StatusInternalServerError, "Failed to create account")
		return
	}

	user := User{ID: userID, FirstName: req.FirstName, LastName: req.LastName,
		Mobile: req.Mobile, DateOfBirth: req.DateOfBirth, SecurityQuestion: req.SecurityQuestion}
	token := makeToken(req.Mobile)

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
		writeError(w, http.StatusBadRequest, "Mobile number and password are required")
		return
	}

	mobile := strings.TrimSpace(req.Identifier)

	var user User
	err := db.QueryRow(r.Context(), `
		SELECT id, mobile, first_name, last_name, password_hash, security_question,
		       COALESCE(date_of_birth,''), COALESCE(profile_photo_url,'')
		FROM users WHERE mobile=$1`, mobile,
	).Scan(&user.ID, &user.Mobile, &user.FirstName, &user.LastName, &user.PasswordHash,
		&user.SecurityQuestion, &user.DateOfBirth, &user.ProfilePhotoURL)

	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusUnauthorized, "Invalid mobile number or password")
		return
	}
	if err != nil {
		log.Printf("[signIn] db error: %v", err)
		writeError(w, http.StatusInternalServerError, "Sign in failed")
		return
	}

	parts := strings.SplitN(user.PasswordHash, ":", 2)
	if len(parts) != 2 || hashPassword(req.Password, parts[0]) != parts[1] {
		writeError(w, http.StatusUnauthorized, "Invalid mobile number or password")
		return
	}

	token := makeToken(user.Mobile)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(AuthResponse{Token: token, User: user})
}

// Step 1: POST /api/auth/forgot-password — takes mobile, returns security question
func forgotPasswordHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		Mobile string `json:"mobile"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	mobile := strings.TrimSpace(req.Mobile)
	if mobile == "" {
		writeError(w, http.StatusBadRequest, "Mobile number is required")
		return
	}

	var securityQuestion string
	err := db.QueryRow(r.Context(), `SELECT security_question FROM users WHERE mobile=$1`, mobile).Scan(&securityQuestion)
	if errors.Is(err, pgx.ErrNoRows) {
		// Don't reveal whether account exists
		writeError(w, http.StatusNotFound, "No account found with this mobile number")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to lookup account")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"securityQuestion": securityQuestion})
}

// Step 2: POST /api/auth/verify-security-question — verifies answer, sends OTP
func verifySecurityQuestionHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		Mobile         string `json:"mobile"`
		SecurityAnswer string `json:"securityAnswer"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if req.Mobile == "" || req.SecurityAnswer == "" {
		writeError(w, http.StatusBadRequest, "Mobile and security answer are required")
		return
	}

	var storedHash, firstName string
	err := db.QueryRow(r.Context(), `SELECT security_answer, first_name FROM users WHERE mobile=$1`, req.Mobile).
		Scan(&storedHash, &firstName)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusUnauthorized, "Incorrect answer")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to verify answer")
		return
	}

	parts := strings.SplitN(storedHash, ":", 2)
	if len(parts) != 2 || hashPassword(strings.ToLower(strings.TrimSpace(req.SecurityAnswer)), parts[0]) != parts[1] {
		writeError(w, http.StatusUnauthorized, "Incorrect security answer")
		return
	}

	otp := generateOTP()
	otpMu.Lock()
	otpStore[req.Mobile] = OTPEntry{OTP: otp, Email: req.Mobile, ExpiresAt: time.Now().Add(10 * time.Minute)}
	otpMu.Unlock()

	if err := sendSMSOTP(req.Mobile, otp); err != nil {
		log.Printf("[OTP] SMS send failed for %s: %v", req.Mobile, err)
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{
		"message":      "OTP sent to your mobile.",
		"maskedMobile": maskMobile(req.Mobile),
	})
}

func verifyOTPHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		Mobile string `json:"mobile"`
		OTP    string `json:"otp"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if req.Mobile == "" || req.OTP == "" {
		writeError(w, http.StatusBadRequest, "Mobile and OTP are required")
		return
	}

	otpMu.Lock()
	entry, exists := otpStore[req.Mobile]
	otpMu.Unlock()

	if !exists || time.Now().After(entry.ExpiresAt) {
		writeError(w, http.StatusUnauthorized, "OTP has expired. Please request a new one.")
		return
	}
	if entry.OTP != strings.TrimSpace(req.OTP) {
		writeError(w, http.StatusUnauthorized, "Incorrect OTP. Please try again.")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{
		"message":    "OTP verified successfully.",
		"resetToken": makeResetToken(req.Mobile),
	})
}

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

	mobile, err := verifyResetToken(req.ResetToken)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "Invalid or expired reset token. Please start over.")
		return
	}

	salt := generateSalt()
	newHash := salt + ":" + hashPassword(req.NewPassword, salt)
	_, err = db.Exec(r.Context(), "UPDATE users SET password_hash=$1 WHERE mobile=$2", newHash, mobile)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to update password")
		return
	}

	otpMu.Lock()
	delete(otpStore, mobile)
	otpMu.Unlock()

	var user User
	_ = db.QueryRow(r.Context(), `
		SELECT id, mobile, first_name, last_name, security_question, COALESCE(date_of_birth,'')
		FROM users WHERE mobile=$1`, mobile,
	).Scan(&user.ID, &user.Mobile, &user.FirstName, &user.LastName, &user.SecurityQuestion, &user.DateOfBirth)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(AuthResponse{Token: makeToken(mobile), User: user})
}

// PUT /api/auth/change-password — authenticated; verifies current password then updates
func changePasswordHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	userID, _, err := getUserFromToken(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	var req struct {
		CurrentPassword string `json:"currentPassword"`
		NewPassword     string `json:"newPassword"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if req.CurrentPassword == "" || req.NewPassword == "" {
		writeError(w, http.StatusBadRequest, "Current and new passwords are required")
		return
	}
	if len(req.NewPassword) < 6 {
		writeError(w, http.StatusBadRequest, "New password must be at least 6 characters")
		return
	}

	var storedHash string
	err = db.QueryRow(r.Context(), `SELECT password_hash FROM users WHERE id=$1`, userID).Scan(&storedHash)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to fetch user")
		return
	}
	parts := strings.SplitN(storedHash, ":", 2)
	if len(parts) != 2 || hashPassword(req.CurrentPassword, parts[0]) != parts[1] {
		writeError(w, http.StatusUnauthorized, "Current password is incorrect")
		return
	}

	salt := generateSalt()
	newHash := salt + ":" + hashPassword(req.NewPassword, salt)
	_, err = db.Exec(r.Context(), "UPDATE users SET password_hash=$1 WHERE id=$2", newHash, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to update password")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"message": "Password updated successfully"})
}

// ─── Me Handler ───────────────────────────────────────────────────────────────

// GET /api/me — returns the authenticated user's profile (including numeric id).
func getMeHandler(w http.ResponseWriter, r *http.Request) {
	userID, _, err := getUserFromToken(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	var user User
	err = db.QueryRow(r.Context(), `
		SELECT id, mobile, first_name, last_name, security_question,
		       COALESCE(date_of_birth,''), COALESCE(profile_photo_url,'')
		FROM users WHERE id=$1`, userID,
	).Scan(&user.ID, &user.Mobile, &user.FirstName, &user.LastName,
		&user.SecurityQuestion, &user.DateOfBirth, &user.ProfilePhotoURL)
	if err != nil {
		writeError(w, http.StatusNotFound, "User not found")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(user)
}

// PUT /api/auth/profile — update profile fields (firstName, lastName, dateOfBirth)
func updateProfileHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	userID, _, err := getUserFromToken(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	var req struct {
		FirstName   string `json:"firstName"`
		LastName    string `json:"lastName"`
		DateOfBirth string `json:"dateOfBirth"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	_, err = db.Exec(r.Context(),
		`UPDATE users SET first_name=$1, last_name=$2, date_of_birth=$3 WHERE id=$4`,
		req.FirstName, req.LastName, req.DateOfBirth, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to update profile")
		return
	}
	var user User
	_ = db.QueryRow(r.Context(), `
		SELECT id, mobile, first_name, last_name, security_question,
		       COALESCE(date_of_birth,''), COALESCE(profile_photo_url,'')
		FROM users WHERE id=$1`, userID,
	).Scan(&user.ID, &user.Mobile, &user.FirstName, &user.LastName,
		&user.SecurityQuestion, &user.DateOfBirth, &user.ProfilePhotoURL)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(user)
}

// PUT /api/auth/profile/photo — receive base64 image, upload to R2 server-side, save public URL
func updateProfilePhotoHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	userID, _, err := getUserFromToken(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	var req struct {
		ImageBase64 string `json:"imageBase64"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ImageBase64 == "" {
		writeError(w, http.StatusBadRequest, "imageBase64 is required")
		return
	}
	imgData, err := base64.StdEncoding.DecodeString(req.ImageBase64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "Invalid base64 image")
		return
	}
	key := fmt.Sprintf("users/%d/profile/photo-%d.jpg", userID, time.Now().UnixMilli())
	if s3Client == nil {
		writeError(w, http.StatusInternalServerError, "Storage not configured")
		return
	}
	bucket := os.Getenv("R2_BUCKET_NAME")
	contentType := "image/jpeg"
	_, err = s3Client.PutObject(r.Context(), &s3.PutObjectInput{
		Bucket:      &bucket,
		Key:         &key,
		Body:        bytes.NewReader(imgData),
		ContentType: &contentType,
	})
	if err != nil {
		log.Printf("[profilePhoto] R2 upload error: %v", err)
		writeError(w, http.StatusInternalServerError, "Failed to upload image")
		return
	}
	publicBase := os.Getenv("R2_PUBLIC_URL")
	photoUrl := publicBase + "/" + key
	_, err = db.Exec(r.Context(),
		`UPDATE users SET profile_photo_url=$1 WHERE id=$2`, photoUrl, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to save photo URL")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"photoUrl": photoUrl})
}

// ─── Upload Handlers ──────────────────────────────────────────────────────────

// POST /api/upload/presign
// Body: {"key": "users/1/images/0.jpg", "contentType": "image/jpeg"}
// Returns: {"url": "...presigned PUT url...", "key": "..."}
func presignUploadHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	userID, _, err := getUserFromToken(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var req struct {
		Key         string `json:"key"`
		ContentType string `json:"contentType"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if req.Key == "" {
		writeError(w, http.StatusBadRequest, "key is required")
		return
	}
	// Ensure key is scoped to the user
	expectedPrefix := fmt.Sprintf("users/%d/", userID)
	if !strings.HasPrefix(req.Key, expectedPrefix) {
		writeError(w, http.StatusForbidden, "Key must be scoped to your user ID")
		return
	}
	if presignClient == nil {
		writeError(w, http.StatusServiceUnavailable, "Storage not configured. Please contact support.")
		return
	}

	presignResult, err := presignClient.PresignPutObject(r.Context(), &s3.PutObjectInput{
		Bucket:      aws.String(r2Bucket),
		Key:         aws.String(req.Key),
		ContentType: aws.String(req.ContentType),
	}, func(opts *s3.PresignOptions) {
		opts.Expires = 15 * time.Minute
	})
	if err != nil {
		log.Printf("[presign] error: %v", err)
		writeError(w, http.StatusInternalServerError, "Failed to generate upload URL")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"url": presignResult.URL, "key": req.Key})
}

// POST /api/upload/presign-public-mind
// Auth required. Generates two pre-signed PUT URLs for uploading the pre-built combined
// public .mind file and its fingerprint to R2 under public/.
// Returns: {"mindUrl": "...", "fingerprintUrl": "..."}
func presignPublicMindHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if _, _, err := getUserFromToken(r); err != nil {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	if presignClient == nil {
		writeError(w, http.StatusServiceUnavailable, "Storage not configured")
		return
	}

	mindResult, err := presignClient.PresignPutObject(r.Context(), &s3.PutObjectInput{
		Bucket:      aws.String(r2Bucket),
		Key:         aws.String("public/combined.mind"),
		ContentType: aws.String("application/octet-stream"),
	}, func(opts *s3.PresignOptions) {
		opts.Expires = 15 * time.Minute
	})
	if err != nil {
		log.Printf("[presign-public-mind] mind presign error: %v", err)
		writeError(w, http.StatusInternalServerError, "Failed to generate upload URL")
		return
	}

	fpResult, err := presignClient.PresignPutObject(r.Context(), &s3.PutObjectInput{
		Bucket:      aws.String(r2Bucket),
		Key:         aws.String("public/combined-fingerprint.txt"),
		ContentType: aws.String("text/plain"),
	}, func(opts *s3.PresignOptions) {
		opts.Expires = 15 * time.Minute
	})
	if err != nil {
		log.Printf("[presign-public-mind] fingerprint presign error: %v", err)
		writeError(w, http.StatusInternalServerError, "Failed to generate upload URL")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{
		"mindUrl":        mindResult.URL,
		"fingerprintUrl": fpResult.URL,
	})
}

// POST /api/upload/multipart/init
// Body: {"key": "users/1/videos/0.mp4", "contentType": "video/mp4"}
// Returns: {"uploadId": "...", "key": "..."}
func multipartInitHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	userID, _, err := getUserFromToken(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var req struct {
		Key         string `json:"key"`
		ContentType string `json:"contentType"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	expectedPrefix := fmt.Sprintf("users/%d/", userID)
	if !strings.HasPrefix(req.Key, expectedPrefix) {
		writeError(w, http.StatusForbidden, "Key must be scoped to your user ID")
		return
	}
	if s3Client == nil {
		writeError(w, http.StatusServiceUnavailable, "Storage not configured. Please contact support.")
		return
	}

	result, err := s3Client.CreateMultipartUpload(r.Context(), &s3.CreateMultipartUploadInput{
		Bucket:      aws.String(r2Bucket),
		Key:         aws.String(req.Key),
		ContentType: aws.String(req.ContentType),
	})
	if err != nil {
		log.Printf("[multipart init] error: %v", err)
		writeError(w, http.StatusInternalServerError, "Failed to initiate upload")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"uploadId": *result.UploadId, "key": req.Key})
}

// POST /api/upload/multipart/part-url
// Body: {"key": "...", "uploadId": "...", "partNumber": 1}
// Returns: {"url": "...presigned..."}
func multipartPartURLHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	userID, _, err := getUserFromToken(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var req struct {
		Key        string `json:"key"`
		UploadID   string `json:"uploadId"`
		PartNumber int32  `json:"partNumber"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	expectedPrefix := fmt.Sprintf("users/%d/", userID)
	if !strings.HasPrefix(req.Key, expectedPrefix) {
		writeError(w, http.StatusForbidden, "Key must be scoped to your user ID")
		return
	}
	if req.PartNumber < 1 || req.PartNumber > 10000 {
		writeError(w, http.StatusBadRequest, "partNumber must be between 1 and 10000")
		return
	}

	presignResult, err := presignClient.PresignUploadPart(r.Context(), &s3.UploadPartInput{
		Bucket:     aws.String(r2Bucket),
		Key:        aws.String(req.Key),
		UploadId:   aws.String(req.UploadID),
		PartNumber: aws.Int32(req.PartNumber),
	}, func(opts *s3.PresignOptions) {
		opts.Expires = 60 * time.Minute
	})
	if err != nil {
		log.Printf("[multipart part-url] error: %v", err)
		writeError(w, http.StatusInternalServerError, "Failed to generate part upload URL")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"url": presignResult.URL})
}

// POST /api/upload/multipart/complete
// Body: {"key": "...", "uploadId": "...", "parts": [{"partNumber": 1, "etag": "..."}]}
// Returns: {"url": "public URL"}
func multipartCompleteHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	userID, _, err := getUserFromToken(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var req struct {
		Key      string `json:"key"`
		UploadID string `json:"uploadId"`
		Parts    []struct {
			PartNumber int32  `json:"partNumber"`
			ETag       string `json:"etag"`
		} `json:"parts"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	expectedPrefix := fmt.Sprintf("users/%d/", userID)
	if !strings.HasPrefix(req.Key, expectedPrefix) {
		writeError(w, http.StatusForbidden, "Key must be scoped to your user ID")
		return
	}

	completedParts := make([]s3types.CompletedPart, len(req.Parts))
	for i, p := range req.Parts {
		etag := p.ETag
		completedParts[i] = s3types.CompletedPart{
			PartNumber: aws.Int32(p.PartNumber),
			ETag:       aws.String(etag),
		}
	}

	_, err = s3Client.CompleteMultipartUpload(r.Context(), &s3.CompleteMultipartUploadInput{
		Bucket:   aws.String(r2Bucket),
		Key:      aws.String(req.Key),
		UploadId: aws.String(req.UploadID),
		MultipartUpload: &s3types.CompletedMultipartUpload{
			Parts: completedParts,
		},
	})
	if err != nil {
		log.Printf("[multipart complete] error: %v", err)
		writeError(w, http.StatusInternalServerError, "Failed to complete upload")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"url": fileURL(req.Key), "key": req.Key})
}

// POST /api/upload/multipart/abort
// Body: {"key": "...", "uploadId": "..."}
func multipartAbortHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	_, _, err := getUserFromToken(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var req struct {
		Key      string `json:"key"`
		UploadID string `json:"uploadId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	_, _ = s3Client.AbortMultipartUpload(r.Context(), &s3.AbortMultipartUploadInput{
		Bucket:   aws.String(r2Bucket),
		Key:      aws.String(req.Key),
		UploadId: aws.String(req.UploadID),
	})

	w.WriteHeader(http.StatusNoContent)
}

// ─── Target Handlers ──────────────────────────────────────────────────────────

// POST /api/targets/save
// Body: {"targets": [{label, planeWidth, planeHeight, planeOffsetY, imageKey, videoKey}], "mindKey": "..."}
// Upserts all targets for the authenticated user (replaces previous set).
func saveTargetsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	userID, _, err := getUserFromToken(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var req struct {
		Targets []struct {
			TargetIndex   int     `json:"targetIndex"`
			Label         string  `json:"label"`
			PlaneWidth    float64 `json:"planeWidth"`
			PlaneHeight   float64 `json:"planeHeight"`
			PlaneOffsetY  float64 `json:"planeOffsetY"`
			ImageKey      string  `json:"imageKey"`
			VideoKey      string  `json:"videoKey"`
			TargetType      string  `json:"targetType"`
			URLLink         string  `json:"urlLink"`
			AnimationEffect string  `json:"animationEffect"`
			FileSizeBytes   int64   `json:"fileSizeBytes"`
			FileName        string  `json:"fileName"`
		} `json:"targets"`
		MindKey  string `json:"mindKey"`
		IsPublic bool   `json:"isPublic"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if len(req.Targets) == 0 {
		writeError(w, http.StatusBadRequest, "targets array is required")
		return
	}

	// Append new targets instead of replacing — find the next available index
	tx, err := db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to start transaction")
		return
	}
	defer tx.Rollback(r.Context())

	var maxIdx int
	_ = tx.QueryRow(r.Context(),
		"SELECT COALESCE(MAX(target_index), -1) FROM ar_targets WHERE user_id=$1 AND is_public=$2",
		userID, req.IsPublic,
	).Scan(&maxIdx)
	startIdx := maxIdx + 1

	for i, t := range req.Targets {
		targetType := t.TargetType
		if targetType == "" {
			targetType = "video"
		}
		animationEffect := t.AnimationEffect
		if animationEffect == "" {
			animationEffect = "popIn"
		}

		// PSD/CDR have no in-browser renderer — generate a JPG thumbnail
		// server-side so the scanner can show the user what actually matched
		// before they download the original file.
		previewKey := ""
		if targetType == "document" && t.URLLink != "" {
			ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(t.URLLink), "."))
			if ext == "psd" || ext == "cdr" {
				docKey := strings.TrimPrefix(t.URLLink, r2PublicURL+"/")
				if pk, err := generateDocPreview(r.Context(), userID, docKey, ext, startIdx+i); err == nil {
					previewKey = pk
				}
			}
		}

		_, err = tx.Exec(r.Context(), `
			INSERT INTO ar_targets (user_id, target_index, label, plane_width, plane_height, plane_offset_y, image_key, video_key, mind_key, is_public, target_type, url_link, file_size_bytes, file_name, preview_key, animation_effect)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
			userID, startIdx+i, t.Label, t.PlaneWidth, t.PlaneHeight, t.PlaneOffsetY, t.ImageKey, t.VideoKey, req.MindKey,
			req.IsPublic, targetType, t.URLLink, t.FileSizeBytes, t.FileName, previewKey, animationEffect,
		)
		if err != nil {
			log.Printf("[saveTargets] insert error: %v", err)
			writeError(w, http.StatusInternalServerError, "Failed to save targets")
			return
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to commit targets")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "saved"})
}

// GET /api/targets
// Returns the user's saved targets with public R2 URLs.
func getTargetsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	userID, _, err := getUserFromToken(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	rows, err := db.Query(r.Context(), `
		SELECT target_index, label, plane_width, plane_height, plane_offset_y, image_key, video_key, mind_key,
		       COALESCE(target_type, 'video'), COALESCE(url_link, ''), COALESCE(is_public, false),
		       created_at, COALESCE(file_name, ''), COALESCE(preview_key, ''), COALESCE(animation_effect, 'popIn')
		FROM ar_targets WHERE user_id=$1
		ORDER BY target_index`, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to fetch targets")
		return
	}
	defer rows.Close()

	type TargetResponse struct {
		TargetIndex     int       `json:"targetIndex"`
		Label           string    `json:"label"`
		PlaneWidth      float64   `json:"planeWidth"`
		PlaneHeight     float64   `json:"planeHeight"`
		PlaneOffsetY    float64   `json:"planeOffsetY"`
		ImageURL        string    `json:"imageUrl"`
		VideoURL        string    `json:"videoUrl"`
		ImageKey        string    `json:"imageKey"`
		VideoKey        string    `json:"videoKey"`
		MindKey         string    `json:"mindKey"`
		TargetType      string    `json:"targetType"`
		URLLink         string    `json:"urlLink"`
		AnimationEffect string    `json:"animationEffect"`
		IsPublic        bool      `json:"isPublic"`
		CreatedAt       time.Time `json:"createdAt"`
		FileName        string    `json:"fileName"`
		PreviewURL      string    `json:"previewUrl"`
	}

	var targets []TargetResponse
	var mindURL string

	for rows.Next() {
		var t TargetResponse
		var imageKey, videoKey, mindKey, previewKey string
		if err := rows.Scan(&t.TargetIndex, &t.Label, &t.PlaneWidth, &t.PlaneHeight, &t.PlaneOffsetY,
			&imageKey, &videoKey, &mindKey, &t.TargetType, &t.URLLink, &t.IsPublic, &t.CreatedAt,
			&t.FileName, &previewKey, &t.AnimationEffect); err != nil {
			continue
		}
		t.ImageKey = imageKey
		t.VideoKey = videoKey
		t.MindKey = mindKey
		t.ImageURL = fileURL(imageKey)
		t.VideoURL = fileURL(videoKey)
		t.PreviewURL = fileURL(previewKey)
		if mindURL == "" {
			mindURL = fileURL(mindKey)
		}
		targets = append(targets, t)
	}

	if targets == nil {
		targets = []TargetResponse{}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"targets": targets,
		"mindUrl": mindURL,
		"hasData": len(targets) > 0,
	})
}

// GET /api/targets/public
// Returns all public targets across all users (no auth required).
func getPublicTargetsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	rows, err := db.Query(r.Context(), `
		SELECT label, plane_width, plane_height, plane_offset_y,
		       COALESCE(image_key,''), COALESCE(video_key,''),
		       COALESCE(target_type,'video'), COALESCE(url_link,''),
		       COALESCE(file_name,''), COALESCE(preview_key,''), COALESCE(animation_effect,'popIn')
		FROM ar_targets WHERE is_public = true
		ORDER BY id`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to fetch public targets")
		return
	}
	defer rows.Close()

	type PublicTarget struct {
		Label           string  `json:"label"`
		PlaneWidth      float64 `json:"planeWidth"`
		PlaneHeight     float64 `json:"planeHeight"`
		PlaneOffsetY    float64 `json:"planeOffsetY"`
		ImageURL        string  `json:"imageUrl"`
		VideoURL        string  `json:"videoUrl"`
		TargetType      string  `json:"targetType"`
		URLLink         string  `json:"urlLink"`
		AnimationEffect string  `json:"animationEffect"`
		FileName        string  `json:"fileName"`
		PreviewURL      string  `json:"previewUrl"`
	}

	var targets []PublicTarget
	for rows.Next() {
		var t PublicTarget
		var imageKey, videoKey, previewKey string
		if err := rows.Scan(&t.Label, &t.PlaneWidth, &t.PlaneHeight, &t.PlaneOffsetY,
			&imageKey, &videoKey, &t.TargetType, &t.URLLink, &t.FileName, &previewKey, &t.AnimationEffect); err != nil {
			continue
		}
		t.ImageURL = fileURL(imageKey)
		t.VideoURL = fileURL(videoKey)
		t.PreviewURL = fileURL(previewKey)
		targets = append(targets, t)
	}
	if targets == nil {
		targets = []PublicTarget{}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"targets": targets})
}

// DELETE /api/targets
// Clears all targets for the authenticated user.
func deleteTargetsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	userID, _, err := getUserFromToken(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	_, err = db.Exec(r.Context(), "DELETE FROM ar_targets WHERE user_id=$1", userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to delete targets")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// GET /api/storage — returns bytes used per visibility for the authenticated user.
func getStorageHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	userID, _, err := getUserFromToken(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	rows, err := db.Query(r.Context(),
		"SELECT is_public, COALESCE(SUM(file_size_bytes),0) FROM ar_targets WHERE user_id=$1 GROUP BY is_public", userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to query storage")
		return
	}
	defer rows.Close()

	var privateBytes, publicBytes int64
	for rows.Next() {
		var isPublic bool
		var total int64
		if err := rows.Scan(&isPublic, &total); err != nil { continue }
		if isPublic { publicBytes = total } else { privateBytes = total }
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"privateBytes": privateBytes,
		"publicBytes":  publicBytes,
		"limitBytes":   int64(250 * 1024 * 1024),
	})
}

// ─── Reset Token ──────────────────────────────────────────────────────────────

func makeResetToken(mobile string) string {
	payload := map[string]interface{}{"mobile": mobile, "type": "reset", "exp": time.Now().Add(15 * time.Minute).Unix()}
	payloadJSON, _ := json.Marshal(payload)
	payloadB64 := base64.RawURLEncoding.EncodeToString(payloadJSON)
	mac := hmac.New(sha256.New, jwtSecret)
	mac.Write([]byte(payloadB64))
	return payloadB64 + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func verifyResetToken(token string) (string, error) {
	parts := strings.SplitN(token, ".", 2)
	if len(parts) != 2 {
		return "", fmt.Errorf("invalid token")
	}
	mac := hmac.New(sha256.New, jwtSecret)
	mac.Write([]byte(parts[0]))
	if !hmac.Equal([]byte(parts[1]), []byte(base64.RawURLEncoding.EncodeToString(mac.Sum(nil)))) {
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
	return payload["mobile"].(string), nil
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func getUserByIdentifier(ctx context.Context, identifier string) (User, bool) {
	mobile := strings.TrimSpace(identifier)
	var user User
	err := db.QueryRow(ctx, `
		SELECT id, mobile, first_name, last_name FROM users WHERE mobile=$1`, mobile,
	).Scan(&user.ID, &user.Mobile, &user.FirstName, &user.LastName)
	if err == nil {
		return user, true
	}
	return User{}, false
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

// ─── AI Poster Generation ────────────────────────────────────────────────────

type PosterContent struct {
	Title       string            `json:"title"`
	Name        string            `json:"name"`
	Message     string            `json:"message"`
	Subtitle    string            `json:"subtitle"`
	Emojis      string            `json:"emojis"`
	Colors      map[string]string `json:"colors"`
	ImageBase64 string            `json:"imageBase64,omitempty"`
}

// POST /api/poster/generate — calls Claude to create poster content
func generatePosterHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Occasion string `json:"occasion"`
		Name     string `json:"name"`
		Details  string `json:"details"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Occasion == "" {
		writeError(w, http.StatusBadRequest, "occasion is required")
		return
	}

	apiKey := os.Getenv("ANTHROPIC_API_KEY")
	if apiKey == "" {
		writeError(w, http.StatusServiceUnavailable, "AI service not configured")
		return
	}

	nameStr := "someone special"
	if strings.TrimSpace(req.Name) != "" {
		nameStr = strings.TrimSpace(req.Name)
	}
	extra := ""
	if strings.TrimSpace(req.Details) != "" {
		extra = " Extra details: " + req.Details + "."
	}

	prompt := fmt.Sprintf(`Create content for a beautiful %s celebration poster for %s.%s

Return ONLY valid JSON with this exact structure (no markdown, no extra text):
{
  "title": "main greeting line (e.g. Happy Birthday!)",
  "name": "%s",
  "message": "warm heartfelt 2-sentence wish",
  "subtitle": "short inspiring tagline under 8 words",
  "emojis": "3-4 relevant celebration emojis",
  "colors": {
    "bg": "dark hex background matching occasion",
    "primary": "main accent hex color",
    "secondary": "secondary hex color",
    "text": "#ffffff"
  }
}`, req.Occasion, nameStr, extra, nameStr)

	body, _ := json.Marshal(map[string]interface{}{
		"model":      "claude-haiku-4-5-20251001",
		"max_tokens": 512,
		"messages":   []map[string]string{{"role": "user", "content": prompt}},
	})

	httpReq, err := http.NewRequest("POST", "https://api.anthropic.com/v1/messages", bytes.NewReader(body))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to build request")
		return
	}
	httpReq.Header.Set("x-api-key", apiKey)
	httpReq.Header.Set("anthropic-version", "2023-06-01")
	httpReq.Header.Set("content-type", "application/json")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		writeError(w, http.StatusBadGateway, "AI service unreachable")
		return
	}
	defer resp.Body.Close()

	var ar struct {
		Content []struct {
			Text string `json:"text"`
		} `json:"content"`
		Error *struct{ Message string `json:"message"` } `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&ar); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to parse AI response")
		return
	}
	if ar.Error != nil {
		writeError(w, http.StatusBadGateway, ar.Error.Message)
		return
	}
	if len(ar.Content) == 0 {
		writeError(w, http.StatusInternalServerError, "empty AI response")
		return
	}

	text := strings.TrimSpace(ar.Content[0].Text)
	text = strings.TrimPrefix(text, "```json")
	text = strings.TrimPrefix(text, "```")
	text = strings.TrimSuffix(text, "```")
	text = strings.TrimSpace(text)

	var poster PosterContent
	if err := json.Unmarshal([]byte(text), &poster); err != nil {
		poster = PosterContent{
			Title: "Celebration!", Name: nameStr,
			Message:  text,
			Subtitle: "With Love & Joy", Emojis: "🎉✨🌟",
			Colors: map[string]string{"bg": "#0a1628", "primary": "#00C9A7", "secondary": "#C9A84C", "text": "#ffffff"},
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(poster)
}

// POST /api/poster/save — persists a generated poster to the caller's history.
// Body: same shape as the /api/poster/generate response (PosterContent).
func savePosterHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	userID, _, err := getUserFromToken(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	var p PosterContent
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(p.Title) == "" {
		writeError(w, http.StatusBadRequest, "title is required")
		return
	}

	// Uploading the AI art is best-effort — a failed upload shouldn't lose the poster
	// text/colors the user already saw generated; it just saves without an image.
	imageKey := ""
	if p.ImageBase64 != "" && s3Client != nil {
		raw := p.ImageBase64
		if idx := strings.Index(raw, ","); idx != -1 && strings.HasPrefix(raw, "data:") {
			raw = raw[idx+1:]
		}
		if imgData, err := base64.StdEncoding.DecodeString(raw); err == nil {
			key := fmt.Sprintf("posters/%d/poster-%d.png", userID, time.Now().UnixMilli())
			bucket := os.Getenv("R2_BUCKET_NAME")
			contentType := "image/png"
			_, uploadErr := s3Client.PutObject(r.Context(), &s3.PutObjectInput{
				Bucket: &bucket, Key: &key, Body: bytes.NewReader(imgData), ContentType: &contentType,
			})
			if uploadErr == nil {
				imageKey = key
			} else {
				log.Printf("[poster] R2 upload error: %v", uploadErr)
			}
		}
	}

	colorsJSON, _ := json.Marshal(p.Colors)
	var id int64
	err = db.QueryRow(r.Context(), `
		INSERT INTO poster_history (user_id, title, name, message, subtitle, emojis, colors, image_key)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id`,
		userID, p.Title, p.Name, p.Message, p.Subtitle, p.Emojis, colorsJSON, imageKey).Scan(&id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save poster")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"id": id, "status": "ok"})
}

// GET /api/poster/history — the caller's previously generated posters, newest first.
func getPosterHistoryHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	userID, _, err := getUserFromToken(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	rows, err := db.Query(r.Context(), `
		SELECT id, title, name, message, subtitle, emojis, colors, image_key, created_at
		FROM poster_history WHERE user_id = $1
		ORDER BY created_at DESC LIMIT 50`, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch poster history")
		return
	}
	defer rows.Close()

	type PosterEntry struct {
		ID        int64             `json:"id"`
		Title     string            `json:"title"`
		Name      string            `json:"name"`
		Message   string            `json:"message"`
		Subtitle  string            `json:"subtitle"`
		Emojis    string            `json:"emojis"`
		Colors    map[string]string `json:"colors"`
		ImageURL  string            `json:"imageUrl,omitempty"`
		CreatedAt time.Time         `json:"createdAt"`
	}
	var posters []PosterEntry
	for rows.Next() {
		var p PosterEntry
		var colorsJSON []byte
		var imageKey string
		if err := rows.Scan(&p.ID, &p.Title, &p.Name, &p.Message, &p.Subtitle, &p.Emojis, &colorsJSON, &imageKey, &p.CreatedAt); err != nil {
			continue
		}
		_ = json.Unmarshal(colorsJSON, &p.Colors)
		p.ImageURL = fileURL(imageKey)
		posters = append(posters, p)
	}
	if posters == nil {
		posters = []PosterEntry{}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"posters": posters})
}

// ─── Reviews ────────────────────────────────────────────────────────────────

// GET /api/reviews — public list of the most recent user reviews, newest first.
func getReviewsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	rows, err := db.Query(r.Context(), `
		SELECT u.first_name, r.rating, r.review_text, r.created_at
		FROM reviews r JOIN users u ON u.id = r.user_id
		ORDER BY r.created_at DESC LIMIT 20`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch reviews")
		return
	}
	defer rows.Close()

	type Review struct {
		Name      string    `json:"name"`
		Rating    int       `json:"rating"`
		Text      string    `json:"text"`
		CreatedAt time.Time `json:"createdAt"`
	}
	var reviews []Review
	for rows.Next() {
		var rv Review
		if err := rows.Scan(&rv.Name, &rv.Rating, &rv.Text, &rv.CreatedAt); err != nil {
			continue
		}
		reviews = append(reviews, rv)
	}
	if reviews == nil {
		reviews = []Review{}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"reviews": reviews})
}

// POST /api/reviews/submit — creates or updates the authenticated user's review.
// Body: {"rating": 1-5, "text": "..."}
func submitReviewHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	userID, _, err := getUserFromToken(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	var req struct {
		Rating int    `json:"rating"`
		Text   string `json:"text"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Text = strings.TrimSpace(req.Text)
	if req.Rating < 1 || req.Rating > 5 {
		writeError(w, http.StatusBadRequest, "rating must be between 1 and 5")
		return
	}
	if req.Text == "" || len(req.Text) > 500 {
		writeError(w, http.StatusBadRequest, "review text must be 1-500 characters")
		return
	}

	_, err = db.Exec(r.Context(), `
		INSERT INTO reviews (user_id, rating, review_text)
		VALUES ($1, $2, $3)
		ON CONFLICT (user_id) DO UPDATE SET rating = $2, review_text = $3, created_at = NOW()`,
		userID, req.Rating, req.Text)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save review")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// ─── Razorpay Payment Link ─────────────────────────────────────────────────────

// POST /api/payment/create-link — creates a Razorpay payment link for a plan
func createPaymentLinkHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	_, _, err := getUserFromToken(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	var req struct {
		Plan   string `json:"plan"`   // "basic" | "pro" | "enterprise"
		Name   string `json:"name"`
		Email  string `json:"email"`
		Mobile string `json:"mobile"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	type planInfo struct {
		Amount int64
		Desc   string
	}
	plans := map[string]planInfo{
		"basic":      {9900, "Memoera Basic Plan – ₹99/month"},
		"pro":        {29900, "Memoera Pro Plan – ₹299/month"},
		"enterprise": {79900, "Memoera Enterprise Plan – ₹799/month"},
	}
	info, ok := plans[req.Plan]
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid plan; must be basic, pro, or enterprise")
		return
	}

	keyID := os.Getenv("RAZORPAY_KEY_ID")
	keySecret := os.Getenv("RAZORPAY_KEY_SECRET")
	callbackURL := os.Getenv("RAZORPAY_CALLBACK_URL")
	if callbackURL == "" {
		callbackURL = "https://memoera.in/payment-success"
	}
	if keyID == "" || keySecret == "" {
		writeError(w, http.StatusServiceUnavailable, "Razorpay not configured on server")
		return
	}

	mobile := req.Mobile
	if mobile == "" {
		mobile = "+910000000000"
	}

	payload := map[string]interface{}{
		"amount":      info.Amount,
		"currency":    "INR",
		"description": info.Desc,
		"customer": map[string]string{
			"name":    req.Name,
			"email":   req.Email,
			"contact": mobile,
		},
		"notify": map[string]bool{
			"sms":   true,
			"email": req.Email != "",
		},
		"callback_url":    callbackURL,
		"callback_method": "get",
		"expire_by":       time.Now().Add(24 * time.Hour).Unix(),
	}

	body, _ := json.Marshal(payload)
	rzpReq, err := http.NewRequest("POST", "https://api.razorpay.com/v1/payment_links", bytes.NewReader(body))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to build Razorpay request")
		return
	}
	rzpReq.Header.Set("Content-Type", "application/json")
	rzpReq.SetBasicAuth(keyID, keySecret)

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(rzpReq)
	if err != nil {
		writeError(w, http.StatusBadGateway, "failed to reach Razorpay: "+err.Error())
		return
	}
	defer resp.Body.Close()

	var rzpResp map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&rzpResp)

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		errMsg := "Razorpay error"
		if e, ok2 := rzpResp["error"].(map[string]interface{}); ok2 {
			if desc, ok3 := e["description"].(string); ok3 {
				errMsg = desc
			}
		}
		writeError(w, http.StatusBadGateway, errMsg)
		return
	}

	shortURL, _ := rzpResp["short_url"].(string)
	if shortURL == "" {
		writeError(w, http.StatusInternalServerError, "Razorpay returned no payment URL")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"payment_url": shortURL})
}

// planAmounts maps plan IDs to their price in paise (INR), matching PLANS in the frontend.
var planAmounts = map[string]int64{
	"basic":      9900,
	"pro":        29900,
	"enterprise": 79900,
}

// createOrderHandler handles POST /api/payment/create-order for Razorpay Standard Checkout.
// Body: {"plan": "basic|pro|enterprise"} or {"amount": <paise>}.
// Returns: {order_id, amount, currency, key_id}.
func createOrderHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	userID, _, err := getUserFromToken(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	var req struct {
		Plan   string `json:"plan"`
		Amount int64  `json:"amount"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	amount := req.Amount
	if req.Plan != "" {
		a, ok := planAmounts[req.Plan]
		if !ok {
			writeError(w, http.StatusBadRequest, "invalid plan; must be basic, pro, or enterprise")
			return
		}
		amount = a
	}
	if amount < 100 {
		writeError(w, http.StatusBadRequest, "amount must be at least 100 paise")
		return
	}

	keyID := os.Getenv("RAZORPAY_KEY_ID")
	keySecret := os.Getenv("RAZORPAY_KEY_SECRET")
	if keyID == "" || keySecret == "" {
		writeError(w, http.StatusServiceUnavailable, "Razorpay not configured on server")
		return
	}

	payload := map[string]interface{}{
		"amount":   amount,
		"currency": "INR",
		"receipt":  fmt.Sprintf("rcpt_%d_%d", userID, time.Now().Unix()),
	}
	body, _ := json.Marshal(payload)
	rzpReq, err := http.NewRequest("POST", "https://api.razorpay.com/v1/orders", bytes.NewReader(body))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to build Razorpay request")
		return
	}
	rzpReq.Header.Set("Content-Type", "application/json")
	rzpReq.SetBasicAuth(keyID, keySecret)

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(rzpReq)
	if err != nil {
		writeError(w, http.StatusBadGateway, "failed to reach Razorpay: "+err.Error())
		return
	}
	defer resp.Body.Close()

	var rzpResp map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&rzpResp)

	if resp.StatusCode == http.StatusUnauthorized {
		writeError(w, http.StatusUnauthorized, "Razorpay authentication failed")
		return
	}
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		errMsg := "Razorpay error"
		if e, ok := rzpResp["error"].(map[string]interface{}); ok {
			if desc, ok2 := e["description"].(string); ok2 {
				errMsg = desc
			}
		}
		writeError(w, http.StatusBadGateway, errMsg)
		return
	}

	orderID, _ := rzpResp["id"].(string)
	if orderID == "" {
		writeError(w, http.StatusInternalServerError, "Razorpay returned no order id")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"order_id": orderID,
		"amount":   amount,
		"currency": "INR",
		"key_id":   keyID,
	})
}

// verifyPaymentHandler handles POST /api/payment/verify.
// Body: {razorpay_order_id, razorpay_payment_id, razorpay_signature}.
// Returns 200 {verified: true} only when the HMAC-SHA256 signature matches.
func verifyPaymentHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req struct {
		OrderID   string `json:"razorpay_order_id"`
		PaymentID string `json:"razorpay_payment_id"`
		Signature string `json:"razorpay_signature"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.OrderID == "" || req.PaymentID == "" || req.Signature == "" {
		writeError(w, http.StatusBadRequest, "missing required fields")
		return
	}

	keySecret := os.Getenv("RAZORPAY_KEY_SECRET")
	if keySecret == "" {
		writeError(w, http.StatusServiceUnavailable, "Razorpay not configured on server")
		return
	}

	// Signature = HMAC-SHA256(order_id + "|" + payment_id, key_secret), hex-encoded.
	mac := hmac.New(sha256.New, []byte(keySecret))
	mac.Write([]byte(req.OrderID + "|" + req.PaymentID))
	expected := hex.EncodeToString(mac.Sum(nil))

	if !hmac.Equal([]byte(expected), []byte(req.Signature)) {
		writeError(w, http.StatusBadRequest, "payment signature verification failed")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"verified": true,
		"status":   "success",
	})
}

// ─── Main ─────────────────────────────────────────────────────────────────────

func main() {
	// Load .env file in development (ignored in production where env vars are set directly)
	_ = godotenv.Load()

	ctx := context.Background()

	if err := initDB(ctx); err != nil {
		log.Printf("⚠️  DB init skipped (no real DATABASE_URL configured): %v", err)
	} else {
		defer db.Close()
	}

	if err := initR2(); err != nil {
		log.Printf("⚠️  R2 init skipped (no real R2 credentials configured): %v", err)
	}

	allowedOrigin := getAllowedOrigin()
	port := getPort()

	mux := http.NewServeMux()

	// Health
	mux.HandleFunc("/health", healthHandler)

	// Auth
	mux.HandleFunc("/api/auth/send-signup-otp", sendSignupOTPHandler)
	mux.HandleFunc("/api/auth/signup", signUpHandler)
	mux.HandleFunc("/api/auth/signin", signInHandler)
	mux.HandleFunc("/api/auth/forgot-password", forgotPasswordHandler)
	mux.HandleFunc("/api/auth/verify-security-question", verifySecurityQuestionHandler)
	mux.HandleFunc("/api/auth/verify-otp", verifyOTPHandler)
	mux.HandleFunc("/api/auth/reset-password", resetPasswordHandler)

	// Me + profile update
	mux.HandleFunc("/api/me", getMeHandler)
	mux.HandleFunc("/api/auth/profile", updateProfileHandler)
	mux.HandleFunc("/api/auth/profile/photo", updateProfilePhotoHandler)
	mux.HandleFunc("/api/auth/change-password", changePasswordHandler)

	// File upload (presigned URLs + multipart)
	mux.HandleFunc("/api/upload/presign", presignUploadHandler)
	mux.HandleFunc("/api/upload/presign-public-mind", presignPublicMindHandler)
	mux.HandleFunc("/api/upload/multipart/init", multipartInitHandler)
	mux.HandleFunc("/api/upload/multipart/part-url", multipartPartURLHandler)
	mux.HandleFunc("/api/upload/multipart/complete", multipartCompleteHandler)
	mux.HandleFunc("/api/upload/multipart/abort", multipartAbortHandler)

	// AR targets
	mux.HandleFunc("/api/targets/save", saveTargetsHandler)
	mux.HandleFunc("/api/targets/public", getPublicTargetsHandler)
	mux.HandleFunc("/api/targets", getTargetsHandler)
	mux.HandleFunc("/api/targets/delete", deleteTargetsHandler)
	mux.HandleFunc("/api/storage", getStorageHandler)

	// AI Poster
	mux.HandleFunc("/api/poster/generate", generatePosterHandler)
	mux.HandleFunc("/api/poster/save", savePosterHandler)
	mux.HandleFunc("/api/poster/history", getPosterHistoryHandler)

	// Reviews
	mux.HandleFunc("/api/reviews", getReviewsHandler)
	mux.HandleFunc("/api/reviews/submit", submitReviewHandler)

	// Razorpay payment link
	mux.HandleFunc("/api/payment/create-link", createPaymentLinkHandler)
	mux.HandleFunc("/api/payment/create-order", createOrderHandler)
	mux.HandleFunc("/api/payment/verify", verifyPaymentHandler)

	handler := loggingMiddleware(gzipMiddleware(recoveryMiddleware(corsMiddleware(allowedOrigin, mux))))

	server := &http.Server{
		Addr:         port,
		Handler:      handler,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	log.Printf("webar-backend listening on %s", port)
	log.Printf("CORS allowed origin: %s", allowedOrigin)

	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("server error: %v", err)
	}
}
