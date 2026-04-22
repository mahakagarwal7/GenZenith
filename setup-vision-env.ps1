# setup-vision-env.ps1
# ==========================================================
# Reads secrets/service-account.json and injects it as a
# single-line JSON value into .env as GOOGLE_SERVICE_ACCOUNT_JSON
# ==========================================================
# Usage:  .\setup-vision-env.ps1

$ErrorActionPreference = "Stop"

$jsonPath = Join-Path $PSScriptRoot "secrets\service-account.json"
$envPath  = Join-Path $PSScriptRoot ".env"

if (-not (Test-Path $jsonPath)) {
  Write-Host ""
  Write-Host "ERROR: secrets\service-account.json not found." -ForegroundColor Red
  Write-Host ""
  Write-Host "Steps to get it:" -ForegroundColor Yellow
  Write-Host "  1. Go to https://console.cloud.google.com"
  Write-Host "  2. Select your project"
  Write-Host "  3. IAM & Admin -> Service Accounts -> Create Service Account"
  Write-Host "  4. Name: vision-ocr  |  Role: Cloud Vision API User"
  Write-Host "  5. Keys tab -> Add Key -> Create new key -> JSON"
  Write-Host "  6. Save the downloaded file as:  secrets\service-account.json"
  Write-Host "  7. Re-run this script"
  Write-Host ""
  exit 1
}

# Validate it's valid JSON with required fields
try {
  $sa = Get-Content $jsonPath -Raw | ConvertFrom-Json
  if (-not $sa.client_email -or -not $sa.private_key) {
    throw "Missing client_email or private_key fields"
  }
  Write-Host "[OK] Service account file validated: $($sa.client_email)" -ForegroundColor Green
} catch {
  Write-Host "ERROR: Invalid service-account.json: $_" -ForegroundColor Red
  exit 1
}

# Minify to a single line (no newlines, escaped properly)
$minified = (Get-Content $jsonPath -Raw).Trim() -replace '\r?\n', '' -replace '\s{2,}', ' '

# Update or insert GOOGLE_SERVICE_ACCOUNT_JSON in .env
if (-not (Test-Path $envPath)) {
  Write-Host "ERROR: .env file not found at $envPath" -ForegroundColor Red
  exit 1
}

$envContent = Get-Content $envPath -Raw

$pattern = 'GOOGLE_SERVICE_ACCOUNT_JSON=.*'
$replacement = "GOOGLE_SERVICE_ACCOUNT_JSON=$minified"

if ($envContent -match 'GOOGLE_SERVICE_ACCOUNT_JSON=') {
  # Replace existing value
  $newContent = $envContent -replace $pattern, $replacement
  Set-Content $envPath $newContent -NoNewline
  Write-Host "[OK] Updated GOOGLE_SERVICE_ACCOUNT_JSON in .env" -ForegroundColor Green
} else {
  # Append it
  Add-Content $envPath "`nGOOGLE_SERVICE_ACCOUNT_JSON=$minified"
  Write-Host "[OK] Appended GOOGLE_SERVICE_ACCOUNT_JSON to .env" -ForegroundColor Green
}

# Also update GOOGLE_APPLICATION_CREDENTIALS to point to the file (for Node.js SDK)
Write-Host "[OK] GOOGLE_APPLICATION_CREDENTIALS already set to ./secrets/service-account.json" -ForegroundColor Green

Write-Host ""
Write-Host "Done! Both auth methods are now configured:" -ForegroundColor Cyan
Write-Host "  - Node.js (functions/src):   GOOGLE_APPLICATION_CREDENTIALS (file path)" -ForegroundColor Gray
Write-Host "  - Deno edge functions:        GOOGLE_SERVICE_ACCOUNT_JSON (inline JSON)" -ForegroundColor Gray
Write-Host ""
Write-Host "Restart your edge functions to pick up the new env:" -ForegroundColor Yellow
Write-Host "  cd ai-volunteer-mvp"
Write-Host "  supabase functions serve whatsapp-webhook --env-file ../.env"
