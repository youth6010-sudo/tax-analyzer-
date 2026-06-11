@echo off
setlocal
REM ASCII only - cmd.exe may break on UTF-8 symbols in this file
cd /d "%~dp0"

set "PATH=%PATH%;%ProgramFiles%\nodejs;%ProgramFiles(x86)%\nodejs"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install LTS from https://nodejs.org
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm not found. Reinstall Node.js.
  pause
  exit /b 1
)

if not exist "package.json" (
  echo [ERROR] package.json missing. This script must live inside the tax-analyzer folder.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Running npm install ...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Unblock-File -LiteralPath '%~dp0scripts\wait-and-open.ps1' -ErrorAction SilentlyContinue } catch {}"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\free-port.ps1" -Port 3000
if errorlevel 1 (
  echo Port 3000 is still blocked. Close the program shown above, then run this file again.
  pause
  exit /b 1
)

echo.
echo [stable] Build once (1-3 min) then start server. Code changes: run npm run build again.
echo Browser opens when http://127.0.0.1:3000 returns HTTP OK. Wrong page: port 3000 in use.
echo Close this window to stop the server.
echo.
call npm run build
if errorlevel 1 (
  echo Build failed. See messages above.
  pause
  exit /b 1
)

start "" /MIN powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\wait-and-open.ps1" -Port 3000

call npm run start
pause
endlocal
