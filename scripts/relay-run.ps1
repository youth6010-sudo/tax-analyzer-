# 블루홀 중계기 실행기 (자동 재시작)
#   - scripts/bluehole-relay.mjs 를 구동한다. (프록시 + cloudflared 무료 터널 + DB 자동 등록)
#   - 프로세스가 죽으면 자동 재시작한다. (창을 닫으면 종료)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

if (-not (Test-Path ".env.local")) {
  Write-Host "[경고] .env.local 이 없습니다. DATABASE_URL 이 필요합니다." -ForegroundColor Yellow
}

# cloudflared 설치 확인
if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
  Write-Host "[안내] cloudflared 가 없습니다. 설치를 시도합니다 (winget)..." -ForegroundColor Yellow
  try { winget install --id Cloudflare.cloudflared --accept-source-agreements --accept-package-agreements } catch {}
  if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
    Write-Host "[오류] cloudflared 설치 실패. 수동 설치 후 다시 실행하세요:" -ForegroundColor Red
    Write-Host "       winget install --id Cloudflare.cloudflared" -ForegroundColor Red
    Write-Host "       또는 https://github.com/cloudflare/cloudflared/releases" -ForegroundColor Red
    exit 1
  }
}

while ($true) {
  Write-Host "블루홀 중계기 시작... (종료하려면 이 창을 닫으세요)" -ForegroundColor Green
  npm run relay:bluehole
  Write-Host "중계기가 종료되었습니다. 5초 후 재시작합니다..." -ForegroundColor Yellow
  Start-Sleep -Seconds 5
}
