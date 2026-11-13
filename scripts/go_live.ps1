# One-shot: tunnel the local backend, point Vercel at it, redeploy, verify.
# Usage (from the repository root):
#   powershell -ExecutionPolicy Bypass -File scripts\go_live.ps1
# Requires: local backend on 127.0.0.1:8001, cloudflared (auto-downloaded), logged-in vercel CLI.
$ErrorActionPreference = "Stop"

$port = 8001
$root = Split-Path -Parent $PSScriptRoot
$frontend = Join-Path $root "frontend"
$liveUrl = "https://frontend-nine-flame-89.vercel.app"
$toolsDir = Join-Path $env:USERPROFILE "tools"
$exe = Join-Path $toolsDir "cloudflared.exe"
$log = Join-Path $env:TEMP "pitscout-tunnel.log"

# 1. Local backend must be healthy.
Write-Host "[1/5] Checking local backend on port $port..."
try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$port/api/v1/health" -TimeoutSec 8
    Write-Host "      OK: $($r.Content)"
} catch {
    Write-Host "      FAILED: no backend on 127.0.0.1:$port." -ForegroundColor Red
    Write-Host "      Start it in another window first:"
    Write-Host "        cd `"$root\backend`""
    Write-Host "        `$env:ROADGUARD_API_KEY='<same key Vercel uses>'; python -m uvicorn app.main:app --host 127.0.0.1 --port $port"
    exit 1
}

# 2. cloudflared.
if (-not (Test-Path $exe)) {
    Write-Host "[2/5] Downloading cloudflared from the official Cloudflare release..."
    New-Item -ItemType Directory -Force $toolsDir | Out-Null
    Invoke-WebRequest -UseBasicParsing `
        -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" `
        -OutFile $exe
} else {
    Write-Host "[2/5] cloudflared already present."
}

# 3. Start the quick tunnel and read its public URL from stderr.
Write-Host "[3/5] Starting tunnel..."
if (Test-Path $log) { Remove-Item $log -Force }
$proc = Start-Process -FilePath $exe `
    -ArgumentList "tunnel", "--url", "http://127.0.0.1:$port", "--no-autoupdate" `
    -RedirectStandardError $log -RedirectStandardOutput "$log.out" -PassThru -WindowStyle Hidden

$tunnelUrl = $null
for ($i = 0; $i -lt 45; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Path $log) {
        $match = Select-String -Path $log -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" -AllMatches |
            Select-Object -First 1
        if ($match) {
            $tunnelUrl = $match.Matches[0].Value
            break
        }
    }
}
if (-not $tunnelUrl) {
    Write-Host "      FAILED: no tunnel URL after 45s. Log: $log" -ForegroundColor Red
    if (Test-Path $log) { Get-Content $log -Tail 20 }
    exit 1
}
Write-Host "      Tunnel: $tunnelUrl"

# Public health check through the tunnel.
$code = & curl.exe -s -o NUL -w "%{http_code}" --max-time 20 "$tunnelUrl/api/v1/health"
if ($code -ne "200") {
    Write-Host "      WARNING: tunnel health returned HTTP $code (Cloudflare can take ~30s to warm up)." -ForegroundColor Yellow
} else {
    Write-Host "      Public health: HTTP 200"
}

# 4. Point Vercel production at the tunnel and redeploy.
Write-Host "[4/5] Updating Vercel BACKEND_URL and redeploying production (1-2 min)..."
Push-Location $frontend
try {
    & vercel env rm BACKEND_URL production --yes 2>&1 | Out-Null
    $tunnelUrl | & vercel env add BACKEND_URL production 2>&1 | Out-Null
    & vercel --prod --yes 2>&1 | Out-Null
} finally {
    Pop-Location
}

# 5. Verify the live site reaches the API.
Write-Host "[5/5] Verifying $liveUrl/api/v1/health ..."
$body = & curl.exe -s --max-time 30 "$liveUrl/api/v1/health"
$code = & curl.exe -s -o NUL -w "%{http_code}" --max-time 30 "$liveUrl/api/v1/health"
Write-Host "      HTTP $code"
Write-Host "      $body"
if ($code -eq "200") {
    Write-Host "DONE. The live site is connected." -ForegroundColor Green
} elseif ($code -eq "401" -or $body -match "401|Unauthorized") {
    Write-Host "The tunnel works but the keys differ. Set Vercel ROADGUARD_API_KEY to the same" -ForegroundColor Yellow
    Write-Host "value the local backend was started with, then: cd frontend; vercel --prod" -ForegroundColor Yellow
} else {
    Write-Host "Live proxy still failing (HTTP $code). Check the Vercel deployment log and BACKEND_URL." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Keep this machine awake: the tunnel (PID $($proc.Id)) and the uvicorn process must stay running."
Write-Host "Stop the tunnel with: Stop-Process -Id $($proc.Id)"
Write-Host "For an always-on backend, deploy the Render Blueprint (see README Deployment)."
