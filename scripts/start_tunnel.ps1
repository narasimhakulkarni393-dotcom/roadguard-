# Starts a Cloudflare quick tunnel to the local PitScout backend and prints the public URL.
# Run from the repository root:  powershell -ExecutionPolicy Bypass -File scripts\start_tunnel.ps1
$ErrorActionPreference = "Stop"

$port = 8001
$dir = Join-Path $env:USERPROFILE "tools"
$exe = Join-Path $dir "cloudflared.exe"

if (-not (Test-Path $exe)) {
    New-Item -ItemType Directory -Force $dir | Out-Null
    Write-Host "Downloading cloudflared from the official Cloudflare release..."
    Invoke-WebRequest -UseBasicParsing `
        -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" `
        -OutFile $exe
}

$health = "http://127.0.0.1:$port/api/v1/health"
try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri $health -TimeoutSec 5
    Write-Host "Local backend OK: $($r.Content)"
} catch {
    Write-Warning "Local backend is not answering at $health. Start it first:"
    Write-Host "  cd backend"
    Write-Host "  `$env:ROADGUARD_API_KEY='<your key>'; python -m uvicorn app.main:app --host 127.0.0.1 --port $port"
}

Write-Host ""
Write-Host "Starting tunnel. Copy the https://<random>.trycloudflare.com URL it prints."
Write-Host "Keep this window open while the live site is in use."
& $exe tunnel --url "http://127.0.0.1:$port"
