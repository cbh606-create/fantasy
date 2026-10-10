# Starts the Fantasy Next.js dev server on port 3001.
# Resolve worktree from this script path so Korean OneDrive paths stay stable.

$ErrorActionPreference = "Stop"
$Worktree = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Port = 3001
$LogDir = Join-Path $Worktree ".logs"
$LogFile = Join-Path $LogDir "dev-server.log"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$existing = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($existing) {
  Add-Content -Path $LogFile -Value "$(Get-Date -Format o) Port $Port already listening (PID $($existing[0].OwningProcess)); skip start"
  exit 0
}

Set-Location -LiteralPath $Worktree
Add-Content -Path $LogFile -Value "$(Get-Date -Format o) Starting npm run dev -- --port $Port in $Worktree"

$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npm) {
  Add-Content -Path $LogFile -Value "$(Get-Date -Format o) ERROR: npm.cmd not found on PATH"
  exit 1
}

Start-Process -FilePath $npm.Source -ArgumentList @("run", "dev", "--", "--port", "$Port") -WorkingDirectory $Worktree -WindowStyle Minimized
