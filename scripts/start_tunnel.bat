@echo off
setlocal
set "PORT=8001"
set "DIR=%USERPROFILE%\tools"
set "EXE=%DIR%\cloudflared.exe"

if not exist "%DIR%" mkdir "%DIR%"
if not exist "%EXE%" (
  echo Downloading cloudflared from the official Cloudflare release...
  curl.exe -L --fail -o "%EXE%" https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
  if errorlevel 1 (
    echo Download failed. Open this URL manually and save it as "%EXE%":
    echo https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
    pause
    exit /b 1
  )
)

echo Checking local backend on port %PORT%...
curl.exe -s --max-time 5 http://127.0.0.1:%PORT%/api/v1/health
echo.

echo Starting tunnel. Copy the https://<random>.trycloudflare.com URL it prints.
echo Keep this window open while the live site is in use.
"%EXE%" tunnel --url http://127.0.0.1:%PORT%
pause
