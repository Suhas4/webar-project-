package main

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
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

// ─── In-memory store ──────────────────────────────────────────────────────────

var (
	users       = map[string]User{} // keyed by email (lowercase)
	mobileIndex = map[string]string{} // mobile → email
	mu          sync.RWMutex
	jwtSecret   []byte
)

func init() {
	// Generate a random secret on startup (tokens invalidated on restart — fine for dev)
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

// hashPassword hashes a password with a salt using SHA-256.
func hashPassword(password, salt string) string {
	h := sha256.New()
	h.Write([]byte(salt + password))
	return fmt.Sprintf("%x", h.Sum(nil))
}

// generateSalt creates a random hex salt.
func generateSalt() string {
	b := make([]byte, 16)
	rand.Read(b)
	return fmt.Sprintf("%x", b)
}

// makeToken creates a simple signed token: base64(payload).base64(signature)
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

// verifyToken verifies and decodes a token. Returns email or error.
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
			// Also allow ngrok tunnels for mobile testing
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

	// Validate required fields
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

	// Check duplicate email
	if _, exists := users[email]; exists {
		writeError(w, http.StatusConflict, "An account with this email already exists")
		return
	}
	// Check duplicate mobile
	if _, exists := mobileIndex[req.Mobile]; exists {
		writeError(w, http.StatusConflict, "An account with this mobile number already exists")
		return
	}

	// Hash password with salt
	salt := generateSalt()
	passwordHash := salt + ":" + hashPassword(req.Password, salt)

	// Hash security answer
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

	// Look up by email or mobile
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

	// Verify password
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

	// ── Routes ────────────────────────────────────────────────────────────────
	mux.HandleFunc("/health", healthHandler)
	mux.HandleFunc("/api/auth/signup", signUpHandler)
	mux.HandleFunc("/api/auth/signin", signInHandler)

	// ── Middleware chain: logging → CORS → router ─────────────────────────────
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
