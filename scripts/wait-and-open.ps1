param(
  [int]$Port = 3000
)
$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'

# Next prints localhost; try both (some setups differ for IPv4/IPv6)
$candidates = @(
  "http://127.0.0.1:$Port/",
  "http://localhost:$Port/"
)

function Test-HttpReady {
  param([string]$Uri)
  if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
    & curl.exe -fsS -o NUL -m 3 --http1.1 $Uri 2>$null
    if ($LASTEXITCODE -eq 0) { return $true }
  }
  try {
    $wc = New-Object System.Net.WebClient
    $wc.Headers['User-Agent'] = 'tax-analyzer-launcher'
    $null = $wc.DownloadString($Uri)
    return $true
  } catch {
    return $false
  } finally {
    if ($null -ne $wc) { $wc.Dispose() }
  }
}

function Open-DefaultBrowser {
  param([string]$Uri)
  try {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $Uri
    $psi.UseShellExecute = $true
    [void][System.Diagnostics.Process]::Start($psi)
    return
  } catch { }
  try {
    Start-Process -FilePath 'rundll32' -ArgumentList @('url.dll,FileProtocolHandler', $Uri)
    return
  } catch { }
  Start-Process cmd.exe -ArgumentList @('/c', 'start', '', $Uri)
}

function First-ReadyUrl {
  foreach ($u in $candidates) {
    if (Test-HttpReady -Uri $u) { return $u }
  }
  return $null
}

for ($i = 0; $i -lt 180; $i++) {
  $ready = First-ReadyUrl
  if ($null -ne $ready) {
    Open-DefaultBrowser -Uri $ready
    exit 0
  }
  Start-Sleep -Milliseconds 500
}

Write-Host "Browser was not opened: server did not return HTTP OK in time."
Write-Host "Open manually: http://localhost:$Port/"
exit 1
