@echo off
chcp 65001 >nul
setlocal ENABLEDELAYEDEXPANSION

REM Change to the directory of this script (release folder)
cd /d "%~dp0"

set "APP_DIR=%~dp0"
set "EXE_NAME=bufe-yonetim-backend.exe"
set "PORT=%1"
if "%PORT%"=="" set "PORT=3001"

if not exist "%EXE_NAME%" (
  echo [ERROR] %EXE_NAME% not found in: %APP_DIR%
  echo Make sure you built the release (npm --prefix backend run build:exe)
  pause
  exit /b 1
)

REM Ensure data folder exists for the packaged app to write its DB
if not exist "%APP_DIR%data" mkdir "%APP_DIR%data" >nul 2>&1

echo === Starting GDK App (packaged) on port %PORT% ===
echo (This window will monitor the server and open your browser)

REM Start backend executable in background with specified port
start "GDK Backend" /b cmd /c "set PORT=%PORT% && "%EXE_NAME%""

REM Wait for server to become ready
set /a __retries=0
:wait_loop
>nul 2>&1 powershell -Command "try { $r=Invoke-WebRequest -UseBasicParsing http://127.0.0.1:%PORT%/api/daily-revenue; if ($r.StatusCode -eq 200){ exit 0 } else { exit 1 } } catch { exit 1 }"
if %ERRORLEVEL% NEQ 0 (
  set /a __retries+=1
  if %__retries% GEQ 30 goto opened
  timeout /t 1 >nul
  goto wait_loop
)

:opened
echo Opening browser at http://localhost:%PORT%
start "" http://localhost:%PORT%

echo.
echo Press Ctrl+C to stop. This window will keep running.
REM Keep the window open
:hold
timeout /t 3600 >nul
goto hold

