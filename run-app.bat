@echo off
chcp 65001 >nul
setlocal ENABLEDELAYEDEXPANSION

REM Change to the directory of this script
cd /d "%~dp0"

set "APP_ROOT=%~dp0"
set "BACKEND_DIR=%APP_ROOT%backend"
set "FRONTEND_DIR=%APP_ROOT%frontend"
set "BACKEND_PORT=3001"

REM Detect if backend port is already in use; if so, switch to 3002
for /f "tokens=*" %%P in ('netstat -ano ^| findstr /c":%BACKEND_PORT% "') do set "_PORT_IN_USE=1"
if defined _PORT_IN_USE (
  set "BACKEND_PORT=3002"
  set "_PORT_IN_USE="
)

echo === GDKAPPv2 Runner ===
echo (Tip: Run this from a terminal to see logs)

echo Checking versions...
for /f "delims=" %%V in ('node -v 2^>nul') do set NODE_VERSION=%%V
for /f "delims=" %%V in ('npm -v 2^>nul') do set NPM_VERSION=%%V
echo Node: %NODE_VERSION%  NPM: %NPM_VERSION%

REM Check Node.js
where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or not in PATH.
  echo Please install Node.js from https://nodejs.org/ and try again.
  goto :end
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm is not available in PATH.
  echo Please install Node.js which includes npm and try again.
  goto :end
)

REM Ensure backend .env
if not exist "%BACKEND_DIR%\.env" (
  echo Creating backend .env with default JWT_SECRET
  >"%BACKEND_DIR%\.env" echo JWT_SECRET=dev_secret_change_me
)

REM Ensure frontend .env
if not exist "%FRONTEND_DIR%\.env" (
  echo Creating frontend .env with default VITE_API_BASE
  >"%FRONTEND_DIR%\.env" echo VITE_API_BASE=http://localhost:3001/api
)

REM Install backend deps (always to ensure new deps like dotenv)
echo Installing backend dependencies...
pushd "%BACKEND_DIR%"
call npm install || goto :end
popd

REM Install frontend deps (always)
echo Installing frontend dependencies...
pushd "%FRONTEND_DIR%"
call npm install || goto :end
popd

REM Try to start both in a single window using npx concurrently
where npx >nul 2>&1
if errorlevel 1 goto fallback

set "FORCE_COLOR=1"
echo Starting backend and frontend in single window...
call npx -y concurrently -n backend,frontend -c "bgBlue.bold,bgGreen.bold" ^
  "cmd /c set PORT=%BACKEND_PORT%&& npm --prefix \"%BACKEND_DIR%\" run dev" ^
  "cmd /c set CHOKIDAR_USEPOLLING=1&& set VITE_API_BASE=http://localhost:%BACKEND_PORT%/api&& npm --prefix \"%FRONTEND_DIR%\" run dev"
if errorlevel 1 goto fallback_end
goto :end

:fallback
echo [WARN] npx not found; using fallback (same window)
start /b cmd /c "set PORT=%BACKEND_PORT%&& npm --prefix \"%BACKEND_DIR%\" run dev"
echo Frontend logs below. Press Ctrl+C to stop.
set CHOKIDAR_USEPOLLING=1 && set VITE_API_BASE=http://localhost:%BACKEND_PORT%/api && call npm --prefix "%FRONTEND_DIR%" run dev
goto :end

:fallback_end
echo.
echo One of the processes exited with an error. Logs above.
echo Press any key to close this window.
pause >nul

:end
endlocal
echo.
echo Done. If this window closed too fast before, it now pauses.
pause

