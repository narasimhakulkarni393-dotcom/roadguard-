@echo off
echo ========================================================
echo   Starting RoadGuard AI FastAPI Backend on Port 8000
echo ========================================================
cd /d "%~dp0backend"
set PYTHONPATH=%~dp0backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
pause
