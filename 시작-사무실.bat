@echo off
REM Office LAN - same wait script for local browser; coworkers use http://THIS-PC-IP:3000
cd /d "%~dp0"
set "PATH=%PATH%;C:\Program Files\nodejs"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js not found. https://nodejs.org
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo npm install...
  call npm install
  if errorlevel 1 pause
)

echo.
echo === Office: coworkers open http://THIS-PC-IP:3000 ===
echo === Your IPv4 list: ===
powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notmatch '^(127\.|169\.)' } | Select-Object -First 8 -ExpandProperty IPAddress"
echo.

echo Starting dev server on 0.0.0.0:3000 ...
start "" /MIN powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\wait-and-open.ps1"

call npm run dev:lan
pause
