//go:build ignore

// Reset script — clears ALL users and AR targets from the Neon database.
// Run with: go run reset-database.go <DATABASE_URL>
// Or set DATABASE_URL env var and run: go run reset-database.go

package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	dbURL := ""
	if len(os.Args) > 1 {
		dbURL = os.Args[1]
	}
	if dbURL == "" {
		dbURL = os.Getenv("DATABASE_URL")
	}
	if dbURL == "" {
		log.Fatal("Usage: go run reset-database.go <DATABASE_URL>\nOr set DATABASE_URL env var")
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		log.Fatalf("Failed to connect: %v", err)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		log.Fatalf("DB ping failed: %v", err)
	}
	fmt.Println("✓ Connected to database")

	tables := []string{"ar_targets", "referrals", "users"}
	for _, t := range tables {
		tag, err := pool.Exec(ctx, "DELETE FROM "+t)
		if err != nil {
			fmt.Printf("  ⚠ Could not clear %s: %v\n", t, err)
		} else {
			fmt.Printf("  ✓ Cleared %s (%d rows deleted)\n", t, tag.RowsAffected())
		}
	}

	// Reset auto-increment sequences
	seqs := map[string]string{
		"users":      "users_id_seq",
		"ar_targets": "ar_targets_id_seq",
	}
	for table, seq := range seqs {
		_, err := pool.Exec(ctx, fmt.Sprintf("ALTER SEQUENCE IF EXISTS %s RESTART WITH 1", seq))
		if err != nil {
			fmt.Printf("  ⚠ Could not reset sequence for %s: %v\n", table, seq)
		} else {
			fmt.Printf("  ✓ Reset ID sequence for %s\n", table)
		}
	}

	fmt.Println("\n✅ Database cleared. Fresh start ready!")
}
