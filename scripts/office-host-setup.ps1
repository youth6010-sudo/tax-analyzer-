# 사무실 자체호스팅 1회 설정 (관리자 권한 PowerShell에서 실행)
#   1) 방화벽 인바운드 TCP 3000 허용  → 동료 PC에서 접속 가능
#   2) 부팅/로그온 시 자동시작 작업 등록 → PC 켜면 서버 자동 구동
#   3) 동료 접속 주소 안내
$ErrorActionPreference = 'Stop'
$port = 3000
$taskName = "TaxAnalyzerOfficeHost"
$runScript = Join-Path $PSScriptRoot 'office-host-run.ps1'

# 1) 방화벽
$ruleName = "TaxAnalyzer Office $port"
if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $port | Out-Null
  Write-Host "[OK] 방화벽 규칙 추가: TCP $port 인바운드 허용" -ForegroundColor Green
} else {
  Write-Host "[SKIP] 방화벽 규칙이 이미 있습니다." -ForegroundColor DarkGray
}

# 2) 자동시작 (로그온 시)
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-ExecutionPolicy Bypass -WindowStyle Minimized -File `"$runScript`""
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Write-Host "[OK] 자동시작 작업 등록: '$taskName' (로그온 시 실행, 최소화 창)" -ForegroundColor Green

# 3) 접속 주소
Write-Host "`n=== 동료 접속 주소 (같은 사무실 네트워크) ===" -ForegroundColor Cyan
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
  ForEach-Object { Write-Host ("  http://{0}:{1}" -f $_.IPAddress, $port) -ForegroundColor Green }

Write-Host "`n설정 완료. 지금 바로 구동하려면:  npm run host:office" -ForegroundColor Cyan
