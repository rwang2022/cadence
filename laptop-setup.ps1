# =====================================================================
# Cadence — laptop "always-on host" setup (Windows)
# Run this ONCE, in PowerShell *as Administrator*, from the repo root:
#     powershell -ExecutionPolicy Bypass -File .\laptop-setup.ps1
#
# This is the only script you need to run — it replaces the old
# laptop-search-speedup.ps1, laptop-ytdlp-autoupdate.ps1, and
# run-cadence.cmd (all removed; this file does everything they did).
#
# What it does, every time it runs (this first run, and every
# re-run — see "stays fresh" below):
#   1) Stops the laptop from sleeping/hibernating; closing the lid does
#      nothing (screen still turns off to save power).
#   2) Makes sure yt-dlp is installed via a real Python (not the slow
#      winget standalone build) and upgrades it to the latest version —
#      this is what actually resolves + downloads playable audio, and
#      it's the thing YouTube breaks every few weeks. Sets YT_DLP_PATH
#      so the backend uses it.
#   3) Registers three auto-start Scheduled Tasks (creating them the
#      first time, updating them on every re-run) that all restart
#      themselves if they crash:
#        - "Cadence Backend" — node server.js
#        - "Cadence Tunnel"  — the ngrok tunnel
#        - "Cadence Maintenance" — re-runs THIS SAME SCRIPT weekly, so
#          yt-dlp stays updated and nothing here ever needs a human to
#          remember to run it again.
#   4) Starts the backend + tunnel now, and checks the tunnel is up.
#
# Stays fresh: because step 3 makes this script re-run itself weekly,
# you truly only run it by hand once. Every later run just repeats
# steps 1-4 (all idempotent/harmless to redo) with a fresh yt-dlp.
#
# Prereqs (install first): node, ngrok — both on PATH, with
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

# --- 1) power settings: never sleep; lid close = stay on -------------
Log "Configuring power (never sleep; lid close = stay on)..."
powercfg /change standby-timeout-ac 0
powercfg /change standby-timeout-dc 0
powercfg /change hibernate-timeout-ac 0
powercfg /change hibernate-timeout-dc 0
powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0   # 0 = Do nothing
powercfg /setdcvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0
powercfg /change monitor-timeout-ac 5   # screen CAN turn off — doesn't stop the app
powercfg /change monitor-timeout-dc 10
powercfg /setactive SCHEME_CURRENT
Log "  power settings done."

# --- 2) keep yt-dlp fresh: real Python + pip install --upgrade -------
try {
  Log "Pulling latest code..."
  git -C $RepoPath pull --ff-only 2>&1 | ForEach-Object { Add-Content -Path $logFile -Value $_ }
} catch {
  Log "git pull failed ($($_.Exception.Message)) — continuing with the code already on disk."
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
Log "Checking for a newer yt-dlp (current: $($before ?? 'not installed'))..."
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
Log "Restarting backend + tunnel now..."
Stop-ScheduledTask -TaskName "Cadence Backend" -ErrorAction SilentlyContinue
Stop-ScheduledTask -TaskName "Cadence Tunnel"  -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1
Start-ScheduledTask -TaskName "Cadence Backend"
Start-Sleep -Seconds 2
Start-ScheduledTask -TaskName "Cadence Tunnel"
Start-Sleep -Seconds 4

try {
  $h = Invoke-RestMethod "https://$Domain/health" -Headers @{ "ngrok-skip-browser-warning" = "1" } -TimeoutSec 15
  Log "  tunnel health: $($h | ConvertTo-Json -Compress)"
} catch {
  Log "  WARNING: couldn't reach https://$Domain/health yet. Give it a minute, or check the tasks in Task Scheduler."
}

Log "Done."
Write-Host ""
Write-Host "Cadence is running and will auto-start on every boot." -ForegroundColor Green
Write-Host "yt-dlp will auto-refresh every $IntervalDays day(s) at $MaintTime via 'Cadence Maintenance'." -ForegroundColor Green
Write-Host "Log file: $logFile"
Write-Host ""
Write-Host "To stop everything:   Stop-ScheduledTask 'Cadence Backend','Cadence Tunnel','Cadence Maintenance'"
Write-Host "To remove everything: Get-ScheduledTask 'Cadence Backend','Cadence Tunnel','Cadence Maintenance' | Unregister-ScheduledTask -Confirm:`$false"
