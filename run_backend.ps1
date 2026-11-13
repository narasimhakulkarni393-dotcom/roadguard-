Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  Starting RoadGuard AI FastAPI Backend on Port 8000" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location (Join-Path $scriptDir "backend")
$env:PYTHONPATH = (Join-Path $scriptDir "backend")
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
