#Requires -RunAsAdministrator
# Same-office: allow inbound TCP 3000 for Next.js on this PC.
New-NetFirewallRule `
  -DisplayName "tax-analyzer Next.js port 3000" `
  -Direction Inbound `
  -Protocol TCP `
  -LocalPort 3000 `
  -Action Allow `
  -ErrorAction SilentlyContinue
Write-Host "Done. If a rule already existed, you may see no new line." -ForegroundColor Green
