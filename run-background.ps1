# =====================================================================
# Cadence - always-on host setup (Windows, laptop or desktop)
# Run this ONCE, in PowerShell *as Administrator*, from the repo root:
#     powershell -ExecutionPolicy Bypass -File .\run-background.ps1
#
# This is the only script you need to run - it replaces the old
# laptop-setup.ps1, laptop-search-speedup.ps1, laptop-ytdlp-autoupdate.ps1,
# and run-cadence.cmd (all removed; this file does everything they did).
# The lid-close power setting below is a no-op on a desktop with no lid -
# everything else works the same on either.
#
# What it does, every time it runs (this first run, and every
# re-run - see "stays fresh" below):
#   1) Stops the laptop from sleeping/hibernating; closing the lid does
#      nothing (screen still turns off to save power).
#   2) Makes sure yt-dlp is installed via a real Python (not the slow
#      winget standalone build) and upgrades it to the latest version -
#      this is what actually resolves + downloads playable audio, and
#      it's the thing YouTube breaks every few weeks. Sets YT_DLP_PATH
#      so the backend uses it. Also runs `npm install` in backend\ if
#      node_modules is missing (e.g. right after a fresh clone).
#   3) Registers four auto-start Scheduled Tasks (creating them the
#      first time, updating them on every re-run) that all restart
#      themselves if they crash:
#        - "Cadence Backend" - node server.js
#        - "Cadence Tunnel"  - the ngrok tunnel
#        - "Cadence Maintenance" - re-runs THIS SAME SCRIPT weekly, so
#          yt-dlp stays updated and nothing here ever needs a human to
#          remember to run it again.
#        - "Cadence AutoDeploy" - checks every 2 minutes for a new commit
#          on origin/main and, if found, pulls + restarts the backend -
#          so `git push` reaches this machine on its own. See
#          auto-deploy.ps1.
#   4) Starts the backend + tunnel now, and checks the tunnel is up.
#
# Stays fresh: because step 3 registers "Cadence AutoDeploy" and "Cadence
# Maintenance", you truly only run this by hand once - every future push
# goes live within ~2 minutes on its own, and yt-dlp/power settings get
# refreshed weekly. Every later manual run just repeats steps 1-4 (all
# idempotent/harmless to redo).
#
# Prereqs (install first): node, ngrok - both on PATH, with
# `ngrok config add-authtoken <token>` already run once.
# =====================================================================

param(
  [string]$RepoPath     = $PSScriptRoot,
  [string]$Domain       = "say-sixfold-scrap.ngrok-free.dev",
  [int]   $Port         = 3999,
  [int]   $IntervalDays = 7,       # how often "Cadence Maintenance" re-runs this script
  [string]$MaintTime    = "04:00"  # local time of day for that re-run (24h, "HH:mm")
)

$ErrorActionPreference = "Stop"

$logDir  = Join-Path $RepoPath "logs"
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$logFile = Join-Path $logDir "cadence-setup.log"
function Log([string]$msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
  Write-Host $line
  Add-Content -Path $logFile -Value $line
}

# --- must be admin (needed for the power settings below) -------------
$admin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
         ).IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)
if (-not $admin) { Write-Error "Please run this in an *Administrator* PowerShell window."; exit 1 }

# --- resolve tools -----------------------------------------------------
$nodeExe  = (Get-Command node  -ErrorAction SilentlyContinue).Source
$ngrokExe = (Get-Command ngrok -ErrorAction SilentlyContinue).Source
if (-not $nodeExe)  { Write-Error "node not found on PATH. Install Node.js first." ; exit 1 }
if (-not $ngrokExe) { Write-Error "ngrok not found on PATH. Install ngrok first." ; exit 1 }
$backendDir = Join-Path $RepoPath "backend"
if (-not (Test-Path (Join-Path $backendDir "server.js"))) { Write-Error "Can't find backend\server.js under $RepoPath"; exit 1 }

Log "node : $nodeExe"
Log "ngrok: $ngrokExe"
Log "repo : $RepoPath"

# --- backend dependencies: install if missing (e.g. after a fresh clone) ---
if (-not (Test-Path (Join-Path $backendDir "node_modules"))) {
  Log "backend\node_modules missing - running npm install..."
  Push-Location $backendDir
  try {
    $npmOutput = & npm install 2>&1 | Out-String
    Add-Content -Path $logFile -Value $npmOutput.TrimEnd()
  } finally {
    Pop-Location
  }
  if (-not (Test-Path (Join-Path $backendDir "node_modules\express"))) {
    Write-Error "npm install in backend\ did not produce node_modules\express - check the log."
    exit 1
  }
  Log "  npm install done."
} else {
  Log "backend dependencies already installed."
}

# --- 1) power settings: never sleep; lid close = stay on -------------
Log "Configuring power (never sleep; lid close = stay on)..."
powercfg /change standby-timeout-ac 0
powercfg /change standby-timeout-dc 0
powercfg /change hibernate-timeout-ac 0
powercfg /change hibernate-timeout-dc 0
powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0   # 0 = Do nothing
powercfg /setdcvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0
powercfg /change monitor-timeout-ac 5   # screen CAN turn off - doesn't stop the app
powercfg /change monitor-timeout-dc 10
powercfg /setactive SCHEME_CURRENT
Log "  power settings done."

# --- 2) keep yt-dlp fresh: real Python + pip install --upgrade -------
try {
  Log "Pulling latest code..."
  git -C $RepoPath pull --ff-only 2>&1 | ForEach-Object { Add-Content -Path $logFile -Value $_ }
} catch {
  Log "git pull failed ($($_.Exception.Message)) - continuing with the code already on disk."
}

function Get-RealPython {
  Get-ChildItem "$env:LOCALAPPDATA\Programs\Python" -Filter python.exe -Recurse -ErrorAction SilentlyContinue |
    Select-Object -First 1 -ExpandProperty FullName
}
$py = Get-RealPython
if (-not $py) {
  Log "Installing Python 3.12 (user scope, no admin)..."
  winget install --id Python.Python.3.12 -e --silent `
    --accept-package-agreements --accept-source-agreements --scope user
  $py = Get-RealPython
}
if (-not $py) { Write-Error "No python.exe found under %LOCALAPPDATA%\Programs\Python after install."; exit 1 }
Log "python: $py"

$before = (& $py -m pip show yt-dlp 2>$null | Select-String "^Version:\s*(.+)$").Matches.Groups[1].Value
$beforeDisplay = if ($before) { $before } else { 'not installed' }
Log "Checking for a newer yt-dlp (current: $beforeDisplay)..."
& $py -m pip install --upgrade --quiet pip
$pipOutput = & $py -m pip install --upgrade yt-dlp 2>&1 | Out-String
Add-Content -Path $logFile -Value $pipOutput.TrimEnd()
$after = (& $py -m pip show yt-dlp 2>$null | Select-String "^Version:\s*(.+)$").Matches.Groups[1].Value

$ytdlp = Join-Path (Split-Path $py) "Scripts\yt-dlp.exe"
if (-not (Test-Path $ytdlp)) { Write-Error "pip yt-dlp not found at $ytdlp"; exit 1 }
if ($pipOutput -match "Successfully installed") {
  Log "yt-dlp updated: $before -> $after ($ytdlp)"
} else {
  Log "yt-dlp already up to date ($after)."
}

[Environment]::SetEnvironmentVariable("YT_DLP_PATH", $ytdlp, "User")
$env:YT_DLP_PATH = $ytdlp
Log "Set YT_DLP_PATH (user) -> $ytdlp"

# --- 3) register the always-on + maintenance Scheduled Tasks ---------
Log "Registering Scheduled Tasks..."

$startupSettings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType S4U -RunLevel Limited

$startupTrigger = New-ScheduledTaskTrigger -AtStartup
$startupTrigger.Delay = "PT30S"   # wait 30s after boot so the network is up

$backendAction = New-ScheduledTaskAction -Execute "cmd.exe" `
  -Argument "/c set PORT=$Port&& `"$nodeExe`" server.js" -WorkingDirectory $backendDir
$tunnelAction = New-ScheduledTaskAction -Execute $ngrokExe `
  -Argument "http --url=https://$Domain $Port"

Register-ScheduledTask -TaskName "Cadence Backend" -Action $backendAction -Trigger $startupTrigger -Settings $startupSettings -Principal $principal -Force | Out-Null
Register-ScheduledTask -TaskName "Cadence Tunnel"  -Action $tunnelAction  -Trigger $startupTrigger -Settings $startupSettings -Principal $principal -Force | Out-Null
Log "  'Cadence Backend' and 'Cadence Tunnel' registered."

# Maintenance task: re-runs THIS script weekly (elevated, since power
# settings need admin) so yt-dlp never goes stale again.
$maintSettings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5)
$maintPrincipal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType S4U -RunLevel Highest
$maintTrigger = New-ScheduledTaskTrigger -Daily -DaysInterval $IntervalDays -At $MaintTime
$scriptPath = $MyInvocation.MyCommand.Path
$maintAction = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`"" -WorkingDirectory $RepoPath

Register-ScheduledTask -TaskName "Cadence Maintenance" -Action $maintAction -Trigger $maintTrigger -Settings $maintSettings -Principal $maintPrincipal -Force | Out-Null
Log "  'Cadence Maintenance' registered (re-runs this script every $IntervalDays day(s) at $MaintTime)."

# --- 4) start backend + tunnel now, then sanity-check -----------------
& (Join-Path $RepoPath "restart-cadence.ps1") -NodeExe $nodeExe -Domain $Domain -Port $Port -LogFile $logFile

# --- 5) register the fast-polling auto-deploy Scheduled Task ---------
# Checks every 2 minutes for a new commit on origin/main and, if found,
# pulls + npm installs + restarts the backend/tunnel - so a `git push` is
# live on this machine within ~2 minutes without ever needing a manual
# admin restart again. See auto-deploy.ps1 for exactly what it does (and
# does NOT do - it stays deliberately lightweight).
Log "Registering Scheduled Task 'Cadence AutoDeploy'..."
$deploySettings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
$deployPrincipal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType S4U -RunLevel Highest
# [TimeSpan]::MaxValue serializes to a duration string ("P99999999DT23H59M59S") that
# Task Scheduler's XML schema rejects as out of range - 10 years is effectively
# "indefinitely" here and is well within the accepted range.
$deployTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date) `
  -RepetitionInterval (New-TimeSpan -Minutes 2) -RepetitionDuration (New-TimeSpan -Days 3650)
$deployScriptPath = Join-Path $RepoPath "auto-deploy.ps1"
$deployAction = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$deployScriptPath`" -RepoPath `"$RepoPath`" -Domain `"$Domain`" -Port $Port" `
  -WorkingDirectory $RepoPath

Register-ScheduledTask -TaskName "Cadence AutoDeploy" -Action $deployAction -Trigger $deployTrigger -Settings $deploySettings -Principal $deployPrincipal -Force | Out-Null
Log "  'Cadence AutoDeploy' registered (checks for a new push every 2 minutes)."

Log "Done."
Write-Host ""
Write-Host "Cadence is running and will auto-start on every boot." -ForegroundColor Green
Write-Host "A push to main goes live within ~2 minutes via 'Cadence AutoDeploy' - no more manual restarts." -ForegroundColor Green
Write-Host "yt-dlp will auto-refresh every $IntervalDays day(s) at $MaintTime via 'Cadence Maintenance'." -ForegroundColor Green
Write-Host "Log file: $logFile"
Write-Host ""
Write-Host "To stop everything:   Stop-ScheduledTask 'Cadence Backend','Cadence Tunnel','Cadence Maintenance','Cadence AutoDeploy'"
Write-Host "To remove everything: Get-ScheduledTask 'Cadence Backend','Cadence Tunnel','Cadence Maintenance','Cadence AutoDeploy' | Unregister-ScheduledTask -Confirm:`$false"
