# ─────────────────────────────────────────────────────────────────────────────
# clear-all-data.ps1  — wipes ALL users and AR targets from Neon database
# ─────────────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "=================================" -ForegroundColor Red
Write-Host "  MEMOERA — CLEAR ALL DATA" -ForegroundColor Red
Write-Host "=================================" -ForegroundColor Red
Write-Host ""
Write-Host "This will DELETE all users and all AR targets." -ForegroundColor Yellow
Write-Host "Getting DATABASE_URL from Render..." -ForegroundColor Cyan
Write-Host ""

# ── Step 1: Get Render API key ───────────────────────────────────────────────
Start-Process "https://dashboard.render.com/u/usr-d79cihp4tr6s73crc8q0/settings#api-keys"
Start-Sleep -Seconds 1

$RENDER_KEY = Read-Host "Paste your Render API key (rnd_...)"
$RENDER_KEY = $RENDER_KEY.Trim()

$renderHeaders = @{
    "Authorization" = "Bearer $RENDER_KEY"
    "Accept"        = "application/json"
}

# ── Step 2: Find the backend service ────────────────────────────────────────
Write-Host "Finding service..." -ForegroundColor Cyan
$services = Invoke-RestMethod -Uri "https://api.render.com/v1/services?type=web_service&limit=20" -Headers $renderHeaders
$serviceId = $null
foreach ($item in $services) {
    $s = if ($item.service) { $item.service } else { $item }
    if ($s.name -like "*webar*" -or $s.serviceDetails.url -like "*webar-project*") {
        $serviceId = $s.id
        Write-Host "Found service: $($s.name) ($serviceId)" -ForegroundColor Green
        break
    }
}
if (-not $serviceId) {
    Write-Host "Listing all services:" -ForegroundColor Yellow
    foreach ($item in $services) {
        $s = if ($item.service) { $item.service } else { $item }
        Write-Host "  $($s.id)  $($s.name)"
    }
    $serviceId = Read-Host "Paste the service ID (srv-...)"
}

# ── Step 3: Get DATABASE_URL from Render env vars ────────────────────────────
Write-Host "Getting DATABASE_URL..." -ForegroundColor Cyan
$envVars = Invoke-RestMethod -Uri "https://api.render.com/v1/services/$serviceId/env-vars" -Headers $renderHeaders
$dbUrl = ($envVars | Where-Object { $_.key -eq "DATABASE_URL" }).value

if (-not $dbUrl) {
    Write-Host "DATABASE_URL not found on Render. Enter it manually:" -ForegroundColor Yellow
    $dbUrl = Read-Host "DATABASE_URL (postgresql://...)"
}

Write-Host "Got DATABASE_URL." -ForegroundColor Green

# ── Step 4: Run reset SQL via Go script ─────────────────────────────────────
Write-Host ""
Write-Host "Clearing all data..." -ForegroundColor Red

$scriptDir = $PSScriptRoot
$env:DATABASE_URL = $dbUrl

Push-Location "$scriptDir\backend"
go run "$scriptDir\reset-database.go" "$dbUrl"
Pop-Location

Write-Host ""
Write-Host "=======================================" -ForegroundColor Green
Write-Host "  ALL DATA CLEARED — FRESH START!" -ForegroundColor Green
Write-Host "=======================================" -ForegroundColor Green
Write-Host ""
Write-Host "Users: deleted" -ForegroundColor White
Write-Host "AR Targets: deleted" -ForegroundColor White
Write-Host "R2 files: deleted (already done)" -ForegroundColor White
Write-Host ""
Write-Host "The app is now 100% fresh. New users can register normally." -ForegroundColor Green
Write-Host ""
