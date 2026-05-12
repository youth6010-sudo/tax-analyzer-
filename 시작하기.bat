@echo off
chcp 65001 >nul
title 종합소득세 분석 - 서버 실행
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [오류] Node.js 가 설치되어 있지 않습니다.
  echo        https://nodejs.org  에서 LTS 버전을 설치한 뒤 다시 실행하세요.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo.
  echo 처음 실행입니다. 필요한 파일을 받는 중입니다 ^(2~5분 걸릴 수 있음^)...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo [오류] 설치에 실패했습니다. 인터넷 연결을 확인하세요.
    pause
    exit /b 1
  )
)

echo.
echo ========================================
echo   준비되었습니다.
echo   브라우저 주소창에 입력:  http://localhost:3000
echo   이 창을 닫으면 프로그램이 종료됩니다.
echo ========================================
echo.
call npm run dev
pause
