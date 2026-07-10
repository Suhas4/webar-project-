# ─────────────────────────────────────────────────────────────────────────────
# setup-r2-credentials.ps1
# Automatically creates an R2 API token and updates all config files.
# Run this once in PowerShell.
# ─────────────────────────────────────────────────────────────────────────────

$ACCOUNT_ID   = "b037a5d90ca5aa829617c1d33c5ca19c"
$BUCKET_NAME  = "memoera-assets"

Write-Host ""
Write-Host "=================================" -ForegroundColor Cyan
Write-Host " Memoera R2 Auto-Setup" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "You need your Cloudflare Global API Key." -ForegroundColor Yellow
Write-Host "Get it from: https://dash.cloudflare.com/profile/api-tokens" -ForegroundColor Yellow
Write-Host "Scroll down to 'Global API Key' and click View." -ForegroundColor Yellow
Write-Host ""

$CF_EMAIL   = Read-Host "Enter your Cloudflare account email"
$CF_API_KEY = Read-Host "Enter your Global API Key" -AsSecureString
$CF_API_KEY_PLAIN = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($CF_API_KEY)
)

Write-Host ""
Write-Host "Creating R2 API token..." -ForegroundColor Cyan

$headers = @{
    "X-Auth-Email" = $CF_EMAIL
    "X-Auth-Key"   = $CF_API_KEY_PLAIN
    "Content-Type" = "application/json"
}

# Step 1: Get the bucket ID / verify bucket exists
$bucketsResp = Invoke-RestMethod `
    -Uri "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/r2/buckets" `
    -Headers $headers `
    -Method GET `
    -ErrorAction SilentlyContinue

if (-not $bucketsResp.success) {
    Write-Host "ERROR: Could not reach Cloudflare API. Check your email/API key." -ForegroundColor Red
    Write-Host $bucketsResp.errors
    exit 1
}

$bucket = $bucketsResp.result | Where-Object { $_.name -eq $BUCKET_NAME }
if (-not $bucket) {
    Write-Host "Bucket '$BUCKET_NAME' not found. Creating it..." -ForegroundColor Yellow
    $createBody = @{ name = $BUCKET_NAME } | ConvertTo-Json
    Invoke-RestMethod `
        -Uri "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/r2/buckets" `
        -Headers $headers `
        -Method POST `
        -Body $createBody | Out-Null
    Write-Host "Bucket created." -ForegroundColor Green
}

# Step 2: Create R2 API token
$tokenBody = @{
    name        = "memoera-app-token"
    permissions = @("r2:bucket:memoera-assets:read", "r2:bucket:memoera-assets:write")
} | ConvertTo-Json

try {
    $tokenResp = Invoke-RestMethod `
        -Uri "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/r2/tokens" `
        -Headers $headers `
        -Method POST `
        -Body $tokenBody
} catch {
    # Fallback: use account-scoped S3-compatible token approach
    Write-Host "Trying alternative token creation..." -ForegroundColor Yellow
    $tokenBody2 = @{
        name   = "memoera-app-r2"
        policies= @(
            @{
                effect     = "allow"
                resources  = @{ "com.cloudflare.edge.r2.bucket.$ACCOUNT_ID.eu.$BUCKET_NAME" = "*" }
                permission_groups = @(
                    @{ id = "2efd5506f9c8494dacb1fa10a3e7d5b6" } # Workers R2 Storage Write
                )
            }
        )
    } | ConvertTo-Json -Depth 10

    $tokenResp = Invoke-RestMethod `
        -Uri "https://api.cloudflare.com/client/v4/user/tokens" `
        -Headers $headers `
        -Method POST `
        -Body $tokenBody2
}

# Step 3: Get S3 credentials from R2 tokens page
# Cloudflare R2 uses a separate endpoint for Access Key ID / Secret Key
Write-Host "Fetching R2 access credentials..." -ForegroundColor Cyan

$r2TokensResp = Invoke-RestMethod `
    -Uri "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/r2/tokens" `
    -Headers $headers `
    -Method GET

# Find newest token
$latestToken = $r2TokensResp.result | Sort-Object { $_.issued_on } | Select-Object -Last 1

if (-not $latestToken) {
    Write-Host ""
    Write-Host "Could not auto-fetch token. Opening R2 tokens page..." -ForegroundColor Yellow
    Start-Process "https://dash.cloudflare.com/$ACCOUNT_ID/r2/api-tokens"
    Write-Host "On that page: Create a token with Read+Write on $BUCKET_NAME" -ForegroundColor Yellow
    Write-Host "Then paste the Access Key ID and Secret Key below:" -ForegroundColor Yellow
    $ACCESS_KEY_ID  = Read-Host "Access Key ID"
    $SECRET_KEY     = Read-Host "Secret Access Key"
} else {
    $ACCESS_KEY_ID  = $latestToken.accessKeyId
    $SECRET_KEY     = $latestToken.secretAccessKey
    Write-Host "Got R2 credentials from existing token." -ForegroundColor Green
}

# Step 4: Get R2 public URL
Write-Host "Getting R2 public URL..." -ForegroundColor Cyan
$r2PublicUrl = "https://pub-4cb6dfb082c64346a30587f3e9123a37.r2.dev"

# Try to fetch from bucket details
try {
    $bucketDetail = Invoke-RestMethod `
        -Uri "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/r2/buckets/$BUCKET_NAME" `
        -Headers $headers `
        -Method GET
    if ($bucketDetail.result.domains) {
        $r2PublicUrl = "https://" + $bucketDetail.result.domains[0]
    }
} catch {}

Write-Host "Public URL: $r2PublicUrl" -ForegroundColor Green

# Step 5: Update backend/.env
Write-Host ""
Write-Host "Updating backend/.env ..." -ForegroundColor Cyan

$envPath = Join-Path $PSScriptRoot "backend\.env"
$envContent = Get-Content $envPath -Raw

$envContent = $envContent -replace "R2_ACCOUNT_ID=.*",       "R2_ACCOUNT_ID=$ACCOUNT_ID"
$envContent = $envContent -replace "R2_ACCESS_KEY_ID=.*",    "R2_ACCESS_KEY_ID=$ACCESS_KEY_ID"
$envContent = $envContent -replace "R2_SECRET_ACCESS_KEY=.*","R2_SECRET_ACCESS_KEY=$SECRET_KEY"
$envContent = $envContent -replace "R2_BUCKET_NAME=.*",      "R2_BUCKET_NAME=$BUCKET_NAME"
$envContent = $envContent -replace "R2_PUBLIC_URL=.*",       "R2_PUBLIC_URL=$r2PublicUrl"

Set-Content $envPath $envContent -Encoding utf8
Write-Host "backend/.env updated." -ForegroundColor Green

# Step 6: Update frontend .env.local
Write-Host "Updating webar-app/.env.local ..." -ForegroundColor Cyan
$frontendEnvPath = Join-Path $PSScriptRoot "webar-app\.env.local"
$frontendContent = Get-Content $frontendEnvPath -Raw
$frontendContent = $frontendContent -replace "VITE_R2_PUBLIC_URL=.*", "VITE_R2_PUBLIC_URL=$r2PublicUrl"
if ($frontendContent -notmatch "VITE_R2_PUBLIC_URL") {
    $frontendContent += "`nVITE_R2_PUBLIC_URL=$r2PublicUrl"
}
Set-Content $frontendEnvPath $frontendContent -Encoding utf8
Write-Host "webar-app/.env.local updated." -ForegroundColor Green

# Step 7: Print Render env vars to copy-paste
Write-Host ""
Write-Host "======================================================" -ForegroundColor Green
Write-Host " SUCCESS! R2 credentials configured locally." -ForegroundColor Green
Write-Host "======================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Now update these in Render Dashboard:" -ForegroundColor Yellow
Write-Host "  https://dashboard.render.com -> your service -> Environment" -ForegroundColor Yellow
Write-Host ""
Write-Host "Add/update these environment variables:" -ForegroundColor Cyan
Write-Host "  R2_ACCOUNT_ID      = $ACCOUNT_ID"
Write-Host "  R2_ACCESS_KEY_ID   = $ACCESS_KEY_ID"
Write-Host "  R2_SECRET_ACCESS_KEY = $SECRET_KEY"
Write-Host "  R2_BUCKET_NAME     = $BUCKET_NAME"
Write-Host "  R2_PUBLIC_URL      = $r2PublicUrl"
Write-Host ""

# Step 8: Optionally update Render via API
Write-Host "Do you have a Render API key? (Get from https://dashboard.render.com/u/settings#apikeys)" -ForegroundColor Yellow
$renderKey = Read-Host "Render API Key (press Enter to skip)"

if ($renderKey -ne "") {
    Write-Host "Fetching Render services..." -ForegroundColor Cyan
    $renderHeaders = @{ "Authorization" = "Bearer $renderKey"; "Accept" = "application/json" }
    $services = Invoke-RestMethod -Uri "https://api.render.com/v1/services?limit=20" -Headers $renderHeaders

    $backendService = $services | Where-Object { $_.service.name -like "*webar*" -or $_.service.name -like "*backend*" } | Select-Object -First 1

    if ($backendService) {
        $serviceId = $backendService.service.id
        Write-Host "Found service: $($backendService.service.name) ($serviceId)" -ForegroundColor Green

        $envVars = @(
            @{ key = "R2_ACCOUNT_ID";       value = $ACCOUNT_ID   }
            @{ key = "R2_ACCESS_KEY_ID";    value = $ACCESS_KEY_ID }
            @{ key = "R2_SECRET_ACCESS_KEY";value = $SECRET_KEY    }
            @{ key = "R2_BUCKET_NAME";      value = $BUCKET_NAME   }
            @{ key = "R2_PUBLIC_URL";       value = $r2PublicUrl   }
        )

        $body = @{ envVars = $envVars } | ConvertTo-Json -Depth 5

        Invoke-RestMethod `
            -Uri "https://api.render.com/v1/services/$serviceId/env-vars" `
            -Headers ($renderHeaders + @{"Content-Type"="application/json"}) `
            -Method PUT `
            -Body $body | Out-Null

        Write-Host "Render environment variables updated!" -ForegroundColor Green
        Write-Host "Render will auto-redeploy with the new credentials." -ForegroundColor Green
    } else {
        Write-Host "Could not find your backend service on Render. Update manually." -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "All done! Restart the local backend to apply changes:" -ForegroundColor Green
Write-Host "  cd backend && go run ." -ForegroundColor White
Write-Host ""
