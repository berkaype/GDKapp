@echo off
chcp 65001 >nul
setlocal

REM Change to the directory of this script (release folder)
cd /d "%~dp0"

set "APP_DIR=%~dp0"
set "EXE_NAME=bufe-yonetim-backend.exe"
set "PORT=%~1"
if "%PORT%"=="" set "PORT=3001"

REM When launched from the project tree, use the same live database as the root
REM launcher. A standalone release keeps using its own data\bufe.db fallback.
if not defined DB_PATH (
  if exist "%APP_DIR%..\backend\bufe.db" (
    for %%I in ("%APP_DIR%..\backend\bufe.db") do set "DB_PATH=%%~fI"
  )
)

REM Validate before interpolating the port into commands or URLs.
set "GDK_REQUESTED_PORT=%PORT%"
powershell -NoProfile -Command "$p=0; if ([int]::TryParse($env:GDK_REQUESTED_PORT, [ref]$p) -and $p -ge 1 -and $p -le 65535 -and $env:GDK_REQUESTED_PORT -eq $p.ToString()) { exit 0 }; exit 1"
if errorlevel 1 (
  echo [ERROR] Port must be a whole number from 1 to 65535.
  pause
  exit /b 1
)

REM Do not mistake another process on this port for the app we start below.
powershell -NoProfile -Command "$p=[int]$env:GDK_REQUESTED_PORT; $listener=[System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() | Where-Object { $_.Port -eq $p }; if ($listener) { exit 1 }; exit 0"
if errorlevel 1 (
  echo [ERROR] Port %PORT% is already in use. Choose another port.
  pause
  exit /b 1
)

if not exist "%EXE_NAME%" (
  echo [ERROR] %EXE_NAME% not found in: %APP_DIR%
  echo Build it with: npm.cmd --prefix backend run build:exe
  pause
  exit /b 1
)

REM Ensure data folder exists for the packaged app to write its DB
if not exist "%APP_DIR%data" mkdir "%APP_DIR%data" >nul 2>&1

echo === Starting GDK App (packaged) on port %PORT% ===
echo (This window will monitor the server and open your browser)

REM Start backend executable in background with specified port
start "GDK Backend" /b cmd /d /c "set PORT=%PORT%&& %EXE_NAME%"

REM Wait for server to become ready
set /a __retries=0
:wait_loop
>nul 2>&1 powershell -NoProfile -Command "try { $r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://127.0.0.1:%PORT%/api/health; if ($r.StatusCode -eq 200){ exit 0 } else { exit 1 } } catch { exit 1 }"
if %ERRORLEVEL% EQU 0 goto opened
set /a __retries+=1
if %__retries% GEQ 30 goto startup_failed
timeout /t 1 >nul
goto wait_loop

:opened
echo Opening browser at http://localhost:%PORT%
start "" http://localhost:%PORT%

echo.
echo Press Ctrl+C to stop. This window will keep running.
REM Keep the window open
:hold
timeout /t 3600 >nul
goto hold

:startup_failed
echo.
echo [ERROR] Backend did not become ready at http://localhost:%PORT%/api/health
echo Review the backend output above, then close this window and try again.
pause
exit /b 1

