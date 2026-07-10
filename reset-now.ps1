# ─────────────────────────────────────────────────────────────
# reset-now.ps1 — Resets the Memoera database (all users + targets)
# Run from PowerShell: .\reset-now.ps1
# ─────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "=============================" -ForegroundColor Red
Write-Host "  MEMOERA — RESET DATABASE" -ForegroundColor Red
Write-Host "=============================" -ForegroundColor Red
Write-Host ""
Write-Host "Step 1: Get your DATABASE_URL from Render" -ForegroundColor Cyan
Write-Host "  → Open: https://dashboard.render.com" -ForegroundColor Yellow
Write-Host "  → Click your backend service (webar-backend)" -ForegroundColor Yellow
Write-Host "  → Go to Environment tab" -ForegroundColor Yellow
Write-Host "  → Copy the value of DATABASE_URL" -ForegroundColor Yellow
Write-Host ""

Start-Process "https://dashboard.render.com"

$DB_URL = Read-Host "Paste your DATABASE_URL here (postgresql://...)"
$DB_URL = $DB_URL.Trim()

if (-not $DB_URL.StartsWith("postgresql://") -and -not $DB_URL.StartsWith("postgres://")) {
    Write-Host "That doesn't look like a PostgreSQL URL. Exiting." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Connecting and clearing data..." -ForegroundColor Red

$scriptDir = $PSScriptRoot
$env:DATABASE_URL = $DB_URL

Push-Location "$scriptDir\backend"
go run "$scriptDir\reset-database.go" "$DB_URL"
Pop-Location

Write-Host ""
Write-Host "=======================================" -ForegroundColor Green
Write-Host "  DATABASE RESET COMPLETE!" -ForegroundColor Green
Write-Host "=======================================" -ForegroundColor Green
Write-Host ""
Write-Host "All users and AR targets have been deleted." -ForegroundColor White
Write-Host "The app is now 100% fresh — new users can register normally." -ForegroundColor Green
Write-Host ""
