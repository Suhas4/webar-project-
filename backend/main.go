package main

import (
	"bytes"
	"compress/gzip"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"crypto/sha256"
	"crypto/subtle"
	"crypto/tls"
	"encoding/base32"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"math/big"
	"net"
	"net/http"
	"net/smtp"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"

	"github.com/joho/godotenv"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	s3types "github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	embeddedpostgres "github.com/fergusstrange/embedded-postgres"
)

// ─── Data Models ──────────────────────────────────────────────────────────────

type User struct {
	ID               int64     `json:"id"`
	FirstName        string    `json:"firstName"`
	LastName         string    `json:"lastName"`
	Mobile           string    `json:"mobile"`
	Email            string    `json:"email,omitempty"`
	DateOfBirth      string    `json:"dateOfBirth,omitempty"`
	ProfilePhotoURL  string    `json:"profilePhotoUrl,omitempty"`
	PasswordHash     string    `json:"-"`
	SecurityQuestion string    `json:"securityQuestion"`
	SecurityAnswer   string    `json:"-"`
	AccountType      string    `json:"accountType,omitempty"`
	OnboardingComplete bool    `json:"onboardingComplete"`
	CreatedAt        time.Time `json:"createdAt,omitempty"`
	// Populated by /api/me only — the Profile screen needs these to render
	// verification state and the Business Information card. Sign-in/sign-up
	// responses leave them at zero values.
	// Derived, never stored. Lets the app hide admin-only UI; every admin
	// endpoint re-checks server-side regardless.
	//
	// NOTE: isAdminIdentity() is compared against whatever getUserFromToken
	// returns, which is the MOBILE number — the ADMIN_EMAIL env var is
	// misleadingly named but every existing admin check works this way, so
	// this follows the same convention rather than diverging from it.
	IsAdmin          bool      `json:"isAdmin"`
	EmailVerified    bool      `json:"emailVerified"`
	TwoFactorEnabled bool      `json:"twoFactorEnabled"`
	NotifyEmail      bool      `json:"notifyEmail"`
	NotifyMarketing  bool      `json:"notifyMarketing"`
	BusinessName     string    `json:"businessName,omitempty"`
	BusinessAddress  string    `json:"businessAddress,omitempty"`
	BusinessPhone    string    `json:"businessPhone,omitempty"`
	BusinessEmail    string    `json:"businessEmail,omitempty"`
	BusinessWebsite  string    `json:"businessWebsite,omitempty"`
	BusinessInstagram string   `json:"businessInstagram,omitempty"`
	BusinessGstin    string    `json:"businessGstin,omitempty"`
	BusinessCategory string    `json:"businessCategory,omitempty"`
	BusinessHours    string    `json:"businessHours,omitempty"`
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
	// Guessing budget for this specific code. A 6-digit OTP is one million
	// values; without a cap it can simply be enumerated inside the validity
	// window, which makes it no barrier at all.
	Attempts  int
}

// Guesses allowed against a single OTP before it is discarded.
const maxOTPAttempts = 5

// ─── Rate limiting ────────────────────────────────────────────────────────────
//
// Fixed-window counters held in process. That is sufficient today because the
// backend runs as a single Render instance — if it is ever scaled to more than
// one, this must move to Redis or the limits become per-instance and therefore
// meaningless.
//
// Keys are scoped per action so one endpoint's traffic can't exhaust another's
// budget, e.g. "signin:9876500518" or "resolve:203.0.113.9".

type rateWindow struct {
	count int
	reset time.Time
}

var (
	rateMu    sync.Mutex
	rateTable = map[string]*rateWindow{}
)

// rateAllow reports whether this key may proceed, and how long until the window
// resets if not. Also opportunistically evicts expired entries so the table
// cannot grow without bound.
func rateAllow(key string, limit int, window time.Duration) (bool, time.Duration) {
	now := time.Now()
	rateMu.Lock()
	defer rateMu.Unlock()

	if len(rateTable) > 10000 {
		for k, v := range rateTable {
			if now.After(v.reset) {
				delete(rateTable, k)
			}
		}
	}

	w, ok := rateTable[key]
	if !ok || now.After(w.reset) {
		rateTable[key] = &rateWindow{count: 1, reset: now.Add(window)}
		return true, 0
	}
	if w.count >= limit {
		return false, time.Until(w.reset)
	}
	w.count++
	return true, 0
}

// clientIP prefers the proxy headers Render/Cloudflare set, since RemoteAddr is
// the load balancer. Falls back to RemoteAddr with the ephemeral port stripped —
// leaving the port in would make every request a distinct client and silently
// disable every limit below.
func clientIP(r *http.Request) string {
	if ip := r.Header.Get("CF-Connecting-IP"); ip != "" {
		return strings.TrimSpace(ip)
	}
	if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
		return strings.TrimSpace(strings.Split(fwd, ",")[0])
	}
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return host
	}
	return r.RemoteAddr
}

// enforceRate writes a 429 and returns false when the caller should stop.
func enforceRate(w http.ResponseWriter, key string, limit int, window time.Duration, msg string) bool {
	ok, retry := rateAllow(key, limit, window)
	if ok {
		return true
	}
	secs := int(retry.Seconds()) + 1
	w.Header().Set("Retry-After", strconv.Itoa(secs))
	writeError(w, http.StatusTooManyRequests, fmt.Sprintf("%s Try again in %d seconds.", msg, secs))
	return false
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
	db            *pgxpool.Pool
	s3Client      *s3.Client
	presignClient *s3.PresignClient
	r2Bucket      string
	r2PublicURL   string

	otpStore  = map[string]OTPEntry{}
	otpMu     sync.Mutex
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

// ─── Embedded Postgres (local dev fallback) ──────────────────────────────────
// When DATABASE_URL isn't set (e.g. fresh local checkout with no Neon/Postgres
// configured), spin up a real local Postgres automatically so sign-up/sign-in
// work out of the box instead of failing with "DB not configured". Data lives
// under the user's config dir so accounts persist across backend restarts.
func startEmbeddedPostgresIfNeeded() (*embeddedpostgres.EmbeddedPostgres, error) {
	if os.Getenv("DATABASE_URL") != "" {
		return nil, nil
	}

	baseDir, err := os.UserConfigDir()
	if err != nil {
		baseDir = "."
	}
	dataDir := filepath.Join(baseDir, "memoera-embedded-postgres", "data")

	const (
		user = "memoera"
		pass = "memoera"
		dbName = "memoera"
		port = 5433
	)

	pg := embeddedpostgres.NewDatabase(embeddedpostgres.DefaultConfig().
		Username(user).
		Password(pass).
		Database(dbName).
		Port(port).
		DataPath(dataDir).
		Logger(io.Discard))

	if err := pg.Start(); err != nil {
		return nil, fmt.Errorf("embedded postgres start: %w", err)
	}

	os.Setenv("DATABASE_URL", fmt.Sprintf("postgres://%s:%s@localhost:%d/%s?sslmode=disable", user, pass, port, dbName))
	log.Printf("🐘 Embedded local Postgres running on :%d (data: %s)", port, dataDir)
	return pg, nil
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

	// Content moderation: reversible admin takedown for Public targets (kept
	// separate from delete so a wrongly-flagged target can be restored), plus
	// a viewer-facing report queue for admin review.
	_, _ = db.Exec(ctx, `ALTER TABLE ar_targets ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false`)
	_, _ = db.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS content_reports (
			id          BIGSERIAL PRIMARY KEY,
			target_id   BIGINT NOT NULL REFERENCES ar_targets(id) ON DELETE CASCADE,
			reason      TEXT NOT NULL,
			status      TEXT NOT NULL DEFAULT 'pending',
			created_at  TIMESTAMPTZ DEFAULT NOW()
		)`)
	_, _ = db.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_content_reports_status ON content_reports(status) WHERE status = 'pending'`)

	// Like/Save on scanned AR content — a viewer can like or save ANY target
	// (their own or someone else's public one), so this is keyed by the
	// viewer's user_id + the target's global id, not target ownership.
	_, _ = db.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS target_interactions (
			id          BIGSERIAL PRIMARY KEY,
			user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			target_id   BIGINT NOT NULL REFERENCES ar_targets(id) ON DELETE CASCADE,
			kind        TEXT NOT NULL CHECK (kind IN ('like','save')),
			created_at  TIMESTAMPTZ DEFAULT NOW(),
			UNIQUE (user_id, target_id, kind)
		)`)
	_, _ = db.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_target_interactions_user_kind ON target_interactions(user_id, kind)`)

	// Product catalogs — a single scannable marker (stored as a normal
	// ar_targets row with targetType='catalog' and urlLink=catalogs.id) opens
	// a browsable list of items, each with its own photo + optional
	// video/link. Reads are public (no auth) so anyone who scans the marker
	// can view the catalog regardless of who created it.
	_, _ = db.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS catalogs (
			id          BIGSERIAL PRIMARY KEY,
			user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			name        TEXT NOT NULL,
			created_at  TIMESTAMPTZ DEFAULT NOW()
		)`)
	_, _ = db.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS catalog_items (
			id           BIGSERIAL PRIMARY KEY,
			catalog_id   BIGINT NOT NULL REFERENCES catalogs(id) ON DELETE CASCADE,
			position     INT NOT NULL DEFAULT 0,
			title        TEXT NOT NULL DEFAULT '',
			description  TEXT NOT NULL DEFAULT '',
			price        TEXT NOT NULL DEFAULT '',
			image_key    TEXT NOT NULL DEFAULT '',
			video_key    TEXT NOT NULL DEFAULT '',
			url_link     TEXT NOT NULL DEFAULT '',
			created_at   TIMESTAMPTZ DEFAULT NOW()
		)`)
	_, _ = db.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_catalog_items_catalog ON catalog_items(catalog_id, position)`)
	_, _ = db.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_catalogs_user ON catalogs(user_id)`)

	// Seller Dashboard / "Buy Now" marketplace — many sellers can each list
	// their own price+contact against the SAME scanned target/marker (unlike
	// ar_targets.user_id, which is just whoever uploaded that AR content).
	// Scanning a product and tapping Buy Now shows every seller listed here
	// for that target, cheapest first — Memoera never handles payment, this
	// is purely a directory connecting buyer to seller (call/WhatsApp).
	_, _ = db.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS product_listings (
			id          BIGSERIAL PRIMARY KEY,
			target_id   BIGINT NOT NULL REFERENCES ar_targets(id) ON DELETE CASCADE,
			seller_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			price       TEXT NOT NULL DEFAULT '',
			moq         TEXT NOT NULL DEFAULT '',
			unit        TEXT NOT NULL DEFAULT '',
			notes       TEXT NOT NULL DEFAULT '',
			created_at  TIMESTAMPTZ DEFAULT NOW(),
			UNIQUE (target_id, seller_id)
		)`)
	_, _ = db.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_product_listings_target ON product_listings(target_id)`)
	_, _ = db.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_product_listings_seller ON product_listings(seller_id)`)

	// Real storage quota / plan / referral bonus tracking (server-authoritative —
	// previously these were only simulated client-side in localStorage).
	_, _ = db.Exec(ctx, `ALTER TABLE users ADD COLUMN IF NOT EXISTS own_referral_code TEXT`)
	_, _ = db.Exec(ctx, `ALTER TABLE users ADD COLUMN IF NOT EXISTS bonus_storage_bytes BIGINT NOT NULL DEFAULT 0`)
	_, _ = db.Exec(ctx, `ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_redeemed BOOLEAN NOT NULL DEFAULT false`)
	_, _ = db.Exec(ctx, `ALTER TABLE users ADD COLUMN IF NOT EXISTS ad_bonus_last_at TIMESTAMPTZ`)
	_, _ = db.Exec(ctx, `ALTER TABLE users ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free'`)
	// Free-plan accounts get a capped number of AI poster generations before
	// they must upgrade — tracked server-side here (not just in poster_history,
	// which only records posters the user chose to save) so usage can't be
	// under-counted by skipping the save step.
	_, _ = db.Exec(ctx, `ALTER TABLE users ADD COLUMN IF NOT EXISTS poster_generations_used INT NOT NULL DEFAULT 0`)
	_, _ = db.Exec(ctx, `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_own_referral_code ON users(own_referral_code) WHERE own_referral_code IS NOT NULL`)

	// Daily streak — current_streak/highest_streak count consecutive calendar
	// days with a meaningful action (scan, upload, etc). last_streak_date is
	// the *client's local* YYYY-MM-DD (not a server timestamp) so a user's
	// "today" always matches their own timezone, not the server's.
	_, _ = db.Exec(ctx, `ALTER TABLE users ADD COLUMN IF NOT EXISTS current_streak INT NOT NULL DEFAULT 0`)
	_, _ = db.Exec(ctx, `ALTER TABLE users ADD COLUMN IF NOT EXISTS highest_streak INT NOT NULL DEFAULT 0`)
	_, _ = db.Exec(ctx, `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_streak_date TEXT`)

	// Onboarding progress — previously only tracked client-side in localStorage,
	// which meant backing out of account-type selection (Back button signs the
	// user out) and signing back in lost all memory of it, dumping the user
	// straight to Home instead of resuming the account-type step. Persisting
	// server-side lets a fresh sign-in correctly resume onboarding.
	_, _ = db.Exec(ctx, `ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT ''`)
	_, _ = db.Exec(ctx, `ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN NOT NULL DEFAULT false`)
	// Business contact details — filled in by BusinessDetailsScreen.jsx (during
	// signup or a later Individual->Business switch from Profile). Exposed
	// read-only to anyone scanning that business's AR content via the "Buy
	// Now"/"Shop Now" button, so a stranger can see how to reach them.
	_, _ = db.Exec(ctx, `ALTER TABLE users ADD COLUMN IF NOT EXISTS business_name TEXT NOT NULL DEFAULT ''`)
	_, _ = db.Exec(ctx, `ALTER TABLE users ADD COLUMN IF NOT EXISTS business_address TEXT NOT NULL DEFAULT ''`)
	_, _ = db.Exec(ctx, `ALTER TABLE users ADD COLUMN IF NOT EXISTS business_phone TEXT NOT NULL DEFAULT ''`)
	_, _ = db.Exec(ctx, `ALTER TABLE users ADD COLUMN IF NOT EXISTS business_email TEXT NOT NULL DEFAULT ''`)
	_, _ = db.Exec(ctx, `ALTER TABLE users ADD COLUMN IF NOT EXISTS business_website TEXT NOT NULL DEFAULT ''`)
	_, _ = db.Exec(ctx, `ALTER TABLE users ADD COLUMN IF NOT EXISTS business_instagram TEXT NOT NULL DEFAULT ''`)
	_, _ = db.Exec(ctx, `ALTER TABLE users ADD COLUMN IF NOT EXISTS business_gstin TEXT NOT NULL DEFAULT ''`)
	// Shown on the redesigned Profile screen's Business Information card.
	_, _ = db.Exec(ctx, `ALTER TABLE users ADD COLUMN IF NOT EXISTS business_category TEXT NOT NULL DEFAULT ''`)
	_, _ = db.Exec(ctx, `ALTER TABLE users ADD COLUMN IF NOT EXISTS business_hours TEXT NOT NULL DEFAULT ''`)

	// Email verification. Mobile is already proven by the signup OTP, but email
	// is free-text and unverified, so the Profile screen offers a "Verify Now"
	// flow that reuses the existing sendEmailOTP transport.
	_, _ = db.Exec(ctx, `ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false`)
	_, _ = db.Exec(ctx, `ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verify_code TEXT NOT NULL DEFAULT ''`)
	_, _ = db.Exec(ctx, `ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verify_expires TIMESTAMPTZ`)

	// TOTP two-factor auth (RFC 6238). The secret is only honoured once
	// twofa_enabled flips true, so a half-finished setup can't lock anyone out.
	_, _ = db.Exec(ctx, `ALTER TABLE users ADD COLUMN IF NOT EXISTS twofa_secret TEXT NOT NULL DEFAULT ''`)
	_, _ = db.Exec(ctx, `ALTER TABLE users ADD COLUMN IF NOT EXISTS twofa_enabled BOOLEAN NOT NULL DEFAULT false`)

	// Notification preferences surfaced in the Profile "Preferences" card.
	_, _ = db.Exec(ctx, `ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_email BOOLEAN NOT NULL DEFAULT true`)
	_, _ = db.Exec(ctx, `ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_marketing BOOLEAN NOT NULL DEFAULT false`)

	// Recent sign-ins, so "Security & Login" can show real session history
	// instead of a placeholder. Only coarse UA-derived labels are stored — no
	// raw IP — since this is displayed back to the user, not used for security
	// decisions. Trimmed to the newest 10 rows per user on each new sign-in.
	_, _ = db.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS login_activity (
			id         BIGSERIAL PRIMARY KEY,
			user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			browser    TEXT NOT NULL DEFAULT '',
			platform   TEXT NOT NULL DEFAULT '',
			is_mobile  BOOLEAN NOT NULL DEFAULT false,
			created_at TIMESTAMPTZ DEFAULT NOW()
		)`)
	_, _ = db.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_login_activity_user ON login_activity(user_id, created_at DESC)`)

	// ── NFC platform ─────────────────────────────────────────────────────────
	// The chip itself only ever carries https://memoera.in/nfc/<code>. Nothing
	// about the owner lives on the sticker, so a customer can change what a tap
	// shows — or hand the sticker to someone else — without it ever being
	// rewritten.
	_, _ = db.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS nfc_batches (
			id           BIGSERIAL PRIMARY KEY,
			batch_code   TEXT NOT NULL UNIQUE,
			manufacturer TEXT NOT NULL DEFAULT '',
			quantity     INT  NOT NULL DEFAULT 0,
			notes        TEXT NOT NULL DEFAULT '',
			created_by   BIGINT REFERENCES users(id) ON DELETE SET NULL,
			created_at   TIMESTAMPTZ DEFAULT NOW()
		)`)

	// Sequence backs the permanent MEM-NFC-######## identity. A sequence rather
	// than max(id)+1 so concurrent batch generation can't hand out a duplicate.
	_, _ = db.Exec(ctx, `CREATE SEQUENCE IF NOT EXISTS nfc_code_seq START 1`)

	// activation_secret is printed on the packaging, never written to the chip.
	// Codes are sequential and therefore guessable, so without a secret anyone
	// who tapped (or simply enumerated) a sticker could claim someone else's.
	_, _ = db.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS nfc_stickers (
			id                BIGSERIAL PRIMARY KEY,
			code              TEXT NOT NULL UNIQUE,
			activation_secret TEXT NOT NULL,
			batch_id          BIGINT REFERENCES nfc_batches(id) ON DELETE SET NULL,
			status            TEXT NOT NULL DEFAULT 'manufactured',
			owner_id          BIGINT REFERENCES users(id) ON DELETE SET NULL,
			experience_id     BIGINT,
			name              TEXT NOT NULL DEFAULT '',
			activated_at      TIMESTAMPTZ,
			last_tap_at       TIMESTAMPTZ,
			tap_count         BIGINT NOT NULL DEFAULT 0,
			created_at        TIMESTAMPTZ DEFAULT NOW()
		)`)
	// When the URL was physically written onto this chip. Lets a bulk-encoding
	// run be paused and resumed without re-writing tags already done, and makes
	// "how much of this batch is ready to ship" answerable.
	_, _ = db.Exec(ctx, `ALTER TABLE nfc_stickers ADD COLUMN IF NOT EXISTS encoded_at TIMESTAMPTZ`)
	_, _ = db.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_nfc_stickers_owner ON nfc_stickers(owner_id)`)
	_, _ = db.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_nfc_stickers_batch ON nfc_stickers(batch_id)`)

	// blocks is the ordered block list the experience builder edits. Kept as
	// JSONB so new block types don't need a migration.
	_, _ = db.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS nfc_experiences (
			id         BIGSERIAL PRIMARY KEY,
			owner_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			title      TEXT NOT NULL DEFAULT '',
			theme      TEXT NOT NULL DEFAULT 'midnight',
			blocks     JSONB NOT NULL DEFAULT '[]'::jsonb,
			created_at TIMESTAMPTZ DEFAULT NOW(),
			updated_at TIMESTAMPTZ DEFAULT NOW()
		)`)
	_, _ = db.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_nfc_experiences_owner ON nfc_experiences(owner_id)`)

	// One row per tap. visitor_hash is a salted hash of IP+UA used only to tell
	// repeat visitors from unique ones and to debounce double taps — the raw IP
	// is never stored.
	_, _ = db.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS nfc_taps (
			id           BIGSERIAL PRIMARY KEY,
			sticker_id   BIGINT NOT NULL REFERENCES nfc_stickers(id) ON DELETE CASCADE,
			visitor_hash TEXT NOT NULL DEFAULT '',
			browser      TEXT NOT NULL DEFAULT '',
			platform     TEXT NOT NULL DEFAULT '',
			is_mobile    BOOLEAN NOT NULL DEFAULT false,
			country      TEXT NOT NULL DEFAULT '',
			city         TEXT NOT NULL DEFAULT '',
			created_at   TIMESTAMPTZ DEFAULT NOW()
		)`)
	_, _ = db.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_nfc_taps_sticker ON nfc_taps(sticker_id, created_at DESC)`)

	_, _ = db.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS payment_orders (
			order_id   TEXT PRIMARY KEY,
			user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			plan       TEXT NOT NULL,
			used       BOOLEAN NOT NULL DEFAULT false,
			created_at TIMESTAMPTZ DEFAULT NOW()
		)`)
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

// ─── Storage plans & referral bonus ──────────────────────────────────────────

// planLimitBytes maps a plan id to its per-type (private or public) storage
// cap in bytes. -1 means unlimited. Mirrors the plan copy shown in
// PremiumScreen.jsx (500MB/5GB/Unlimited); "free" matches the long-standing
// 250MB free-tier hint in SettingsScreen.jsx.
var planLimitBytes = map[string]int64{
	"free":       250 * 1024 * 1024,
	"basic":      500 * 1024 * 1024,
	"pro":        5 * 1024 * 1024 * 1024,
	"enterprise": -1,
}

// freePosterLimit is the lifetime number of AI poster generations a "free"
// plan account gets before the AI Poster Studio requires a Premium upgrade.
// Any non-"free" plan (basic/pro/enterprise) is unlimited.
const freePosterLimit = 2

// maxBonusStorageBytes is the combined cap across ad-watch + referral bonus,
// matching MAX_BONUS_MB=100 in ReferFriendScreen.jsx / PremiumScreen.jsx.
const maxBonusStorageBytes = int64(100 * 1024 * 1024)
const adWatchCooldown = 30 * time.Minute
const adMaxSeconds = 30
const adMinSeconds = 10
const referralEarnBytes = int64(50 * 1024 * 1024)

func planLimit(plan string) int64 {
	if l, ok := planLimitBytes[plan]; ok {
		return l
	}
	return planLimitBytes["free"]
}

// isAdminIdentity reports whether the identity carried by the auth token is the
// configured admin.
//
// NOTE on naming: getUserFromToken returns the user's MOBILE number, so this is
// matched against a phone number despite the historic ADMIN_EMAIL variable name.
// ADMIN_MOBILE is the correct name and is preferred; ADMIN_EMAIL is still read
// as a fallback so an existing deployment does not lose admin access the moment
// this ships.
func isAdminIdentity(identity string) bool {
	admin := os.Getenv("ADMIN_MOBILE")
	if admin == "" {
		admin = os.Getenv("ADMIN_EMAIL")
	}
	return admin != "" && identity != "" && strings.EqualFold(identity, admin)
}

// buildReferralCode mirrors buildCode() in ReferFriendScreen.jsx exactly so
// the code a user sees on their own screen is the same one this function
// derives and persists server-side.
func buildReferralCode(firstName, lastName, mobile string, id int64) string {
	fn, ln := firstName, lastName
	if fn == "" {
		fn = "M"
	}
	if ln == "" {
		ln = "E"
	}
	combined := strings.ToUpper(fn + ln)
	if len(combined) > 3 {
		combined = combined[:3]
	}
	base := mobile
	if base == "" {
		base = fmt.Sprintf("%d", id)
	}
	base = strings.ToUpper(base)
	if len(base) > 4 {
		base = base[len(base)-4:]
	}
	return combined + base
}

// ensureOwnReferralCode returns the user's persisted shareable referral code,
// generating and storing it on first use. Falls back to a guaranteed-unique
// code derived from the user's id if the natural code collides.
func ensureOwnReferralCode(ctx context.Context, userID int64, firstName, lastName, mobile string) string {
	candidate := buildReferralCode(firstName, lastName, mobile, userID)
	_, err := db.Exec(ctx, `UPDATE users SET own_referral_code=$1 WHERE id=$2 AND own_referral_code IS NULL`, candidate, userID)
	if err != nil {
		candidate = fmt.Sprintf("MEMO%06d", userID)
		_, _ = db.Exec(ctx, `UPDATE users SET own_referral_code=$1 WHERE id=$2 AND own_referral_code IS NULL`, candidate, userID)
	}
	var code string
	_ = db.QueryRow(ctx, `SELECT own_referral_code FROM users WHERE id=$1`, userID).Scan(&code)
	if code == "" {
		code = candidate
	}
	return code
}

// ─── Token helpers ────────────────────────────────────────────────────────────

// bcrypt cost 12 — roughly 250ms per hash on Render's shared CPU. Expensive
// enough that offline guessing against a leaked database is impractical, cheap
// enough that sign-in stays responsive.
const bcryptCost = 12

// hashSecret is what every NEW password and security answer is stored with.
//
// Replaces a bare salted SHA-256. SHA-256 is fast by design, so a leaked
// database could be brute-forced at billions of guesses per second on a single
// GPU — the per-user salt only defeated rainbow tables, not targeted cracking.
func hashSecret(plain string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(plain), bcryptCost)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// secretMatches verifies against either storage format so existing accounts
// keep working. Legacy values are "<salt>:<sha256hex>"; bcrypt values always
// begin "$2". needsUpgrade is true when a legacy hash matched, which is the
// caller's cue to silently re-store it as bcrypt — the plaintext is only
// available at that moment.
func secretMatches(stored, plain string) (ok bool, needsUpgrade bool) {
	if strings.HasPrefix(stored, "$2") {
		return bcrypt.CompareHashAndPassword([]byte(stored), []byte(plain)) == nil, false
	}
	parts := strings.SplitN(stored, ":", 2)
	if len(parts) != 2 {
		return false, false
	}
	// Constant-time: the previous implementation compared with != , which
	// short-circuits on the first differing byte and is timing-observable.
	if subtle.ConstantTimeCompare([]byte(legacyHash(plain, parts[0])), []byte(parts[1])) != 1 {
		return false, false
	}
	return true, true
}

// legacyHash reproduces the retired salted-SHA-256 scheme. Kept solely so
// existing credentials can still be verified once, then upgraded.
func legacyHash(password, salt string) string {
	h := sha256.New()
	h.Write([]byte(salt + password))
	return fmt.Sprintf("%x", h.Sum(nil))
}

// upgradeSecret re-stores a freshly-verified credential as bcrypt. Best effort:
// a failure here must never block a sign-in that already succeeded.
func upgradeSecret(ctx context.Context, column string, userID int64, plain string) {
	hashed, err := hashSecret(plain)
	if err != nil {
		return
	}
	if _, err := db.Exec(ctx,
		fmt.Sprintf("UPDATE users SET %s=$1 WHERE id=$2", column), hashed, userID); err != nil {
		log.Printf("[auth] bcrypt upgrade of %s failed for user %d: %v", column, userID, err)
		return
	}
	log.Printf("[auth] upgraded %s to bcrypt for user %d", column, userID)
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

// otpMatches accepts the real generated OTP, or — only when no real SMS/voice
// provider is configured (local/dev, where OTPs are just logged to the
// console instead of delivered) — a fixed demo code, so testers don't have to
// dig through server logs for every OTP. This can never activate once
// TWOFACTOR_API_KEY is set (i.e. in production).
func otpMatches(expected, provided string) bool {
	provided = strings.TrimSpace(provided)
	if provided == expected {
		return true
	}
	return os.Getenv("TWOFACTOR_API_KEY") == "" && provided == "000000"
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

// originAllowed matches a request Origin against the configured production
// origin plus the local dev servers and the Capacitor shells.
//
// The native apps are a real case: Android WebView sends
// "https://localhost" and iOS sends "capacitor://localhost", so hard-coding
// only FRONTEND_ORIGIN would break both installed apps.
func originAllowed(origin, configured string) bool {
	allowed := []string{
		configured,
		"https://memoera.in",
		"https://www.memoera.in",
		"http://localhost:5173", // vite dev
		"http://localhost:4173", // vite preview
		"http://localhost:3456", // desktop dev server
		"https://localhost",     // Capacitor Android
		"capacitor://localhost", // Capacitor iOS
	}
	for _, a := range allowed {
		if a != "" && strings.EqualFold(origin, a) {
			return true
		}
	}
	// Netlify deploy previews for this site, e.g.
	// https://<hash>--memoera-811.netlify.app
	if strings.HasSuffix(origin, "--memoera-811.netlify.app") && strings.HasPrefix(origin, "https://") {
		return true
	}
	return false
}

func corsMiddleware(allowedOrigin string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Previously this echoed whatever Origin the request carried, which made
		// the configured allowedOrigin (FRONTEND_ORIGIN) dead code — any site
		// could call the API and read the response. Now the origin is matched
		// against an allowlist and only echoed on a hit.
		//
		// Vary: Origin is required because the response differs per origin;
		// without it a CDN could cache one origin's headers and serve them to
		// another.
		w.Header().Set("Vary", "Origin")
		if origin := r.Header.Get("Origin"); origin != "" && originAllowed(origin, allowedOrigin) {
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
	// Every send costs a real SMS and rings a real phone. Cap per number so a
	// stranger can't be spammed from our brand, and per IP so the SMS budget
	// can't be drained across many numbers.
	if !enforceRate(w, "otpsend:"+mobile, 3, time.Hour, "Too many codes requested for this number.") {
		return
	}
	if !enforceRate(w, "otpsendip:"+clientIP(r), 10, time.Hour, "Too many codes requested.") {
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

	if req.FirstName == "" || req.Mobile == "" || req.Password == "" || req.OTP == "" {
		writeError(w, http.StatusBadRequest, "All fields are required")
		return
	}
	if len(req.Password) < 6 {
		writeError(w, http.StatusBadRequest, "Password must be at least 6 characters")
		return
	}

	// Verify OTP
	if !enforceRate(w, "signup:"+clientIP(r), 20, time.Hour, "Too many sign-up attempts.") {
		return
	}
	otpMu.Lock()
	entry, exists := otpStore["signup:"+req.Mobile]
	if exists {
		// Burn one guess per attempt and discard the code once the budget is
		// spent, so the remaining values can't simply be walked.
		entry.Attempts++
		if entry.Attempts > maxOTPAttempts {
			delete(otpStore, "signup:"+req.Mobile)
			otpMu.Unlock()
			writeError(w, http.StatusTooManyRequests, "Too many incorrect codes. Request a new one.")
			return
		}
		otpStore["signup:"+req.Mobile] = entry
	}
	otpMu.Unlock()
	if !exists || time.Now().After(entry.ExpiresAt) {
		writeError(w, http.StatusUnauthorized, "OTP has expired. Please request a new one.")
		return
	}
	if !otpMatches(entry.OTP, req.OTP) {
		writeError(w, http.StatusUnauthorized, "Incorrect OTP. Please try again.")
		return
	}
	otpMu.Lock()
	delete(otpStore, "signup:"+req.Mobile)
	otpMu.Unlock()

	passwordHash, err := hashSecret(req.Password)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not create account")
		return
	}
	answerHash, err := hashSecret(strings.ToLower(req.SecurityAnswer))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not create account")
		return
	}

	var userID int64
	err = db.QueryRow(r.Context(), `
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

	ensureOwnReferralCode(r.Context(), userID, req.FirstName, req.LastName, req.Mobile)

	// If they entered a friend's/employee's code at signup, credit both sides
	// immediately (best-effort — a failure here must never block account creation).
	if code := strings.ToUpper(strings.TrimSpace(req.ReferralCode)); code != "" {
		var ownerID int64
		if err := db.QueryRow(r.Context(), `SELECT id FROM users WHERE own_referral_code=$1`, code).Scan(&ownerID); err == nil && ownerID != userID {
			_, _ = db.Exec(r.Context(),
				`UPDATE users SET bonus_storage_bytes=LEAST(bonus_storage_bytes+$1,$2), referral_redeemed=true WHERE id=$3`,
				referralEarnBytes, maxBonusStorageBytes, userID)
			_, _ = db.Exec(r.Context(),
				`UPDATE users SET bonus_storage_bytes=LEAST(bonus_storage_bytes+$1,$2) WHERE id=$3`,
				referralEarnBytes, maxBonusStorageBytes, ownerID)
		}
	}

	user := User{ID: userID, FirstName: req.FirstName, LastName: req.LastName,
		Mobile: req.Mobile, DateOfBirth: req.DateOfBirth, SecurityQuestion: req.SecurityQuestion,
		CreatedAt: time.Now()}
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

	// Password guessing is otherwise unlimited. Per-identifier stops a single
	// account being hammered; per-IP stops one host spraying many accounts.
	if !enforceRate(w, "signin:"+mobile, 10, 15*time.Minute, "Too many sign-in attempts for this number.") {
		return
	}
	if !enforceRate(w, "signinip:"+clientIP(r), 50, 15*time.Minute, "Too many sign-in attempts.") {
		return
	}

	var user User
	err := db.QueryRow(r.Context(), `
		SELECT id, mobile, first_name, last_name, password_hash, security_question,
		       COALESCE(date_of_birth,''), COALESCE(profile_photo_url,''), COALESCE(email,''), created_at,
		       account_type, onboarding_complete
		FROM users WHERE mobile=$1`, mobile,
	).Scan(&user.ID, &user.Mobile, &user.FirstName, &user.LastName, &user.PasswordHash,
		&user.SecurityQuestion, &user.DateOfBirth, &user.ProfilePhotoURL, &user.Email, &user.CreatedAt,
		&user.AccountType, &user.OnboardingComplete)

	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusUnauthorized, "Invalid mobile number or password")
		return
	}
	if err != nil {
		log.Printf("[signIn] db error: %v", err)
		writeError(w, http.StatusInternalServerError, "Sign in failed")
		return
	}

	ok, needsUpgrade := secretMatches(user.PasswordHash, req.Password)
	if !ok {
		writeError(w, http.StatusUnauthorized, "Invalid mobile number or password")
		return
	}
	// Sign-in is the only moment the plaintext exists, so it's the only chance
	// to move a legacy SHA-256 credential onto bcrypt. Invisible to the user.
	if needsUpgrade {
		upgradeSecret(r.Context(), "password_hash", user.ID, req.Password)
	}

	recordLogin(r, user.ID)

	token := makeToken(user.Mobile)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(AuthResponse{Token: token, User: user})
}

// Best-effort sign-in audit for the Profile screen's "Recent Login Activity"
// list. Deliberately stores only coarse UA-derived labels (no IP, no full user
// agent) because this is user-facing history, not a security control — and
// never blocks or fails the sign-in it's recording.
func recordLogin(r *http.Request, userID int64) {
	browser, platform, isMobile := parseUserAgent(r.UserAgent())
	ctx := r.Context()
	if _, err := db.Exec(ctx,
		`INSERT INTO login_activity (user_id, browser, platform, is_mobile) VALUES ($1,$2,$3,$4)`,
		userID, browser, platform, isMobile); err != nil {
		log.Printf("[loginActivity] insert failed for user %d: %v", userID, err)
		return
	}
	// Keep only the 10 most recent rows per user so the table can't grow without bound.
	_, _ = db.Exec(ctx, `
		DELETE FROM login_activity
		WHERE user_id = $1 AND id NOT IN (
			SELECT id FROM login_activity WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10
		)`, userID)
}

// Crude but sufficient UA classification — enough to render "Chrome on Android"
// style labels. Order matters: Edge/Opera/Samsung UAs all also contain
// "Chrome", and Chrome's UA also contains "Safari".
func parseUserAgent(ua string) (browser, platform string, isMobile bool) {
	switch {
	case strings.Contains(ua, "Edg/"):
		browser = "Edge"
	case strings.Contains(ua, "OPR/"), strings.Contains(ua, "Opera"):
		browser = "Opera"
	case strings.Contains(ua, "SamsungBrowser"):
		browser = "Samsung Internet"
	case strings.Contains(ua, "Firefox"):
		browser = "Firefox"
	case strings.Contains(ua, "Chrome"):
		browser = "Chrome"
	case strings.Contains(ua, "Safari"):
		browser = "Safari"
	default:
		browser = "App"
	}
	switch {
	case strings.Contains(ua, "Android"):
		platform, isMobile = "Android", true
	case strings.Contains(ua, "iPhone"):
		platform, isMobile = "iPhone", true
	case strings.Contains(ua, "iPad"):
		platform, isMobile = "iPad", true
	case strings.Contains(ua, "Windows"):
		platform = "Windows"
	case strings.Contains(ua, "Mac OS X"), strings.Contains(ua, "Macintosh"):
		platform = "macOS"
	case strings.Contains(ua, "Linux"):
		platform = "Linux"
	default:
		platform = "Unknown device"
	}
	return browser, platform, isMobile
}

// Step 1: POST /api/auth/forgot-password — takes mobile, returns security question
func forgotPasswordHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !enforceRate(w, "forgot:"+clientIP(r), 10, time.Hour, "Too many password reset attempts.") {
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

	answer := strings.ToLower(strings.TrimSpace(req.SecurityAnswer))
	okAns, upgradeAns := secretMatches(storedHash, answer)
	if !okAns {
		writeError(w, http.StatusUnauthorized, "Incorrect security answer")
		return
	}
	if upgradeAns {
		var uid int64
		if db.QueryRow(r.Context(), `SELECT id FROM users WHERE mobile=$1`, req.Mobile).Scan(&uid) == nil {
			upgradeSecret(r.Context(), "security_answer", uid, answer)
		}
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
	if exists {
		entry.Attempts++
		if entry.Attempts > maxOTPAttempts {
			delete(otpStore, req.Mobile)
			otpMu.Unlock()
			writeError(w, http.StatusTooManyRequests, "Too many incorrect codes. Request a new one.")
			return
		}
		otpStore[req.Mobile] = entry
	}
	otpMu.Unlock()

	if !exists || time.Now().After(entry.ExpiresAt) {
		writeError(w, http.StatusUnauthorized, "OTP has expired. Please request a new one.")
		return
	}
	if !otpMatches(entry.OTP, req.OTP) {
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

	newHash, err := hashSecret(req.NewPassword)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to update password")
		return
	}
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
	okCur, _ := secretMatches(storedHash, req.CurrentPassword)
	if !okCur {
		writeError(w, http.StatusUnauthorized, "Current password is incorrect")
		return
	}

	newHash, err := hashSecret(req.NewPassword)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to update password")
		return
	}
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
	userID, tokenEmail, err := getUserFromToken(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	var user User
	err = db.QueryRow(r.Context(), `
		SELECT id, mobile, first_name, last_name, security_question,
		       COALESCE(date_of_birth,''), COALESCE(profile_photo_url,''), COALESCE(email,''), created_at,
		       account_type, onboarding_complete,
		       email_verified, twofa_enabled, notify_email, notify_marketing,
		       business_name, business_address, business_phone, business_email,
		       business_website, business_instagram, business_gstin,
		       business_category, business_hours
		FROM users WHERE id=$1`, userID,
	).Scan(&user.ID, &user.Mobile, &user.FirstName, &user.LastName,
		&user.SecurityQuestion, &user.DateOfBirth, &user.ProfilePhotoURL, &user.Email, &user.CreatedAt,
		&user.AccountType, &user.OnboardingComplete,
		&user.EmailVerified, &user.TwoFactorEnabled, &user.NotifyEmail, &user.NotifyMarketing,
		&user.BusinessName, &user.BusinessAddress, &user.BusinessPhone, &user.BusinessEmail,
		&user.BusinessWebsite, &user.BusinessInstagram, &user.BusinessGstin,
		&user.BusinessCategory, &user.BusinessHours)
	if err != nil {
		writeError(w, http.StatusNotFound, "User not found")
		return
	}
	user.IsAdmin = isAdminIdentity(tokenEmail)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(user)
}

// PUT /api/auth/security-question — set or update the security question/answer used
// for forgot-password recovery. Signup no longer collects this upfront (simplified to
// just name/mobile/password), so users configure it here instead, from Profile Settings.
func updateSecurityHandler(w http.ResponseWriter, r *http.Request) {
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
		SecurityQuestion string `json:"securityQuestion"`
		SecurityAnswer   string `json:"securityAnswer"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if req.SecurityQuestion == "" || req.SecurityAnswer == "" {
		writeError(w, http.StatusBadRequest, "Security question and answer are required")
		return
	}
	answerHash, err := hashSecret(strings.ToLower(strings.TrimSpace(req.SecurityAnswer)))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to update security question")
		return
	}
	_, err = db.Exec(r.Context(),
		`UPDATE users SET security_question=$1, security_answer=$2 WHERE id=$3`,
		req.SecurityQuestion, answerHash, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to update security question")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"securityQuestion": req.SecurityQuestion})
}

// PUT /api/auth/profile — update profile fields (firstName, lastName, dateOfBirth, email)
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
		Email       string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	email := strings.TrimSpace(req.Email)
	var emailArg interface{}
	if email == "" {
		emailArg = nil
	} else {
		emailArg = email
	}
	_, err = db.Exec(r.Context(),
		`UPDATE users SET first_name=$1, last_name=$2, date_of_birth=$3, email=$4 WHERE id=$5`,
		req.FirstName, req.LastName, req.DateOfBirth, emailArg, userID)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			writeError(w, http.StatusConflict, "That email is already in use by another account")
			return
		}
		writeError(w, http.StatusInternalServerError, "Failed to update profile")
		return
	}
	var user User
	_ = db.QueryRow(r.Context(), `
		SELECT id, mobile, first_name, last_name, security_question,
		       COALESCE(date_of_birth,''), COALESCE(profile_photo_url,''), COALESCE(email,'')
		FROM users WHERE id=$1`, userID,
	).Scan(&user.ID, &user.Mobile, &user.FirstName, &user.LastName,
		&user.SecurityQuestion, &user.DateOfBirth, &user.ProfilePhotoURL, &user.Email)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(user)
}

// PUT /api/auth/onboarding — persist account-type selection and/or onboarding
// completion server-side, so a user who backs out mid-onboarding (before
// choosing Business/Individual) and later signs back in — possibly on a fresh
// session where localStorage was cleared by the sign-out — resumes exactly
// where they left off instead of the app losing track and skipping to Home.
func updateOnboardingHandler(w http.ResponseWriter, r *http.Request) {
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
		AccountType        string `json:"accountType"`
		OnboardingComplete bool   `json:"onboardingComplete"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if req.AccountType != "" && req.AccountType != "business" && req.AccountType != "individual" {
		writeError(w, http.StatusBadRequest, "Invalid account type")
		return
	}
	// Partial update — an empty accountType or false onboardingComplete in the
	// request never clobbers an already-saved value; each field only moves
	// forward (unset -> set, incomplete -> complete), matching how the two
	// onboarding steps call this endpoint independently.
	_, err = db.Exec(r.Context(),
		`UPDATE users SET
		   account_type = CASE WHEN $1 <> '' THEN $1 ELSE account_type END,
		   onboarding_complete = onboarding_complete OR $2
		 WHERE id=$3`,
		req.AccountType, req.OnboardingComplete, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to save onboarding progress")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"accountType": req.AccountType, "onboardingComplete": req.OnboardingComplete,
	})
}

// GET /api/business/mine — the caller's own saved business contact info, so
// the Seller Dashboard can tell whether they still need to fill it in
// before publishing their first listing (name/phone come from wherever the
// account already saved them — signup, Switch to Business, or Dashboard's
// own quick-setup form).
func getMyBusinessDetailsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	userID, _, err := getUserFromToken(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	var name, phone string
	_ = db.QueryRow(r.Context(), `SELECT business_name, business_phone FROM users WHERE id=$1`, userID).Scan(&name, &phone)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"businessName": name, "phone": phone})
}

// PUT /api/business/details — persists the caller's own business contact
// info (BusinessDetailsScreen.jsx), used both at signup and when switching
// Individual -> Business from Profile.
func saveBusinessDetailsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	userID, _, err := getUserFromToken(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	var req struct {
		BusinessName    string `json:"businessName"`
		BusinessAddress string `json:"businessAddress"`
		Phone           string `json:"phone"`
		Email           string `json:"email"`
		Website         string `json:"website"`
		Instagram       string `json:"instagram"`
		Gstin           string `json:"gstin"`
		// Pointers: the signup-time BusinessDetailsScreen doesn't collect these,
		// so an omitted field must leave whatever Profile already saved intact
		// rather than blanking it.
		Category *string `json:"category"`
		Hours    *string `json:"hours"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	_, err = db.Exec(r.Context(), `
		UPDATE users SET
			business_name = $1, business_address = $2, business_phone = $3,
			business_email = $4, business_website = $5, business_instagram = $6, business_gstin = $7,
			business_category = COALESCE($8, business_category),
			business_hours    = COALESCE($9, business_hours)
		WHERE id = $10`,
		req.BusinessName, req.BusinessAddress, req.Phone, req.Email, req.Website, req.Instagram, req.Gstin,
		req.Category, req.Hours, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save business details")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}

// ═══════════════════════════════════════════════════════════════════════════
// NFC PLATFORM
//
// The sticker is only a key. It carries https://memoera.in/nfc/MEM-NFC-########
// and nothing else — no name, no links, no personal data — so the owner can
// change what a tap opens, or pass the sticker on, without it ever being
// rewritten. Everything below is the software layer that makes that work:
// MemoEra alone mints the identities, customers claim them, and the resolve
// endpoint decides what a stranger's tap is allowed to see.
// ═══════════════════════════════════════════════════════════════════════════

const nfcCodePrefix = "MEM-NFC-"

// Ambiguous characters (0/O, 1/I/L) are excluded — this is read off a printed
// card and typed in by hand when a phone can't read the chip.
const nfcSecretAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

func generateNfcSecret() (string, error) {
	b := make([]byte, 8)
	for i := range b {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(nfcSecretAlphabet))))
		if err != nil {
			return "", err
		}
		b[i] = nfcSecretAlphabet[n.Int64()]
	}
	return string(b), nil
}

// Salted hash of IP + user agent. Lets analytics separate unique from repeat
// visitors, and lets us debounce a phone that fires the same tap twice, without
// ever persisting an address.
func visitorHash(r *http.Request) string {
	ip := r.Header.Get("CF-Connecting-IP")
	if ip == "" {
		ip = strings.Split(r.Header.Get("X-Forwarded-For"), ",")[0]
	}
	if ip == "" {
		// RemoteAddr is host:port and the port is a fresh ephemeral one on every
		// connection — leaving it in made each request hash as a different
		// visitor, so unique visitors always equalled total taps and the
		// double-tap debounce never matched anything.
		if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
			ip = host
		} else {
			ip = r.RemoteAddr
		}
	}
	salt := os.Getenv("JWT_SECRET")
	sum := sha256.Sum256([]byte(salt + "|" + strings.TrimSpace(ip) + "|" + r.UserAgent()))
	return hex.EncodeToString(sum[:16])
}

func nfcRequireAdmin(r *http.Request) error {
	_, email, err := getUserFromToken(r)
	if err != nil {
		return errors.New("authentication required")
	}
	if !isAdminIdentity(email) {
		return errors.New("admin only")
	}
	return nil
}

// POST /api/admin/nfc/batches — mints a manufacturing batch. This is the only
// place NFC identities come into existence; neither customers nor vendors can
// create one. Returns every code with its activation secret so the batch can be
// handed to the printer — the secret is not retrievable in bulk again later.
func adminCreateNfcBatchHandler(w http.ResponseWriter, r *http.Request) {
	if err := nfcRequireAdmin(r); err != nil {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}
	userID, _, _ := getUserFromToken(r)

	var req struct {
		BatchCode    string `json:"batchCode"`
		Manufacturer string `json:"manufacturer"`
		Quantity     int    `json:"quantity"`
		Notes        string `json:"notes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Quantity < 1 || req.Quantity > 10000 {
		writeError(w, http.StatusBadRequest, "Quantity must be between 1 and 10000")
		return
	}
	if strings.TrimSpace(req.BatchCode) == "" {
		req.BatchCode = fmt.Sprintf("BATCH-%s", time.Now().UTC().Format("20060102-150405"))
	}
	if req.Manufacturer == "" {
		req.Manufacturer = "Shanghai Feign Microelectronics"
	}

	ctx := r.Context()
	tx, err := db.Begin(ctx)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not start batch")
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var batchID int64
	if err := tx.QueryRow(ctx, `
		INSERT INTO nfc_batches (batch_code, manufacturer, quantity, notes, created_by)
		VALUES ($1,$2,$3,$4,$5) RETURNING id`,
		req.BatchCode, req.Manufacturer, req.Quantity, req.Notes, userID,
	).Scan(&batchID); err != nil {
		writeError(w, http.StatusBadRequest, "That batch code already exists")
		return
	}

	type minted struct {
		Code   string `json:"code"`
		Secret string `json:"secret"`
		URL    string `json:"url"`
	}
	out := make([]minted, 0, req.Quantity)
	base := strings.TrimRight(os.Getenv("FRONTEND_ORIGIN"), "/")
	if base == "" {
		base = "https://memoera.in"
	}

	for i := 0; i < req.Quantity; i++ {
		var seq int64
		if err := tx.QueryRow(ctx, `SELECT nextval('nfc_code_seq')`).Scan(&seq); err != nil {
			writeError(w, http.StatusInternalServerError, "could not allocate NFC id")
			return
		}
		secret, err := generateNfcSecret()
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not generate activation secret")
			return
		}
		code := fmt.Sprintf("%s%08d", nfcCodePrefix, seq)
		if _, err := tx.Exec(ctx, `
			INSERT INTO nfc_stickers (code, activation_secret, batch_id, status)
			VALUES ($1,$2,$3,'manufactured')`, code, secret, batchID); err != nil {
			writeError(w, http.StatusInternalServerError, "could not register sticker")
			return
		}
		out = append(out, minted{Code: code, Secret: secret, URL: base + "/nfc/" + code})
	}

	if err := tx.Commit(ctx); err != nil {
		writeError(w, http.StatusInternalServerError, "could not save batch")
		return
	}
	log.Printf("[nfc] admin %d minted %d stickers in batch %s", userID, req.Quantity, req.BatchCode)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"batchId": batchID, "batchCode": req.BatchCode, "stickers": out,
	})
}

// GET /api/admin/nfc/batches — batch list with activation progress.
func adminListNfcBatchesHandler(w http.ResponseWriter, r *http.Request) {
	if err := nfcRequireAdmin(r); err != nil {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}
	rows, err := db.Query(r.Context(), `
		SELECT b.id, b.batch_code, b.manufacturer, b.quantity, b.notes, b.created_at,
		       COUNT(s.id) FILTER (WHERE s.status = 'active')  AS activated,
		       COUNT(s.id) FILTER (WHERE s.status = 'blocked') AS blocked
		FROM nfc_batches b
		LEFT JOIN nfc_stickers s ON s.batch_id = b.id
		GROUP BY b.id ORDER BY b.created_at DESC LIMIT 200`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load batches")
		return
	}
	defer rows.Close()

	type batch struct {
		ID           int64     `json:"id"`
		BatchCode    string    `json:"batchCode"`
		Manufacturer string    `json:"manufacturer"`
		Quantity     int       `json:"quantity"`
		Notes        string    `json:"notes"`
		CreatedAt    time.Time `json:"createdAt"`
		Activated    int       `json:"activated"`
		Blocked      int       `json:"blocked"`
	}
	list := []batch{}
	for rows.Next() {
		var b batch
		if err := rows.Scan(&b.ID, &b.BatchCode, &b.Manufacturer, &b.Quantity, &b.Notes,
			&b.CreatedAt, &b.Activated, &b.Blocked); err != nil {
			continue
		}
		list = append(list, b)
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"batches": list})
}

// POST /api/admin/nfc/block — block or restore a sticker (lost, stolen, abused).
// A blocked sticker resolves to nothing but keeps its identity and history.
func adminBlockNfcHandler(w http.ResponseWriter, r *http.Request) {
	if err := nfcRequireAdmin(r); err != nil {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}
	var req struct {
		Code    string `json:"code"`
		Blocked bool   `json:"blocked"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	// Restoring returns it to 'active' only if somebody owns it, otherwise to
	// 'manufactured' so an unclaimed sticker stays claimable.
	tag, err := db.Exec(r.Context(), `
		UPDATE nfc_stickers SET status = CASE
			WHEN $2 THEN 'blocked'
			WHEN owner_id IS NOT NULL THEN 'active'
			ELSE 'manufactured' END
		WHERE code = $1`, strings.ToUpper(strings.TrimSpace(req.Code)), req.Blocked)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not update sticker")
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "No sticker with that code")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}

// GET /api/admin/nfc/batch-stickers?batchId=N — the codes in a batch, so they
// can be written onto physical chips in one run.
//
// Deliberately does NOT return activation secrets. Those are shown once at mint
// time for the printer; encoding a chip only needs the code, and re-exposing
// secrets through a listing endpoint would turn any admin session into a way to
// claim every unsold sticker.
func adminBatchStickersHandler(w http.ResponseWriter, r *http.Request) {
	if err := nfcRequireAdmin(r); err != nil {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}
	batchID, _ := strconv.ParseInt(r.URL.Query().Get("batchId"), 10, 64)
	rows, err := db.Query(r.Context(), `
		SELECT code, status, encoded_at FROM nfc_stickers
		WHERE batch_id=$1 ORDER BY id ASC`, batchID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load batch")
		return
	}
	defer rows.Close()

	type sticker struct {
		Code      string     `json:"code"`
		Status    string     `json:"status"`
		EncodedAt *time.Time `json:"encodedAt"`
	}
	list := []sticker{}
	base := strings.TrimRight(os.Getenv("FRONTEND_ORIGIN"), "/")
	if base == "" {
		base = "https://memoera.in"
	}
	for rows.Next() {
		var s sticker
		if err := rows.Scan(&s.Code, &s.Status, &s.EncodedAt); err != nil {
			continue
		}
		list = append(list, s)
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"stickers": list, "baseUrl": base})
}

// POST /api/admin/nfc/mark-encoded — records that a chip has been written.
func adminMarkEncodedHandler(w http.ResponseWriter, r *http.Request) {
	if err := nfcRequireAdmin(r); err != nil {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}
	var req struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	tag, err := db.Exec(r.Context(),
		`UPDATE nfc_stickers SET encoded_at=NOW() WHERE code=$1`,
		strings.ToUpper(strings.TrimSpace(req.Code)))
	if err != nil || tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "No sticker with that code")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}

// POST /api/nfc/activate — claims a sticker. Requires the printed activation
// secret as well as the code, because codes are sequential and so trivially
// guessable; the secret is what proves the customer physically has the sticker.
func activateNfcHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	userID, _, err := getUserFromToken(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "Sign in to activate a sticker")
		return
	}
	var req struct {
		Code   string `json:"code"`
		Secret string `json:"secret"`
		Name   string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if !enforceRate(w, "activate:"+clientIP(r), 20, time.Hour, "Too many activation attempts.") {
		return
	}
	code := strings.ToUpper(strings.TrimSpace(req.Code))
	// Accept a full tapped URL as well as a bare code — people paste both.
	if i := strings.LastIndex(code, "/"); i >= 0 {
		code = code[i+1:]
	}
	if !strings.HasPrefix(code, nfcCodePrefix) {
		writeError(w, http.StatusBadRequest, "That doesn't look like a MemoEra NFC ID")
		return
	}
	secret := strings.ToUpper(strings.TrimSpace(req.Secret))

	ctx := r.Context()
	var id int64
	var status, storedSecret string
	var ownerID *int64
	err = db.QueryRow(ctx,
		`SELECT id, status, activation_secret, owner_id FROM nfc_stickers WHERE code=$1`, code,
	).Scan(&id, &status, &storedSecret, &ownerID)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "We don't recognise that NFC ID")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Activation failed")
		return
	}
	if status == "blocked" {
		writeError(w, http.StatusForbidden, "This sticker has been blocked. Contact MemoEra support.")
		return
	}
	if ownerID != nil {
		if *ownerID == userID {
			writeError(w, http.StatusBadRequest, "This sticker is already on your account")
		} else {
			writeError(w, http.StatusConflict, "This sticker is already activated on another account")
		}
		return
	}
	if subtle.ConstantTimeCompare([]byte(storedSecret), []byte(secret)) != 1 {
		writeError(w, http.StatusBadRequest, "That activation code doesn't match this sticker")
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		name = "My MemoEra Sticker"
	}
	if _, err := db.Exec(ctx, `
		UPDATE nfc_stickers
		SET owner_id=$1, status='active', name=$2, activated_at=NOW()
		WHERE id=$3 AND owner_id IS NULL`, userID, name, id); err != nil {
		writeError(w, http.StatusInternalServerError, "Activation failed")
		return
	}
	log.Printf("[nfc] sticker %s activated by user %d", code, userID)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"ok": true, "code": code, "name": name})
}

// GET /api/nfc/mine — the caller's stickers.
func myNfcStickersHandler(w http.ResponseWriter, r *http.Request) {
	userID, _, err := getUserFromToken(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	rows, err := db.Query(r.Context(), `
		SELECT s.id, s.code, s.name, s.status, s.tap_count, s.last_tap_at, s.activated_at,
		       COALESCE(s.experience_id,0), COALESCE(e.title,'')
		FROM nfc_stickers s
		LEFT JOIN nfc_experiences e ON e.id = s.experience_id
		WHERE s.owner_id=$1 ORDER BY s.activated_at DESC NULLS LAST`, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load your stickers")
		return
	}
	defer rows.Close()

	type sticker struct {
		ID             int64      `json:"id"`
		Code           string     `json:"code"`
		Name           string     `json:"name"`
		Status         string     `json:"status"`
		TapCount       int64      `json:"tapCount"`
		LastTapAt      *time.Time `json:"lastTapAt"`
		ActivatedAt    *time.Time `json:"activatedAt"`
		ExperienceID   int64      `json:"experienceId"`
		ExperienceName string     `json:"experienceName"`
	}
	list := []sticker{}
	for rows.Next() {
		var s sticker
		if err := rows.Scan(&s.ID, &s.Code, &s.Name, &s.Status, &s.TapCount, &s.LastTapAt,
			&s.ActivatedAt, &s.ExperienceID, &s.ExperienceName); err != nil {
			continue
		}
		list = append(list, s)
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"stickers": list})
}

// PUT /api/nfc/sticker — rename, point at a different experience, or release.
// Every branch is ownership-checked in the WHERE clause.
func updateNfcStickerHandler(w http.ResponseWriter, r *http.Request) {
	userID, _, err := getUserFromToken(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	var req struct {
		ID           int64  `json:"id"`
		Name         *string `json:"name"`
		ExperienceID *int64  `json:"experienceId"`
		Release      bool    `json:"release"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	ctx := r.Context()

	// Releasing hands the sticker back to unclaimed so it can be activated by
	// whoever holds it next — the identity and its tap history survive.
	if req.Release {
		tag, err := db.Exec(ctx, `
			UPDATE nfc_stickers
			SET owner_id=NULL, status='manufactured', experience_id=NULL, name=''
			WHERE id=$1 AND owner_id=$2`, req.ID, userID)
		if err != nil || tag.RowsAffected() == 0 {
			writeError(w, http.StatusNotFound, "Sticker not found on your account")
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]bool{"released": true})
		return
	}

	// An experience can only be attached if the caller owns that too.
	if req.ExperienceID != nil && *req.ExperienceID != 0 {
		var owns bool
		_ = db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM nfc_experiences WHERE id=$1 AND owner_id=$2)`,
			*req.ExperienceID, userID).Scan(&owns)
		if !owns {
			writeError(w, http.StatusForbidden, "That experience isn't yours")
			return
		}
	}

	tag, err := db.Exec(ctx, `
		UPDATE nfc_stickers SET
			name          = COALESCE($1, name),
			experience_id = COALESCE($2, experience_id)
		WHERE id=$3 AND owner_id=$4`, req.Name, req.ExperienceID, req.ID, userID)
	if err != nil || tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "Sticker not found on your account")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}

// /api/nfc/experiences — GET lists the caller's experiences, PUT creates or
// updates one (id omitted creates).
func nfcExperiencesHandler(w http.ResponseWriter, r *http.Request) {
	userID, _, err := getUserFromToken(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	ctx := r.Context()
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case http.MethodGet:
		rows, err := db.Query(ctx, `
			SELECT id, title, theme, blocks, updated_at FROM nfc_experiences
			WHERE owner_id=$1 ORDER BY updated_at DESC`, userID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not load experiences")
			return
		}
		defer rows.Close()
		type exp struct {
			ID        int64           `json:"id"`
			Title     string          `json:"title"`
			Theme     string          `json:"theme"`
			Blocks    json.RawMessage `json:"blocks"`
			UpdatedAt time.Time       `json:"updatedAt"`
		}
		list := []exp{}
		for rows.Next() {
			var e exp
			if err := rows.Scan(&e.ID, &e.Title, &e.Theme, &e.Blocks, &e.UpdatedAt); err != nil {
				continue
			}
			list = append(list, e)
		}
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"experiences": list})

	case http.MethodPut:
		var req struct {
			ID     int64           `json:"id"`
			Title  string          `json:"title"`
			Theme  string          `json:"theme"`
			Blocks json.RawMessage `json:"blocks"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		if len(req.Blocks) == 0 {
			req.Blocks = json.RawMessage(`[]`)
		}
		if req.Theme == "" {
			req.Theme = "midnight"
		}
		if req.ID == 0 {
			var id int64
			if err := db.QueryRow(ctx, `
				INSERT INTO nfc_experiences (owner_id, title, theme, blocks)
				VALUES ($1,$2,$3,$4) RETURNING id`,
				userID, req.Title, req.Theme, req.Blocks).Scan(&id); err != nil {
				writeError(w, http.StatusInternalServerError, "could not create experience")
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"id": id})
			return
		}
		tag, err := db.Exec(ctx, `
			UPDATE nfc_experiences SET title=$1, theme=$2, blocks=$3, updated_at=NOW()
			WHERE id=$4 AND owner_id=$5`, req.Title, req.Theme, req.Blocks, req.ID, userID)
		if err != nil || tag.RowsAffected() == 0 {
			writeError(w, http.StatusNotFound, "Experience not found on your account")
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"id": req.ID})

	case http.MethodDelete:
		id, _ := strconv.ParseInt(r.URL.Query().Get("id"), 10, 64)
		if _, err := db.Exec(ctx, `DELETE FROM nfc_experiences WHERE id=$1 AND owner_id=$2`, id, userID); err != nil {
			writeError(w, http.StatusInternalServerError, "could not delete experience")
			return
		}
		// Any sticker pointing at it falls back to showing nothing rather than
		// a dangling reference.
		_, _ = db.Exec(ctx, `UPDATE nfc_stickers SET experience_id=NULL WHERE experience_id=$1 AND owner_id=$2`, id, userID)
		_ = json.NewEncoder(w).Encode(map[string]bool{"ok": true})

	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

// GET /api/nfc/resolve?code=MEM-NFC-######## — PUBLIC. This is what a stranger's
// tap hits. It returns only what the owner chose to publish, never account or
// contact data they didn't put in a block, and records the tap.
func resolveNfcHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if !enforceRate(w, "resolve:"+clientIP(r), 60, time.Minute, "Too many requests.") {
		return
	}
	code := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("code")))
	if i := strings.LastIndex(code, "/"); i >= 0 {
		code = code[i+1:]
	}
	w.Header().Set("Content-Type", "application/json")

	var stickerID int64
	var status, name string
	var expID *int64
	err := db.QueryRow(r.Context(),
		`SELECT id, status, name, experience_id FROM nfc_stickers WHERE code=$1`, code,
	).Scan(&stickerID, &status, &name, &expID)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "unknown sticker")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not resolve sticker")
		return
	}
	if status == "blocked" {
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"state": "blocked"})
		return
	}
	if status != "active" || expID == nil {
		// Claimable, or claimed but nothing published yet. Deliberately does not
		// reveal whether it has an owner.
		state := "unclaimed"
		if status == "active" {
			state = "empty"
		}
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"state": state, "code": code})
		return
	}

	var title, theme string
	var blocks json.RawMessage
	if err := db.QueryRow(r.Context(),
		`SELECT title, theme, blocks FROM nfc_experiences WHERE id=$1`, *expID,
	).Scan(&title, &theme, &blocks); err != nil {
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"state": "empty", "code": code})
		return
	}

	recordNfcTap(r, stickerID)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"state": "ok", "code": code, "title": title, "theme": theme, "blocks": blocks,
	})
}

// Best-effort, never blocks the response the visitor is waiting on. Repeat taps
// from the same visitor within a minute are folded into one so a phone that
// fires twice doesn't inflate the owner's numbers.
func recordNfcTap(r *http.Request, stickerID int64) {
	vh := visitorHash(r)
	browser, platform, isMobile := parseUserAgent(r.UserAgent())
	country := r.Header.Get("CF-IPCountry")
	ctx := r.Context()

	var recent bool
	_ = db.QueryRow(ctx, `
		SELECT EXISTS(SELECT 1 FROM nfc_taps
		WHERE sticker_id=$1 AND visitor_hash=$2 AND created_at > NOW() - INTERVAL '1 minute')`,
		stickerID, vh).Scan(&recent)
	if recent {
		return
	}
	if _, err := db.Exec(ctx, `
		INSERT INTO nfc_taps (sticker_id, visitor_hash, browser, platform, is_mobile, country)
		VALUES ($1,$2,$3,$4,$5,$6)`, stickerID, vh, browser, platform, isMobile, country); err != nil {
		log.Printf("[nfc] tap insert failed for sticker %d: %v", stickerID, err)
		return
	}
	_, _ = db.Exec(ctx,
		`UPDATE nfc_stickers SET tap_count = tap_count + 1, last_tap_at = NOW() WHERE id=$1`, stickerID)
}

// GET /api/nfc/analytics?id= — tap breakdown for one of the caller's stickers.
func nfcAnalyticsHandler(w http.ResponseWriter, r *http.Request) {
	userID, _, err := getUserFromToken(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	stickerID, _ := strconv.ParseInt(r.URL.Query().Get("id"), 10, 64)

	var owns bool
	_ = db.QueryRow(r.Context(),
		`SELECT EXISTS(SELECT 1 FROM nfc_stickers WHERE id=$1 AND owner_id=$2)`, stickerID, userID).Scan(&owns)
	if !owns {
		writeError(w, http.StatusForbidden, "Not your sticker")
		return
	}

	var total, unique, last7 int64
	_ = db.QueryRow(r.Context(), `
		SELECT COUNT(*), COUNT(DISTINCT visitor_hash),
		       COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')
		FROM nfc_taps WHERE sticker_id=$1`, stickerID).Scan(&total, &unique, &last7)

	breakdown := func(col string) []map[string]interface{} {
		out := []map[string]interface{}{}
		rows, err := db.Query(r.Context(), fmt.Sprintf(`
			SELECT COALESCE(NULLIF(%s,''),'Unknown') AS k, COUNT(*) FROM nfc_taps
			WHERE sticker_id=$1 GROUP BY k ORDER BY COUNT(*) DESC LIMIT 6`, col), stickerID)
		if err != nil {
			return out
		}
		defer rows.Close()
		for rows.Next() {
			var k string
			var n int64
			if err := rows.Scan(&k, &n); err == nil {
				out = append(out, map[string]interface{}{"label": k, "count": n})
			}
		}
		return out
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"total": total, "unique": unique, "repeat": total - unique, "last7Days": last7,
		"platforms": breakdown("platform"), "browsers": breakdown("browser"),
		"countries": breakdown("country"),
	})
}

// ── Profile screen: email verification, 2FA, login history, preferences ──────

// GET /api/auth/login-activity — the caller's own recent sign-ins, newest first.
func loginActivityHandler(w http.ResponseWriter, r *http.Request) {
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
		SELECT browser, platform, is_mobile, created_at
		FROM login_activity WHERE user_id=$1 ORDER BY created_at DESC LIMIT 10`, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load login activity")
		return
	}
	defer rows.Close()

	type entry struct {
		Browser   string    `json:"browser"`
		Platform  string    `json:"platform"`
		IsMobile  bool      `json:"isMobile"`
		CreatedAt time.Time `json:"createdAt"`
	}
	list := []entry{}
	for rows.Next() {
		var e entry
		if err := rows.Scan(&e.Browser, &e.Platform, &e.IsMobile, &e.CreatedAt); err != nil {
			continue
		}
		list = append(list, e)
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"activity": list})
}

// PUT /api/preferences — notification toggles from the Profile Preferences card.
func updatePreferencesHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	userID, _, err := getUserFromToken(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	var req struct {
		NotifyEmail     *bool `json:"notifyEmail"`
		NotifyMarketing *bool `json:"notifyMarketing"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	_, err = db.Exec(r.Context(), `
		UPDATE users SET
			notify_email     = COALESCE($1, notify_email),
			notify_marketing = COALESCE($2, notify_marketing)
		WHERE id = $3`, req.NotifyEmail, req.NotifyMarketing, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save preferences")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}

// POST /api/auth/email/send-code — mails a 6-digit code to the caller's saved
// email address, valid for 15 minutes.
func sendEmailVerifyCodeHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	userID, _, err := getUserFromToken(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	var email, firstName string
	var verified bool
	if err := db.QueryRow(r.Context(),
		`SELECT COALESCE(email,''), first_name, email_verified FROM users WHERE id=$1`, userID,
	).Scan(&email, &firstName, &verified); err != nil {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	if email == "" {
		writeError(w, http.StatusBadRequest, "Add an email address to your profile first")
		return
	}
	if verified {
		writeError(w, http.StatusBadRequest, "Email is already verified")
		return
	}

	otp := generateOTP()
	if _, err := db.Exec(r.Context(),
		`UPDATE users SET email_verify_code=$1, email_verify_expires=$2 WHERE id=$3`,
		otp, time.Now().Add(15*time.Minute), userID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to store verification code")
		return
	}
	if err := sendEmailOTP(email, otp, firstName); err != nil {
		log.Printf("[emailVerify] send failed for user %d: %v", userID, err)
		writeError(w, http.StatusInternalServerError, "Could not send the verification email")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{"sent": true})
}

// POST /api/auth/email/verify — confirms the code from send-code.
func verifyEmailCodeHandler(w http.ResponseWriter, r *http.Request) {
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
		Code string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	var stored string
	var expires *time.Time
	if err := db.QueryRow(r.Context(),
		`SELECT email_verify_code, email_verify_expires FROM users WHERE id=$1`, userID,
	).Scan(&stored, &expires); err != nil {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	if stored == "" || expires == nil || time.Now().After(*expires) {
		writeError(w, http.StatusBadRequest, "That code has expired — please request a new one")
		return
	}
	if subtle.ConstantTimeCompare([]byte(stored), []byte(strings.TrimSpace(req.Code))) != 1 {
		writeError(w, http.StatusBadRequest, "Incorrect code")
		return
	}
	if _, err := db.Exec(r.Context(),
		`UPDATE users SET email_verified=true, email_verify_code='', email_verify_expires=NULL WHERE id=$1`,
		userID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to verify email")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{"verified": true})
}

// /api/auth/2fa — POST starts setup (returns a secret + otpauth:// URL for the
// authenticator app), PUT confirms it with a generated code and switches it on,
// DELETE turns it off. The secret is never honoured until twofa_enabled is true,
// so abandoning setup halfway can't lock anyone out.
func twoFactorHandler(w http.ResponseWriter, r *http.Request) {
	userID, mobile, err := getUserFromToken(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case http.MethodPost:
		secret, err := generateTOTPSecret()
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to generate secret")
			return
		}
		if _, err := db.Exec(r.Context(),
			`UPDATE users SET twofa_secret=$1, twofa_enabled=false WHERE id=$2`, secret, userID); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to start 2FA setup")
			return
		}
		otpauth := fmt.Sprintf("otpauth://totp/Memoera:%s?secret=%s&issuer=Memoera&digits=6&period=30",
			url.PathEscape(mobile), secret)
		_ = json.NewEncoder(w).Encode(map[string]string{"secret": secret, "otpauthUrl": otpauth})

	case http.MethodPut:
		var req struct {
			Code string `json:"code"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		var secret string
		if err := db.QueryRow(r.Context(), `SELECT twofa_secret FROM users WHERE id=$1`, userID).Scan(&secret); err != nil {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}
		if secret == "" {
			writeError(w, http.StatusBadRequest, "Start 2FA setup first")
			return
		}
		if !verifyTOTP(secret, strings.TrimSpace(req.Code)) {
			writeError(w, http.StatusBadRequest, "That code didn't match — check your authenticator app")
			return
		}
		if _, err := db.Exec(r.Context(), `UPDATE users SET twofa_enabled=true WHERE id=$1`, userID); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to enable 2FA")
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]bool{"enabled": true})

	case http.MethodDelete:
		if _, err := db.Exec(r.Context(),
			`UPDATE users SET twofa_enabled=false, twofa_secret='' WHERE id=$1`, userID); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to disable 2FA")
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]bool{"enabled": false})

	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

// ── TOTP (RFC 6238, SHA-1 / 6 digits / 30s) ─────────────────────────────────
// Implemented against the stdlib rather than pulling in a dependency — the
// algorithm is small and this is the only place it's needed.

func generateTOTPSecret() (string, error) {
	buf := make([]byte, 20) // 160-bit, the RFC 4226 recommendation
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(buf), nil
}

// Accepts the current 30-second step plus one step either side, so a slightly
// out-of-sync device clock doesn't reject an otherwise correct code.
func verifyTOTP(secret, code string) bool {
	if len(code) != 6 {
		return false
	}
	key, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(strings.ToUpper(secret))
	if err != nil {
		return false
	}
	step := time.Now().Unix() / 30
	for _, s := range []int64{step - 1, step, step + 1} {
		if subtle.ConstantTimeCompare([]byte(totpAt(key, s)), []byte(code)) == 1 {
			return true
		}
	}
	return false
}

func totpAt(key []byte, step int64) string {
	var msg [8]byte
	binary.BigEndian.PutUint64(msg[:], uint64(step))
	mac := hmac.New(sha1.New, key)
	mac.Write(msg[:])
	sum := mac.Sum(nil)
	offset := sum[len(sum)-1] & 0x0f
	trunc := binary.BigEndian.Uint32(sum[offset:offset+4]) & 0x7fffffff
	return fmt.Sprintf("%06d", trunc%1000000)
}

// GET /api/business/search?q=jewellery — the Home search box.
//
// Finds registered Business accounts by trade, name, or something they sell, so
// "jewellery" or "carpenter" turns up local shops with their address, phone and
// catalogue.
//
// Requires auth, unlike the per-product seller lookup. A single product's
// sellers being public is the point of the Buy Now flow; a freely queryable
// directory of every business and phone number on the platform is a scraping
// target, so this one is gated and rate limited.
func searchBusinessesHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if _, _, err := getUserFromToken(r); err != nil {
		writeError(w, http.StatusUnauthorized, "Sign in to search businesses")
		return
	}
	if !enforceRate(w, "bizsearch:"+clientIP(r), 60, time.Minute, "Too many searches.") {
		return
	}

	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if len(q) < 2 {
		writeError(w, http.StatusBadRequest, "Type at least two characters")
		return
	}
	// ILIKE with the wildcards bound as data, never concatenated into the SQL.
	like := "%" + q + "%"

	rows, err := db.Query(r.Context(), `
		SELECT u.id, u.business_name, u.business_category, u.business_address,
		       u.business_phone, u.business_hours, u.business_website, u.business_instagram,
		       COUNT(DISTINCT pl.id) AS listings
		FROM users u
		LEFT JOIN product_listings pl ON pl.seller_id = u.id
		LEFT JOIN ar_targets t        ON t.id = pl.target_id
		WHERE u.account_type = 'business'
		  AND u.business_name <> ''
		  AND (u.business_name ILIKE $1
		       OR u.business_category ILIKE $1
		       OR u.business_address ILIKE $1
		       OR t.label ILIKE $1)
		GROUP BY u.id
		ORDER BY COUNT(DISTINCT pl.id) DESC, u.business_name ASC
		LIMIT 50`, like)
	if err != nil {
		log.Printf("[bizsearch] query failed: %v", err)
		writeError(w, http.StatusInternalServerError, "Search failed")
		return
	}
	defer rows.Close()

	type biz struct {
		ID        int64  `json:"id"`
		Name      string `json:"name"`
		Category  string `json:"category"`
		Address   string `json:"address"`
		Phone     string `json:"phone"`
		Hours     string `json:"hours"`
		Website   string `json:"website"`
		Instagram string `json:"instagram"`
		Listings  int    `json:"listings"`
	}
	list := []biz{}
	for rows.Next() {
		var b biz
		if err := rows.Scan(&b.ID, &b.Name, &b.Category, &b.Address, &b.Phone,
			&b.Hours, &b.Website, &b.Instagram, &b.Listings); err != nil {
			continue
		}
		list = append(list, b)
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"businesses": list, "query": q})
}

// GET /api/business/catalog?id=42 — what one business sells, for the expanded
// row in search results.
func businessCatalogHandler(w http.ResponseWriter, r *http.Request) {
	if _, _, err := getUserFromToken(r); err != nil {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	sellerID, _ := strconv.ParseInt(r.URL.Query().Get("id"), 10, 64)

	rows, err := db.Query(r.Context(), `
		SELECT COALESCE(t.label,''), COALESCE(t.image_url,''),
		       pl.price, pl.unit, pl.moq, pl.notes
		FROM product_listings pl
		JOIN ar_targets t ON t.id = pl.target_id
		WHERE pl.seller_id = $1
		ORDER BY pl.created_at DESC
		LIMIT 60`, sellerID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load catalogue")
		return
	}
	defer rows.Close()

	type item struct {
		Label    string `json:"label"`
		ImageURL string `json:"imageUrl"`
		Price    string `json:"price"`
		Unit     string `json:"unit"`
		MOQ      string `json:"moq"`
		Notes    string `json:"notes"`
	}
	list := []item{}
	for rows.Next() {
		var it item
		if err := rows.Scan(&it.Label, &it.ImageURL, &it.Price, &it.Unit, &it.MOQ, &it.Notes); err != nil {
			continue
		}
		list = append(list, it)
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"items": list})
}

// GET /api/business/by-target?targetId=123 — public, no auth: lets anyone who
// scans a business account's AR content and taps "Buy Now"/"Shop Now" see how
// to reach that business (name, address, phone for calling, etc).
func getBusinessByTargetHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	targetID, err := strconv.ParseInt(r.URL.Query().Get("targetId"), 10, 64)
	if err != nil || targetID == 0 {
		writeError(w, http.StatusBadRequest, "a valid targetId is required")
		return
	}
	var name, address, phone, email, website, instagram string
	err = db.QueryRow(r.Context(), `
		SELECT u.business_name, u.business_address, u.business_phone, u.business_email, u.business_website, u.business_instagram
		FROM ar_targets t JOIN users u ON u.id = t.user_id
		WHERE t.id = $1 AND u.account_type = 'business' AND u.business_name <> ''`, targetID,
	).Scan(&name, &address, &phone, &email, &website, &instagram)
	if err != nil {
		writeError(w, http.StatusNotFound, "No business details available for this content.")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{
		"businessName": name, "businessAddress": address, "phone": phone,
		"email": email, "website": website, "instagram": instagram,
	})
}

// PUT /api/listings — a seller publishes (or updates) their price/contact
// listing against an existing AR target/marker. Upserted on (target_id,
// seller_id) so re-submitting just updates price/moq/notes instead of
// erroring or duplicating.
func upsertListingHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	sellerID, _, err := getUserFromToken(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	var req struct {
		TargetID int64  `json:"targetId"`
		Price    string `json:"price"`
		Moq      string `json:"moq"`
		Unit     string `json:"unit"`
		Notes    string `json:"notes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.TargetID == 0 {
		writeError(w, http.StatusBadRequest, "a valid targetId is required")
		return
	}
	if strings.TrimSpace(req.Price) == "" {
		writeError(w, http.StatusBadRequest, "price is required")
		return
	}
	var exists bool
	_ = db.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM ar_targets WHERE id=$1)`, req.TargetID).Scan(&exists)
	if !exists {
		writeError(w, http.StatusNotFound, "that product/marker no longer exists")
		return
	}
	_, err = db.Exec(r.Context(), `
		INSERT INTO product_listings (target_id, seller_id, price, moq, unit, notes)
		VALUES ($1,$2,$3,$4,$5,$6)
		ON CONFLICT (target_id, seller_id) DO UPDATE SET
			price = $3, moq = $4, unit = $5, notes = $6`,
		req.TargetID, sellerID, req.Price, req.Moq, req.Unit, req.Notes)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save listing")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}

// GET /api/listings/mine — the signed-in seller's own listings, with enough
// target context (label/image) to render "My Listings" in the Dashboard.
func myListingsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	sellerID, _, err := getUserFromToken(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	rows, err := db.Query(r.Context(), `
		SELECT l.id, l.target_id, COALESCE(t.label,''), COALESCE(t.image_key,''), l.price, l.moq, l.unit, l.notes
		FROM product_listings l JOIN ar_targets t ON t.id = l.target_id
		WHERE l.seller_id = $1 ORDER BY l.created_at DESC`, sellerID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load listings")
		return
	}
	defer rows.Close()

	type Listing struct {
		ID       int64  `json:"id"`
		TargetID int64  `json:"targetId"`
		Label    string `json:"label"`
		ImageURL string `json:"imageUrl"`
		Price    string `json:"price"`
		Moq      string `json:"moq"`
		Unit     string `json:"unit"`
		Notes    string `json:"notes"`
	}
	var out []Listing
	for rows.Next() {
		var l Listing
		var imageKey string
		if err := rows.Scan(&l.ID, &l.TargetID, &l.Label, &imageKey, &l.Price, &l.Moq, &l.Unit, &l.Notes); err != nil {
			continue
		}
		l.ImageURL = fileURL(imageKey)
		out = append(out, l)
	}
	if out == nil {
		out = []Listing{}
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"listings": out})
}

// DELETE /api/listings?id=123 — remove one of the caller's own listings.
func deleteListingHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	sellerID, _, err := getUserFromToken(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	id, err := strconv.ParseInt(r.URL.Query().Get("id"), 10, 64)
	if err != nil || id == 0 {
		writeError(w, http.StatusBadRequest, "a valid id is required")
		return
	}
	tag, err := db.Exec(r.Context(), `DELETE FROM product_listings WHERE id=$1 AND seller_id=$2`, id, sellerID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete listing")
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "listing not found")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}

// GET /api/listings/by-target?targetId=123 — public: every seller who's
// listed a price against this scanned product, cheapest first. This is what
// "Buy Now" shows — Memoera is just the directory, never the payment/escrow.
func listingsByTargetHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	targetID, err := strconv.ParseInt(r.URL.Query().Get("targetId"), 10, 64)
	if err != nil || targetID == 0 {
		writeError(w, http.StatusBadRequest, "a valid targetId is required")
		return
	}
	rows, err := db.Query(r.Context(), `
		SELECT COALESCE(u.business_name,''), u.business_phone, l.price, l.moq, l.unit, l.notes, u.account_type
		FROM product_listings l JOIN users u ON u.id = l.seller_id
		WHERE l.target_id = $1 AND u.business_phone <> ''
		ORDER BY NULLIF(regexp_replace(l.price, '[^0-9.]', '', 'g'), '')::numeric ASC NULLS LAST, l.created_at ASC`, targetID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load sellers")
		return
	}
	defer rows.Close()

	type Seller struct {
		BusinessName string `json:"businessName"`
		Phone        string `json:"phone"`
		Price        string `json:"price"`
		Moq          string `json:"moq"`
		Unit         string `json:"unit"`
		Notes        string `json:"notes"`
		Verified     bool   `json:"verified"`
	}
	var out []Seller
	for rows.Next() {
		var s Seller
		var accountType string
		if err := rows.Scan(&s.BusinessName, &s.Phone, &s.Price, &s.Moq, &s.Unit, &s.Notes, &accountType); err != nil {
			continue
		}
		if s.BusinessName == "" {
			s.BusinessName = "Seller"
		}
		s.Verified = accountType == "business"
		out = append(out, s)
	}
	if out == nil {
		out = []Seller{}
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"sellers": out})
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
			TargetIndex     int     `json:"targetIndex"`
			Label           string  `json:"label"`
			PlaneWidth      float64 `json:"planeWidth"`
			PlaneHeight     float64 `json:"planeHeight"`
			PlaneOffsetY    float64 `json:"planeOffsetY"`
			ImageKey        string  `json:"imageKey"`
			VideoKey        string  `json:"videoKey"`
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

	// Enforce real storage quota (plan limit + earned bonus), skipped for the
	// admin account so official/global content isn't capped by a personal quota.
	var email, plan string
	var bonusBytes int64
	_ = db.QueryRow(r.Context(), `SELECT COALESCE(email,''), plan, bonus_storage_bytes FROM users WHERE id=$1`, userID).
		Scan(&email, &plan, &bonusBytes)
	if !isAdminIdentity(email) {
		if limit := planLimit(plan); limit >= 0 {
			effectiveLimit := limit + bonusBytes
			var existingUsage int64
			_ = db.QueryRow(r.Context(),
				`SELECT COALESCE(SUM(file_size_bytes),0) FROM ar_targets WHERE user_id=$1 AND is_public=$2`,
				userID, req.IsPublic,
			).Scan(&existingUsage)
			var newUsage int64
			for _, t := range req.Targets {
				newUsage += t.FileSizeBytes
			}
			if existingUsage+newUsage > effectiveLimit {
				freeMB := float64(effectiveLimit-existingUsage) / 1024 / 1024
				if freeMB < 0 {
					freeMB = 0
				}
				writeError(w, http.StatusRequestEntityTooLarge,
					fmt.Sprintf("Storage limit exceeded — only %.1f MB free of your %.1f MB limit. Upgrade your plan or earn bonus storage to continue.",
						freeMB, float64(effectiveLimit)/1024/1024))
				return
			}
		}
	}

	// Authoritative, server-side content check for anything about to become
	// visible to every user — the frontend's own moderation check is only
	// wired into one of five upload flows and is trivially bypassed by
	// calling this endpoint directly, so it can't be relied on alone. Skipped
	// for admin (official/global content) and for private uploads, which
	// aren't the policy-relevant surface.
	// Temporarily disabled at the user's request: OPENAI_API_KEY isn't
	// configured yet, so this always failed closed and blocked every public
	// upload. Re-enable once a real key is set in .env / Render.
	if false && req.IsPublic && !isAdminIdentity(email) {
		for _, t := range req.Targets {
			if t.ImageKey == "" {
				continue
			}
			flagged, modErr := moderateImageKey(r.Context(), t.ImageKey)
			if modErr != nil {
				log.Printf("[saveTargets] moderation check failed for %s: %v", t.ImageKey, modErr)
				writeError(w, http.StatusServiceUnavailable, "Could not verify this content right now. Please try again in a moment.")
				return
			}
			if flagged {
				writeError(w, http.StatusUnprocessableEntity, "This content violates our content policy and can't be made public.")
				return
			}
		}
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
		SELECT id, target_index, label, plane_width, plane_height, plane_offset_y, image_key, video_key, mind_key,
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
		ID              int64     `json:"id"`
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
		if err := rows.Scan(&t.ID, &t.TargetIndex, &t.Label, &t.PlaneWidth, &t.PlaneHeight, &t.PlaneOffsetY,
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
		SELECT id, label, plane_width, plane_height, plane_offset_y,
		       COALESCE(image_key,''), COALESCE(video_key,''),
		       COALESCE(target_type,'video'), COALESCE(url_link,''),
		       COALESCE(file_name,''), COALESCE(preview_key,''), COALESCE(animation_effect,'popIn')
		FROM ar_targets WHERE is_public = true AND is_hidden = false
		ORDER BY id`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to fetch public targets")
		return
	}
	defer rows.Close()

	type PublicTarget struct {
		ID              int64   `json:"id"`
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
		if err := rows.Scan(&t.ID, &t.Label, &t.PlaneWidth, &t.PlaneHeight, &t.PlaneOffsetY,
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

// POST /api/targets/report — lets anyone (no auth required, so scanning as a
// guest doesn't block reporting) flag a public target for admin review.
// Doesn't hide anything itself — only an admin action does that — so this
// can't be used to take content down via a report brigade.
func reportTargetHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req struct {
		TargetID int64  `json:"targetId"`
		Reason   string `json:"reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.TargetID == 0 {
		writeError(w, http.StatusBadRequest, "targetId is required")
		return
	}
	reason := strings.TrimSpace(req.Reason)
	if reason == "" {
		reason = "Not specified"
	}
	if len(reason) > 500 {
		reason = reason[:500]
	}

	var exists bool
	_ = db.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM ar_targets WHERE id=$1 AND is_public=true)`, req.TargetID).Scan(&exists)
	if !exists {
		writeError(w, http.StatusNotFound, "target not found")
		return
	}

	_, err := db.Exec(r.Context(),
		`INSERT INTO content_reports (target_id, reason) VALUES ($1, $2)`, req.TargetID, reason)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to submit report")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "reported"})
}

// POST /api/targets/interaction — toggle a like or save on a target the
// user just scanned/viewed. Works for any target (their own or someone
// else's public one) since this records the viewer's own reaction, not
// anything about the target's ownership.
func toggleTargetInteractionHandler(w http.ResponseWriter, r *http.Request) {
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
		TargetID int64  `json:"targetId"`
		Kind     string `json:"kind"`
		Active   bool   `json:"active"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.TargetID == 0 {
		writeError(w, http.StatusBadRequest, "targetId is required")
		return
	}
	if req.Kind != "like" && req.Kind != "save" {
		writeError(w, http.StatusBadRequest, "kind must be 'like' or 'save'")
		return
	}

	var exists bool
	_ = db.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM ar_targets WHERE id=$1)`, req.TargetID).Scan(&exists)
	if !exists {
		writeError(w, http.StatusNotFound, "target not found")
		return
	}

	if req.Active {
		_, err = db.Exec(r.Context(),
			`INSERT INTO target_interactions (user_id, target_id, kind) VALUES ($1,$2,$3)
			 ON CONFLICT (user_id, target_id, kind) DO NOTHING`, userID, req.TargetID, req.Kind)
	} else {
		_, err = db.Exec(r.Context(),
			`DELETE FROM target_interactions WHERE user_id=$1 AND target_id=$2 AND kind=$3`, userID, req.TargetID, req.Kind)
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update "+req.Kind)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"targetId": req.TargetID, "kind": req.Kind, "active": req.Active})
}

// GET /api/targets/interactions?kind=like|save — the signed-in user's liked
// or saved targets, most recent first, with public R2 URLs ready to render.
func listTargetInteractionsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	userID, _, err := getUserFromToken(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	kind := r.URL.Query().Get("kind")
	if kind != "like" && kind != "save" {
		writeError(w, http.StatusBadRequest, "kind must be 'like' or 'save'")
		return
	}

	rows, err := db.Query(r.Context(), `
		SELECT t.id, t.label, COALESCE(t.image_key,''), COALESCE(t.video_key,''),
		       COALESCE(t.target_type,'video'), COALESCE(t.url_link,''), COALESCE(t.preview_key,''),
		       ti.created_at
		FROM target_interactions ti
		JOIN ar_targets t ON t.id = ti.target_id
		WHERE ti.user_id = $1 AND ti.kind = $2
		ORDER BY ti.created_at DESC
		LIMIT 200`, userID, kind)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch "+kind+"d targets")
		return
	}
	defer rows.Close()

	type InteractedTarget struct {
		ID         int64     `json:"id"`
		Label      string    `json:"label"`
		ImageURL   string    `json:"imageUrl"`
		VideoURL   string    `json:"videoUrl"`
		TargetType string    `json:"targetType"`
		URLLink    string    `json:"urlLink"`
		PreviewURL string    `json:"previewUrl"`
		CreatedAt  time.Time `json:"createdAt"`
	}

	var out []InteractedTarget
	for rows.Next() {
		var t InteractedTarget
		var imageKey, videoKey, previewKey string
		if err := rows.Scan(&t.ID, &t.Label, &imageKey, &videoKey, &t.TargetType, &t.URLLink, &previewKey, &t.CreatedAt); err != nil {
			continue
		}
		t.ImageURL = fileURL(imageKey)
		t.VideoURL = fileURL(videoKey)
		t.PreviewURL = fileURL(previewKey)
		out = append(out, t)
	}
	if out == nil {
		out = []InteractedTarget{}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"targets": out})
}

// POST /api/catalogs — creates a catalog with its items in one shot. Item
// image/video keys are uploaded beforehand via the existing generic
// /api/upload/presign endpoint (same pattern every other content type uses),
// this handler just persists the metadata pointing at those already-uploaded
// R2 objects.
func createCatalogHandler(w http.ResponseWriter, r *http.Request) {
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
		Name  string `json:"name"`
		Items []struct {
			Title       string `json:"title"`
			Description string `json:"description"`
			Price       string `json:"price"`
			ImageKey    string `json:"imageKey"`
			VideoKey    string `json:"videoKey"`
			URLLink     string `json:"urlLink"`
		} `json:"items"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.Name) == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	if len(req.Items) == 0 {
		writeError(w, http.StatusBadRequest, "at least one item is required")
		return
	}

	tx, err := db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer tx.Rollback(r.Context())

	var catalogID int64
	if err := tx.QueryRow(r.Context(),
		`INSERT INTO catalogs (user_id, name) VALUES ($1,$2) RETURNING id`,
		userID, strings.TrimSpace(req.Name),
	).Scan(&catalogID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create catalog")
		return
	}

	for i, item := range req.Items {
		if _, err := tx.Exec(r.Context(),
			`INSERT INTO catalog_items (catalog_id, position, title, description, price, image_key, video_key, url_link)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
			catalogID, i, item.Title, item.Description, item.Price, item.ImageKey, item.VideoKey, item.URLLink,
		); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to save catalog items")
			return
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save catalog")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"id": catalogID})
}

// GET /api/catalogs?id=123 — public, no auth: anyone who scans the catalog's
// marker image needs to be able to load its contents regardless of who
// created it.
func getCatalogHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	idStr := r.URL.Query().Get("id")
	catalogID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || catalogID == 0 {
		writeError(w, http.StatusBadRequest, "a valid id is required")
		return
	}

	var name string
	if err := db.QueryRow(r.Context(), `SELECT name FROM catalogs WHERE id=$1`, catalogID).Scan(&name); err != nil {
		writeError(w, http.StatusNotFound, "catalog not found")
		return
	}

	rows, err := db.Query(r.Context(), `
		SELECT title, description, price, image_key, video_key, url_link
		FROM catalog_items WHERE catalog_id=$1 ORDER BY position ASC`, catalogID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load catalog items")
		return
	}
	defer rows.Close()

	type CatalogItem struct {
		Title       string `json:"title"`
		Description string `json:"description"`
		Price       string `json:"price"`
		ImageURL    string `json:"imageUrl"`
		VideoURL    string `json:"videoUrl"`
		URLLink     string `json:"urlLink"`
	}
	var items []CatalogItem
	for rows.Next() {
		var it CatalogItem
		var imageKey, videoKey string
		if err := rows.Scan(&it.Title, &it.Description, &it.Price, &imageKey, &videoKey, &it.URLLink); err != nil {
			continue
		}
		it.ImageURL = fileURL(imageKey)
		it.VideoURL = fileURL(videoKey)
		items = append(items, it)
	}
	if items == nil {
		items = []CatalogItem{}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"id": catalogID, "name": name, "items": items})
}

// GET /api/admin/reports — pending reports with enough target context for an
// admin to judge them without leaving the panel.
func adminListReportsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	_, mobile, err := getUserFromToken(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	var email string
	_ = db.QueryRow(r.Context(), `SELECT COALESCE(email,'') FROM users WHERE mobile=$1`, mobile).Scan(&email)
	if !isAdminIdentity(email) {
		writeError(w, http.StatusForbidden, "admin access required")
		return
	}

	rows, err := db.Query(r.Context(), `
		SELECT cr.id, cr.target_id, cr.reason, cr.created_at,
		       t.label, COALESCE(t.image_key,''), t.is_hidden, COUNT(*) OVER (PARTITION BY cr.target_id)
		FROM content_reports cr
		JOIN ar_targets t ON t.id = cr.target_id
		WHERE cr.status = 'pending'
		ORDER BY cr.created_at DESC
		LIMIT 200`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch reports")
		return
	}
	defer rows.Close()

	type ReportEntry struct {
		ID          int64     `json:"id"`
		TargetID    int64     `json:"targetId"`
		Reason      string    `json:"reason"`
		CreatedAt   time.Time `json:"createdAt"`
		Label       string    `json:"label"`
		ImageURL    string    `json:"imageUrl"`
		IsHidden    bool      `json:"isHidden"`
		ReportCount int       `json:"reportCount"`
	}
	var reports []ReportEntry
	for rows.Next() {
		var rep ReportEntry
		var imageKey string
		if err := rows.Scan(&rep.ID, &rep.TargetID, &rep.Reason, &rep.CreatedAt, &rep.Label, &imageKey, &rep.IsHidden, &rep.ReportCount); err != nil {
			continue
		}
		rep.ImageURL = fileURL(imageKey)
		reports = append(reports, rep)
	}
	if reports == nil {
		reports = []ReportEntry{}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"reports": reports})
}

// POST /api/admin/reports/resolve — action is "hide" (reversible takedown,
// removes the target from /api/targets/public without deleting it), "unhide",
// or "dismiss" (no content action, just clears the report queue for this
// target). Always marks matching pending reports as reviewed.
func adminResolveReportHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	_, mobile, err := getUserFromToken(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	var email string
	_ = db.QueryRow(r.Context(), `SELECT COALESCE(email,'') FROM users WHERE mobile=$1`, mobile).Scan(&email)
	if !isAdminIdentity(email) {
		writeError(w, http.StatusForbidden, "admin access required")
		return
	}

	var req struct {
		TargetID int64  `json:"targetId"`
		Action   string `json:"action"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.TargetID == 0 {
		writeError(w, http.StatusBadRequest, "targetId is required")
		return
	}
	switch req.Action {
	case "hide":
		_, err = db.Exec(r.Context(), `UPDATE ar_targets SET is_hidden = true WHERE id=$1`, req.TargetID)
	case "unhide":
		_, err = db.Exec(r.Context(), `UPDATE ar_targets SET is_hidden = false WHERE id=$1`, req.TargetID)
	case "dismiss":
		// no content change — just clear the queue below
	default:
		writeError(w, http.StatusBadRequest, "action must be hide, unhide, or dismiss")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update target")
		return
	}

	_, _ = db.Exec(r.Context(), `UPDATE content_reports SET status='reviewed' WHERE target_id=$1 AND status='pending'`, req.TargetID)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
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
		if err := rows.Scan(&isPublic, &total); err != nil {
			continue
		}
		if isPublic {
			publicBytes = total
		} else {
			privateBytes = total
		}
	}
	rows.Close()

	var email, plan string
	var bonusBytes int64
	_ = db.QueryRow(r.Context(), `SELECT COALESCE(email,''), plan, bonus_storage_bytes FROM users WHERE id=$1`, userID).
		Scan(&email, &plan, &bonusBytes)

	limitBytes := planLimit(plan)
	unlimited := limitBytes < 0
	effectiveLimit := limitBytes
	if !unlimited {
		effectiveLimit += bonusBytes
	}
	if isAdminIdentity(email) {
		unlimited = true
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"privateBytes": privateBytes,
		"publicBytes":  publicBytes,
		"limitBytes":   effectiveLimit,
		"unlimited":    unlimited,
		"plan":         plan,
		"bonusBytes":   bonusBytes,
	})
}

// GET /api/referral/status
func referralStatusHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	userID, _, err := getUserFromToken(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var firstName, lastName, mobile, ownCode string
	var bonusBytes int64
	var redeemed bool
	var adLastAt *time.Time
	err = db.QueryRow(r.Context(), `
		SELECT first_name, last_name, mobile, COALESCE(own_referral_code,''), bonus_storage_bytes, referral_redeemed, ad_bonus_last_at
		FROM users WHERE id=$1`, userID,
	).Scan(&firstName, &lastName, &mobile, &ownCode, &bonusBytes, &redeemed, &adLastAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to load referral status")
		return
	}
	if ownCode == "" {
		ownCode = ensureOwnReferralCode(r.Context(), userID, firstName, lastName, mobile)
	}

	adCooldownSeconds := 0
	if adLastAt != nil {
		if remaining := adWatchCooldown - time.Since(*adLastAt); remaining > 0 {
			adCooldownSeconds = int(remaining.Seconds())
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"code":              ownCode,
		"bonusBytes":        bonusBytes,
		"maxBonusBytes":     maxBonusStorageBytes,
		"redeemed":          redeemed,
		"adCooldownSeconds": adCooldownSeconds,
	})
}

// POST /api/referral/redeem  Body: {"code": "ABC1234"}
func referralRedeemHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	userID, _, err := getUserFromToken(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	var req struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	code := strings.ToUpper(strings.TrimSpace(req.Code))
	if len(code) < 5 {
		writeError(w, http.StatusBadRequest, "Code must be at least 5 characters.")
		return
	}

	var redeemed bool
	var myCode string
	_ = db.QueryRow(r.Context(), `SELECT referral_redeemed, COALESCE(own_referral_code,'') FROM users WHERE id=$1`, userID).
		Scan(&redeemed, &myCode)
	if redeemed {
		writeError(w, http.StatusConflict, "You already redeemed a code.")
		return
	}
	if myCode != "" && myCode == code {
		writeError(w, http.StatusBadRequest, "You cannot use your own referral code.")
		return
	}

	var ownerID int64
	if err := db.QueryRow(r.Context(), `SELECT id FROM users WHERE own_referral_code=$1`, code).Scan(&ownerID); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid referral code.")
		return
	}
	if ownerID == userID {
		writeError(w, http.StatusBadRequest, "You cannot use your own referral code.")
		return
	}

	tx, err := db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to start transaction")
		return
	}
	defer tx.Rollback(r.Context())

	var myBonus int64
	_ = tx.QueryRow(r.Context(), `SELECT bonus_storage_bytes FROM users WHERE id=$1 FOR UPDATE`, userID).Scan(&myBonus)
	myEarn := referralEarnBytes
	if room := maxBonusStorageBytes - myBonus; myEarn > room {
		myEarn = room
	}
	if myEarn < 0 {
		myEarn = 0
	}
	if _, err := tx.Exec(r.Context(),
		`UPDATE users SET bonus_storage_bytes=bonus_storage_bytes+$1, referral_redeemed=true WHERE id=$2`, myEarn, userID,
	); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to credit bonus")
		return
	}

	var ownerBonus int64
	_ = tx.QueryRow(r.Context(), `SELECT bonus_storage_bytes FROM users WHERE id=$1 FOR UPDATE`, ownerID).Scan(&ownerBonus)
	ownerEarn := referralEarnBytes
	if room := maxBonusStorageBytes - ownerBonus; ownerEarn > room {
		ownerEarn = room
	}
	if ownerEarn < 0 {
		ownerEarn = 0
	}
	if _, err := tx.Exec(r.Context(),
		`UPDATE users SET bonus_storage_bytes=bonus_storage_bytes+$1 WHERE id=$2`, ownerEarn, ownerID,
	); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to credit referrer")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to commit redemption")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"earnedBytes":     myEarn,
		"totalBonusBytes": myBonus + myEarn,
	})
}

// POST /api/referral/watch-ad  Body: {"seconds": 30}
func referralWatchAdHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	userID, _, err := getUserFromToken(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	var req struct {
		Seconds int `json:"seconds"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	var bonusBytes int64
	var adLastAt *time.Time
	_ = db.QueryRow(r.Context(), `SELECT bonus_storage_bytes, ad_bonus_last_at FROM users WHERE id=$1`, userID).
		Scan(&bonusBytes, &adLastAt)

	now := time.Now()
	if adLastAt != nil {
		if remaining := adWatchCooldown - now.Sub(*adLastAt); remaining > 0 {
			writeError(w, http.StatusTooManyRequests, fmt.Sprintf("Come back in %d min for the next ad.", int(remaining.Minutes())+1))
			return
		}
	}

	seconds := req.Seconds
	if seconds > adMaxSeconds {
		seconds = adMaxSeconds
	}
	if seconds < adMinSeconds {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("Watch at least %d seconds.", adMinSeconds))
		return
	}
	room := maxBonusStorageBytes - bonusBytes
	if room <= 0 {
		writeError(w, http.StatusBadRequest, "Max bonus already reached.")
		return
	}
	earnBytes := int64(seconds) * 1024 * 1024
	if earnBytes > room {
		earnBytes = room
	}

	if _, err := db.Exec(r.Context(),
		`UPDATE users SET bonus_storage_bytes=bonus_storage_bytes+$1, ad_bonus_last_at=$2 WHERE id=$3`, earnBytes, now, userID,
	); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to credit ad bonus")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"earnedBytes":     earnBytes,
		"totalBonusBytes": bonusBytes + earnBytes,
	})
}

// ─── Daily Streak ─────────────────────────────────────────────────────────────

var streakDateRe = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

// GET /api/streak/status — read-only, safe to call on every Home load.
func streakStatusHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	userID, _, err := getUserFromToken(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var current, highest int
	var lastDate *string
	err = db.QueryRow(r.Context(),
		`SELECT current_streak, highest_streak, last_streak_date FROM users WHERE id=$1`, userID,
	).Scan(&current, &highest, &lastDate)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to load streak")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"currentStreak": current,
		"highestStreak": highest,
		"lastStreakDate": func() string {
			if lastDate == nil {
				return ""
			}
			return *lastDate
		}(),
	})
}

// POST /api/streak/ping — called from every streak-qualifying action (scan,
// upload, like/save, share, create album). Only the *first* qualifying
// action of a given local calendar day changes anything — later ones the
// same day are harmless no-ops, so every call site can fire this freely
// without needing to track "have we already counted today" itself.
//
// `localDate` (YYYY-MM-DD) must come from the client's own clock, not the
// server's — a streak is defined by the user's midnight, not the server's,
// so a user in a different timezone than the server isn't unfairly credited
// or penalized a day early/late.
func streakPingHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	userID, _, err := getUserFromToken(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	var req struct {
		LocalDate string `json:"localDate"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || !streakDateRe.MatchString(req.LocalDate) {
		writeError(w, http.StatusBadRequest, "localDate must be YYYY-MM-DD")
		return
	}

	var current, highest int
	var lastDate *string
	err = db.QueryRow(r.Context(),
		`SELECT current_streak, highest_streak, last_streak_date FROM users WHERE id=$1 FOR UPDATE`, userID,
	).Scan(&current, &highest, &lastDate)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to load streak")
		return
	}

	if lastDate == nil || *lastDate == "" {
		current = 1
	} else if *lastDate == req.LocalDate {
		// Already counted today — no-op.
	} else {
		prev, err1 := time.Parse("2006-01-02", *lastDate)
		today, err2 := time.Parse("2006-01-02", req.LocalDate)
		if err1 == nil && err2 == nil && today.Sub(prev) == 24*time.Hour {
			current++
		} else {
			current = 1
		}
	}
	if current > highest {
		highest = current
	}

	if _, err := db.Exec(r.Context(),
		`UPDATE users SET current_streak=$1, highest_streak=$2, last_streak_date=$3 WHERE id=$4`,
		current, highest, req.LocalDate, userID,
	); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to update streak")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"currentStreak": current,
		"highestStreak": highest,
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
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
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

// GET /api/poster/quota — how many free AI poster generations this account has
// left. Called by the festival-greeting backend (webar-backend, Node) before it
// spends money calling the image API, and by the frontend to show a remaining-
// count badge. Admin account and any paid plan are always unlimited.
func getPosterQuotaHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	userID, _, err := getUserFromToken(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	var email, plan string
	var used int
	_ = db.QueryRow(r.Context(), `SELECT COALESCE(email,''), plan, poster_generations_used FROM users WHERE id=$1`, userID).
		Scan(&email, &plan, &used)

	unlimited := isAdminIdentity(email) || (plan != "" && plan != "free")
	remaining := freePosterLimit - used
	if remaining < 0 {
		remaining = 0
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"plan":      plan,
		"used":      used,
		"limit":     freePosterLimit,
		"remaining": remaining,
		"unlimited": unlimited,
	})
}

// POST /api/poster/quota/record — server-to-server call from the festival-
// greeting backend right after a successful AI image generation. Counts
// against the free-tier allowance independent of whether the user later saves
// the poster, so the cap can't be under-counted by skipping /api/poster/save.
func recordPosterUsageHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	userID, _, err := getUserFromToken(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	_, _ = db.Exec(r.Context(), `UPDATE users SET poster_generations_used = poster_generations_used + 1 WHERE id=$1`, userID)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"status": "ok"})
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
		SELECT u.first_name, r.rating, r.review_text, r.created_at, COALESCE(u.profile_photo_url,'')
		FROM reviews r JOIN users u ON u.id = r.user_id
		ORDER BY r.created_at DESC LIMIT 20`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch reviews")
		return
	}
	defer rows.Close()

	type Review struct {
		Name            string    `json:"name"`
		Rating          int       `json:"rating"`
		Text            string    `json:"text"`
		CreatedAt       time.Time `json:"createdAt"`
		ProfilePhotoURL string    `json:"profilePhotoUrl,omitempty"`
	}
	var reviews []Review
	for rows.Next() {
		var rv Review
		if err := rows.Scan(&rv.Name, &rv.Rating, &rv.Text, &rv.CreatedAt, &rv.ProfilePhotoURL); err != nil {
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
		Plan   string `json:"plan"` // "basic" | "pro" | "enterprise"
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

	// Record which user/plan this order belongs to so verifyPaymentHandler can
	// upgrade the right account without trusting any client-supplied plan value.
	if req.Plan != "" {
		_, _ = db.Exec(r.Context(),
			`INSERT INTO payment_orders (order_id, user_id, plan) VALUES ($1,$2,$3)`, orderID, userID, req.Plan)
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

	// Upgrade the user's plan using the order→user/plan mapping recorded at
	// order-creation time — never trust a client-supplied plan at verify time.
	var newPlan string
	var orderUserID int64
	var used bool
	err := db.QueryRow(r.Context(),
		`SELECT user_id, plan, used FROM payment_orders WHERE order_id=$1`, req.OrderID,
	).Scan(&orderUserID, &newPlan, &used)
	if err == nil && !used {
		if _, err := db.Exec(r.Context(), `UPDATE users SET plan=$1 WHERE id=$2`, newPlan, orderUserID); err == nil {
			_, _ = db.Exec(r.Context(), `UPDATE payment_orders SET used=true WHERE order_id=$1`, req.OrderID)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"verified": true,
		"status":   "success",
		"plan":     newPlan,
	})
}

// ─── Main ─────────────────────────────────────────────────────────────────────

func main() {
	// Load .env file in development (ignored in production where env vars are set directly)
	_ = godotenv.Load()

	ctx := context.Background()

	embeddedPG, err := startEmbeddedPostgresIfNeeded()
	if err != nil {
		log.Printf("⚠️  Embedded Postgres unavailable, continuing without a database: %v", err)
	}
	if embeddedPG != nil {
		defer embeddedPG.Stop()
	}

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
	mux.HandleFunc("/api/auth/security-question", updateSecurityHandler)
	mux.HandleFunc("/api/auth/login-activity", loginActivityHandler)
	mux.HandleFunc("/api/auth/email/send-code", sendEmailVerifyCodeHandler)
	mux.HandleFunc("/api/auth/email/verify", verifyEmailCodeHandler)
	mux.HandleFunc("/api/auth/2fa", twoFactorHandler)
	mux.HandleFunc("/api/preferences", updatePreferencesHandler)

	// ── NFC platform ──────────────────────────────────────────────────────
	mux.HandleFunc("/api/admin/nfc/batches", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			adminCreateNfcBatchHandler(w, r)
			return
		}
		adminListNfcBatchesHandler(w, r)
	})
	mux.HandleFunc("/api/admin/nfc/block", adminBlockNfcHandler)
	mux.HandleFunc("/api/admin/nfc/batch-stickers", adminBatchStickersHandler)
	mux.HandleFunc("/api/admin/nfc/mark-encoded", adminMarkEncodedHandler)
	mux.HandleFunc("/api/nfc/activate", activateNfcHandler)
	mux.HandleFunc("/api/nfc/mine", myNfcStickersHandler)
	mux.HandleFunc("/api/nfc/sticker", updateNfcStickerHandler)
	mux.HandleFunc("/api/nfc/experiences", nfcExperiencesHandler)
	mux.HandleFunc("/api/nfc/analytics", nfcAnalyticsHandler)
	mux.HandleFunc("/api/nfc/resolve", resolveNfcHandler) // public — no auth
	mux.HandleFunc("/api/business/search", searchBusinessesHandler)
	mux.HandleFunc("/api/business/catalog", businessCatalogHandler)
	mux.HandleFunc("/api/auth/onboarding", updateOnboardingHandler)
	mux.HandleFunc("/api/business/details", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			getMyBusinessDetailsHandler(w, r)
			return
		}
		saveBusinessDetailsHandler(w, r)
	})
	mux.HandleFunc("/api/business/by-target", getBusinessByTargetHandler)
	mux.HandleFunc("/api/listings", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPut:
			upsertListingHandler(w, r)
		case http.MethodDelete:
			deleteListingHandler(w, r)
		default:
			myListingsHandler(w, r)
		}
	})
	mux.HandleFunc("/api/listings/by-target", listingsByTargetHandler)
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
	mux.HandleFunc("/api/targets/report", reportTargetHandler)
	mux.HandleFunc("/api/targets/interaction", toggleTargetInteractionHandler)
	mux.HandleFunc("/api/targets/interactions", listTargetInteractionsHandler)

	mux.HandleFunc("/api/catalogs", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			createCatalogHandler(w, r)
			return
		}
		getCatalogHandler(w, r)
	})

	// Content moderation (admin)
	mux.HandleFunc("/api/admin/reports", adminListReportsHandler)
	mux.HandleFunc("/api/admin/reports/resolve", adminResolveReportHandler)
	mux.HandleFunc("/api/storage", getStorageHandler)
	mux.HandleFunc("/api/referral/status", referralStatusHandler)
	mux.HandleFunc("/api/referral/redeem", referralRedeemHandler)
	mux.HandleFunc("/api/referral/watch-ad", referralWatchAdHandler)
	mux.HandleFunc("/api/streak/status", streakStatusHandler)
	mux.HandleFunc("/api/streak/ping", streakPingHandler)

	// AI Poster
	mux.HandleFunc("/api/poster/generate", generatePosterHandler)
	mux.HandleFunc("/api/poster/save", savePosterHandler)
	mux.HandleFunc("/api/poster/history", getPosterHistoryHandler)
	mux.HandleFunc("/api/poster/quota", getPosterQuotaHandler)
	mux.HandleFunc("/api/poster/quota/record", recordPosterUsageHandler)

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
