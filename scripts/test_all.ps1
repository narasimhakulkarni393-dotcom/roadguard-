# Run all tests for RoadGuard AI
$env:PYTHONPATH = "backend"
Write-Host "Running Backend Tests..." -ForegroundColor Cyan
python -m pytest backend/tests/test_backend.py -v

Write-Host "`nBuilding Frontend..." -ForegroundColor Cyan
Set-Location "$PSScriptRoot\..\frontend"
npm run build
