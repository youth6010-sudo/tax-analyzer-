@echo off
REM Same as 시작.bat
cd /d "%~dp0"
set "PATH=%PATH%;C:\Program Files\nodejs"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js not found. Install from https://nodejs.org LTS then run again.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo First run: npm install ^(may take a few minutes^)...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

echo Starting server. Browser opens when http://127.0.0.1:3000 is ready.
echo Close this window to stop the server.
start "" /MIN powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\wait-and-open.ps1"

call npm run dev
pause
