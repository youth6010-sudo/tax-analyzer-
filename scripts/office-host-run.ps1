# 사무실 자체호스팅 실행기
#   - 프로덕션 빌드 후 LAN(0.0.0.0:3000)에서 앱을 구동한다.
#   - 블루홀 호출이 "사무실 공인 IP"에서 나가므로 IP 허용목록에 걸리지 않는다.
#   - 서버가 죽으면 자동 재시작한다. (창을 닫으면 종료)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

if (-not (Test-Path ".env.local")) {
  Write-Host "[경고] .env.local 이 없습니다. DATABASE_URL / SESSION_SECRET / BLUEHOLE_ENC_KEY 등이 필요합니다." -ForegroundColor Yellow
}

Write-Host "프로덕션 빌드 시작..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { throw "빌드 실패 — 위 로그를 확인하세요." }

Write-Host "`n=== 동료 접속 주소 (같은 사무실 네트워크) ===" -ForegroundColor Cyan
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
  ForEach-Object { Write-Host ("  http://{0}:3000" -f $_.IPAddress) -ForegroundColor Green }
Write-Host ""

while ($true) {
  Write-Host "서버 시작: http://0.0.0.0:3000  (종료하려면 이 창을 닫으세요)" -ForegroundColor Green
  npm run start
  Write-Host "서버가 종료되었습니다. 5초 후 재시작합니다..." -ForegroundColor Yellow
  Start-Sleep -Seconds 5
}
