$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$functionsDir = Join-Path $repoRoot 'ai-volunteer-mvp\functions'
$predictionDir = Join-Path $repoRoot 'ai-volunteer-mvp\prediction-service'

Write-Host '==> Installing Node/TypeScript dependencies (functions)...' -ForegroundColor Cyan
Push-Location $functionsDir
npm ci

Write-Host '==> Building TypeScript (functions)...' -ForegroundColor Cyan
npm run build

Write-Host '==> Running Jest tests (functions)...' -ForegroundColor Cyan
npm test
Pop-Location

Write-Host '==> Installing Python dependencies (prediction-service, no venv)...' -ForegroundColor Cyan
Push-Location $predictionDir
python -m pip install --user -r requirements.txt

Write-Host '==> Running pytest (prediction-service)...' -ForegroundColor Cyan
python -m pytest -q
Pop-Location

Write-Host 'All setup and tests completed successfully.' -ForegroundColor Green
