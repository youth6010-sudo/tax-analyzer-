@echo off
chcp 65001 >nul
echo ===================================
echo  종합소득세 신고서 분석 도구 시작
echo ===================================
echo.
echo 개발 서버를 시작합니다...
echo 잠시 후 브라우저에서 http://localhost:3000 을 열어주세요.
echo.
echo 종료하려면 이 창을 닫으세요.
echo.
cd /d "%~dp0"
set PATH=%PATH%;C:\Program Files\nodejs
npm run dev
pause
