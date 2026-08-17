@echo off
setlocal

REM Ensure we're running from the repository root (where this script lives)
cd /d "%~dp0"

echo =======================================================
echo              m2m Fullstack Development
echo =======================================================
echo.

REM 0. Ensure Docker Desktop is running
echo [0/3] Checking Docker Desktop status...
docker info >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] Docker Desktop engine is already active.
    goto DOCKER_READY
)

echo [INFO] Docker daemon is not active. Attempting to start Docker Desktop...
set "DOCKER_EXE=%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
if not exist "%DOCKER_EXE%" (
    set "DOCKER_EXE=%LOCALAPPDATA%\Programs\Docker\Docker\Docker Desktop.exe"
)

if not exist "%DOCKER_EXE%" (
    echo [WARNING] Could not locate Docker Desktop executable automatically.
    echo Please ensure Docker Desktop is started manually.
    goto DOCKER_READY
)

start "" "%DOCKER_EXE%"
echo Waiting for Docker daemon to initialize (this may take 15-30 seconds)...
set /a DOCKER_WAIT_COUNT=0

:WAIT_DOCKER
timeout /t 2 /nobreak >nul
docker info >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] Docker Desktop engine is ready.
    goto DOCKER_READY
)
set /a DOCKER_WAIT_COUNT+=1
if %DOCKER_WAIT_COUNT% GEQ 30 (
    echo [WARNING] Docker Desktop did not respond within 60s. Proceeding anyway...
    goto DOCKER_READY
)
goto WAIT_DOCKER

:DOCKER_READY
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
