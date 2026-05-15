param(
  [int]$Port = 3000
)
$ErrorActionPreference = 'SilentlyContinue'
$url = "http://127.0.0.1:$Port/"

function Test-PortOpen {
  param([string]$TargetHost = '127.0.0.1', [int]$PortNum = 3000)
  $c = $null
  try {
    $c = New-Object System.Net.Sockets.TcpClient
    $c.Connect($TargetHost, $PortNum)
    return $c.Connected
  } catch {
    return $false
  } finally {
    if ($null -ne $c) { $c.Dispose() }
  }
}

for ($i = 0; $i -lt 120; $i++) {
  if (Test-PortOpen -PortNum $Port) {
    Start-Process $url
    exit 0
  }
  Start-Sleep -Milliseconds 500
}
Write-Host "Port $Port did not open in time. Check the server window for errors."
exit 1
