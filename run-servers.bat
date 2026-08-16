@echo off
setlocal

REM Ensure we're running from the repository root (where this script lives)
cd /d "%~dp0"

echo =======================================================
echo              m2m Fullstack Development
echo =======================================================
echo.

REM 1. Start Redis container via Docker Compose (Port 6379)
echo [1/3] Starting Redis container on port 6379...
docker compose up -d redis >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [WARNING] Docker is not running or redis container failed to start.
    echo Please ensure Docker Desktop or a local Redis server is active at port 6379.
) else (
    echo [OK] Redis is ready at redis://127.0.0.1:6379.
)
echo.

REM 2. Ensure dependencies are up to date
echo [2/3] Checking workspace dependencies...
call pnpm install
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] pnpm install failed.
    pause
    exit /b %ERRORLEVEL%
)
echo.

REM 3. Run Backend API, Worker, and Frontend together
echo [3/3] Starting Backend API (3000), Worker, and Frontend (5173)...
echo -------------------------------------------------------
echo  - API:      http://localhost:3000
echo  - Frontend: http://localhost:5173
echo  - Press Ctrl+C at any time to stop all services.
echo -------------------------------------------------------
echo.

call pnpm run dev

echo.
echo [INFO] All services have been stopped.
pause
endlocal
exit /b 0
