param(
  [int]$Port = 3000
)
$ErrorActionPreference = 'SilentlyContinue'
if (-not (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue)) {
  Write-Host '[free-port] Cannot query port' $Port '. Free it manually if dev fails.'
  exit 0
}

$byPid = @{}
Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | ForEach-Object {
  $id = $_.OwningProcess
  if ($null -ne $id) { $byPid[$id] = $true }
}

foreach ($id in $byPid.Keys) {
  $proc = Get-Process -Id $id -ErrorAction SilentlyContinue
  if (-not $proc) { continue }
  $name = $proc.ProcessName
  if ($name -notin 'node', 'nodejs') {
    Write-Host "[free-port] Port $Port is used by $name (PID $id). Close it, then run again."
    exit 1
  }
  Write-Host "[free-port] Stopping $name PID $id (port $Port)"
  Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
}
exit 0
