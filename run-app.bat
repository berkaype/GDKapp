@echo off
chcp 65001 >nul
setlocal

cd /d "%~dp0"
set "APP_ROOT=%~dp0"
set "DB_PATH=%APP_ROOT%backend\bufe.db"

echo === GDKAPPv2 Production Runner ===
echo Starting the optimized single-process application.

if not exist "%APP_ROOT%release\bufe-yonetim-backend.exe" (
  echo [ERROR] Packaged application not found.
  echo Build it with: npm.cmd --prefix backend run build:exe
  pause
  endlocal
  exit /b 1
)

if not exist "%DB_PATH%" (
  echo [ERROR] Application database not found: %DB_PATH%
  pause
  endlocal
  exit /b 1
)

call "%APP_ROOT%release\run-app.bat" %*
set "GDK_EXIT_CODE=%ERRORLEVEL%"
endlocal & exit /b %GDK_EXIT_CODE%
