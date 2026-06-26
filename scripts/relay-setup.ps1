# 블루홀 중계기 자동시작 1회 설정 (관리자 권한 PowerShell에서 실행)
#   - 로그온 시 중계기가 자동으로 켜지도록 예약 작업을 등록한다.
#   - 죽으면 자동 재시작(relay-run.ps1 내부 루프) + 작업 자체도 실패 시 재시도.
$ErrorActionPreference = 'Stop'
$taskName = "TaxAnalyzerBlueholeRelay"
$runScript = Join-Path $PSScriptRoot 'relay-run.ps1'

# cloudflared 설치 확인(없으면 설치 시도)
if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
  Write-Host "[안내] cloudflared 설치 시도 (winget)..." -ForegroundColor Yellow
  try { winget install --id Cloudflare.cloudflared --accept-source-agreements --accept-package-agreements } catch {}
}

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-ExecutionPolicy Bypass -WindowStyle Minimized -File `"$runScript`""
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Write-Host "[OK] 자동시작 작업 등록: '$taskName' (로그온 시 실행, 최소화 창)" -ForegroundColor Green

Write-Host "`n설정 완료. 지금 바로 구동하려면:  npm run relay:office" -ForegroundColor Cyan
Write-Host "중계기가 켜져 있으면 Vercel에서 블루홀 연동이 됩니다." -ForegroundColor Cyan
