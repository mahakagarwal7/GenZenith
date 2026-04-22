param(
	[switch]$SkipSupabaseStart,
	[switch]$ResetLocalDb
)

$ErrorActionPreference = 'Stop'

function Require-Command {
	param([string]$Name)

	if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
		throw "Required command '$Name' was not found in PATH."
	}
}

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$functionsDir = Join-Path $repoRoot 'ai-volunteer-mvp\functions'
$predictionDir = Join-Path $repoRoot 'ai-volunteer-mvp\prediction-service'
$appDir = Join-Path $repoRoot 'ai-volunteer-mvp'
$envExample = Join-Path $repoRoot '.env.example'
$envFile = Join-Path $repoRoot '.env'

Write-Host '==> Running preflight checks...' -ForegroundColor Cyan
Require-Command node
Require-Command npm
Require-Command python
Require-Command supabase

if (-not (Test-Path $envFile)) {
	if (-not (Test-Path $envExample)) {
		throw "Missing .env and .env.example in repo root."
	}

	Write-Host '==> .env not found; creating from .env.example...' -ForegroundColor Yellow
	Copy-Item -Path $envExample -Destination $envFile
}

if (-not $SkipSupabaseStart) {
	Write-Host '==> Starting local Supabase services (Docker required)...' -ForegroundColor Cyan
	Push-Location $appDir
	supabase start

	if ($ResetLocalDb) {
		Write-Host '==> Resetting local Supabase database and rerunning migrations...' -ForegroundColor Yellow
		supabase db reset
	}

	Pop-Location
}

Write-Host '==> Installing Node/TypeScript dependencies (functions)...' -ForegroundColor Cyan
Push-Location $functionsDir
npm ci

Write-Host '==> Building TypeScript (functions)...' -ForegroundColor Cyan
npm run build

Write-Host '==> Running Jest tests (functions)...' -ForegroundColor Cyan
npm test -- --runInBand
Pop-Location

Write-Host '==> Installing Python dependencies (prediction-service, no venv)...' -ForegroundColor Cyan
Push-Location $predictionDir
python -m pip install --user -r requirements.txt

Write-Host '==> Running pytest (prediction-service)...' -ForegroundColor Cyan
python -m pytest -q
Pop-Location

Write-Host '==> Setup and tests completed successfully.' -ForegroundColor Green
Write-Host '    Supabase Edge Functions can be served with:' -ForegroundColor Green
Write-Host '    supabase functions serve whatsapp-webhook --env-file ../.env' -ForegroundColor Green
Write-Host '    supabase functions serve volunteer-response --env-file ../.env' -ForegroundColor Green
Write-Host '    supabase functions serve need-created --env-file ../.env' -ForegroundColor Green
