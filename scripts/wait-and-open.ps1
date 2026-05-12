# Wait until 127.0.0.1:3000 accepts connections, then open browser.
# Started minimized from 시작.bat before "npm run dev".
$ErrorActionPreference = 'SilentlyContinue'
$url = 'http://127.0.0.1:3000/'
for ($i = 0; $i -lt 120; $i++) {
  $t = Test-NetConnection -ComputerName 127.0.0.1 -Port 3000 -WarningAction SilentlyContinue
  if ($t -and $t.TcpTestSucceeded) {
    Start-Process $url
    exit 0
  }
  Start-Sleep -Milliseconds 500
}
Write-Host 'Port 3000 did not open in time. Check the server window for errors. Opening browser anyway.'
Start-Process $url
