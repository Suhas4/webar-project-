# Auto-update Render environment variables with R2 credentials
# Run this script once — it opens the browser for you, then does the rest automatically.

$R2_ACCOUNT_ID       = "b037a5d90ca5aa829617c1d33c5ca19c"
$R2_ACCESS_KEY_ID    = "a82ea3579dca92b269230b02b2c12599"
$R2_SECRET_ACCESS_KEY = "cfut_8tAgwG38KQ71u456ziysnGR5ozYKvArFPmUjpYxCe0f026d7"
$R2_BUCKET_NAME      = "memoera-assets"
$R2_PUBLIC_URL       = "https://pub-4cb6dfb082c64346a30587f3e9123a37.r2.dev"

Write-Host ""
Write-Host "Opening Render API Key page in your browser..." -ForegroundColor Cyan
Start-Process "https://dashboard.render.com/u/usr-d79cihp4tr6s73crc8q0/settings#api-keys"
Start-Sleep -Seconds 2

Write-Host ""
Write-Host "On the Render page that just opened:" -ForegroundColor Yellow
Write-Host "  1. Scroll to 'API Keys'" -ForegroundColor Yellow
Write-Host "  2. Click 'Create API Key'" -ForegroundColor Yellow
Write-Host "  3. Name it anything, click Create" -ForegroundColor Yellow
Write-Host "  4. Copy the rnd_... key" -ForegroundColor Yellow
Write-Host ""

$RENDER_KEY = Read-Host "Paste your Render API key here"
$RENDER_KEY = $RENDER_KEY.Trim()

if (-not $RENDER_KEY.StartsWith("rnd_")) {
    Write-Host "That doesn't look like a Render API key (should start with rnd_). Exiting." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Finding your backend service on Render..." -ForegroundColor Cyan

$headers = @{
    "Authorization" = "Bearer $RENDER_KEY"
    "Accept"        = "application/json"
}

try {
    $services = Invoke-RestMethod -Uri "https://api.render.com/v1/services?limit=20&type=web_service" -Headers $headers
} catch {
    Write-Host "ERROR: Could not connect to Render API. Check your key." -ForegroundColor Red
    exit 1
}

# Find the webar backend service
$service = $null
foreach ($item in $services) {
    $s = if ($item.service) { $item.service } else { $item }
    $name = $s.name
    $url  = $s.serviceDetails.url
    if ($name -like "*webar*" -or $name -like "*backend*" -or $url -like "*webar-project*") {
        $service = $s
        break
    }
}

if (-not $service) {
    Write-Host "Could not auto-detect service. Listing all services:" -ForegroundColor Yellow
    foreach ($item in $services) {
        $s = if ($item.service) { $item.service } else { $item }
        Write-Host "  - $($s.id)  $($s.name)" -ForegroundColor White
    }
    $serviceId = Read-Host "Paste the service ID (srv-...) for your backend"
} else {
    $serviceId = $service.id
    Write-Host "Found: $($service.name)  ($serviceId)" -ForegroundColor Green
}

Write-Host ""
Write-Host "Updating environment variables..." -ForegroundColor Cyan

$envVars = @(
    @{ key = "R2_ACCOUNT_ID";        value = $R2_ACCOUNT_ID        }
    @{ key = "R2_ACCESS_KEY_ID";     value = $R2_ACCESS_KEY_ID     }
    @{ key = "R2_SECRET_ACCESS_KEY"; value = $R2_SECRET_ACCESS_KEY }
    @{ key = "R2_BUCKET_NAME";       value = $R2_BUCKET_NAME       }
    @{ key = "R2_PUBLIC_URL";        value = $R2_PUBLIC_URL        }
)

$body = $envVars | ConvertTo-Json -Depth 5

try {
    Invoke-RestMethod `
        -Uri "https://api.render.com/v1/services/$serviceId/env-vars" `
        -Headers ($headers + @{ "Content-Type" = "application/json" }) `
        -Method PUT `
        -Body $body | Out-Null
    Write-Host "Environment variables updated!" -ForegroundColor Green
} catch {
    Write-Host "Error updating env vars: $_" -ForegroundColor Red
    exit 1
}

# Trigger a redeploy
Write-Host "Triggering redeploy..." -ForegroundColor Cyan
try {
    Invoke-RestMethod `
        -Uri "https://api.render.com/v1/services/$serviceId/deploys" `
        -Headers ($headers + @{ "Content-Type" = "application/json" }) `
        -Method POST `
        -Body '{"clearCache":"do_not_clear"}' | Out-Null
    Write-Host "Redeploy triggered!" -ForegroundColor Green
} catch {
    Write-Host "Could not auto-trigger redeploy. Please redeploy manually from Render dashboard." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=======================================" -ForegroundColor Green
Write-Host " ALL DONE!" -ForegroundColor Green
Write-Host "=======================================" -ForegroundColor Green
Write-Host ""
Write-Host "R2 credentials set on Render. Backend will restart in ~2 minutes." -ForegroundColor White
Write-Host "After that, AR scanning and file uploads will work." -ForegroundColor White
Write-Host ""
