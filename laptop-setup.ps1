# =====================================================================
# Cadence — laptop "always-on host" setup (Windows)
# Run this in PowerShell *as Administrator* from the repo root:
#     powershell -ExecutionPolicy Bypass -File .\laptop-setup.ps1
#
# It will:
#   1) Stop the laptop from sleeping / hibernating, and make closing the
#      lid do nothing (screen still turns off to save power).
#   2) Register two auto-start tasks (backend + ngrok tunnel) that run at
#      boot WITHOUT needing you to log in, and restart themselves if they crash.
#   3) Start them immediately.
#
# Prereqs (install first — see the instructions Claude gave you):
#   node, yt-dlp, ffmpeg, ngrok  (all on PATH)
#   ngrok authtoken already configured: ngrok config add-authtoken <token>
# =====================================================================

param(
  [string]$RepoPath = $PSScriptRoot,
  [string]$Domain   = "say-sixfold-scrap.ngrok-free.dev",
  [int]   $Port     = 3999
)

$ErrorActionPreference = "Stop"

# --- must be admin ---------------------------------------------------
$admin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
         ).IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)
if (-not $admin) { Write-Error "Please run this in an *Administrator* PowerShell window."; exit 1 }

# --- resolve tools ---------------------------------------------------
$nodeExe  = (Get-Command node  -ErrorAction SilentlyContinue).Source
$ngrokExe = (Get-Command ngrok -ErrorAction SilentlyContinue).Source
if (-not $nodeExe)  { Write-Error "node not found on PATH. Install Node.js first." ; exit 1 }
if (-not $ngrokExe) { Write-Error "ngrok not found on PATH. Install ngrok first." ; exit 1 }
$backendDir = Join-Path $RepoPath "backend"
if (-not (Test-Path (Join-Path $backendDir "server.js"))) { Write-Error "Can't find backend\server.js under $RepoPath"; exit 1 }

Write-Host "node : $nodeExe"
Write-Host "ngrok: $ngrokExe"
Write-Host "repo : $RepoPath"
Write-Host ""

# --- 1) power settings ----------------------------------------------
Write-Host "Configuring power (never sleep; lid close = stay on)..."
powercfg /change standby-timeout-ac 0
powercfg /change standby-timeout-dc 0
powercfg /change hibernate-timeout-ac 0
powercfg /change hibernate-timeout-dc 0
# Lid close action: 0 = Do nothing (AC and battery)
powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0
powercfg /setdcvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0
# Let the screen turn off to save power (does NOT stop the app)
powercfg /change monitor-timeout-ac 5
powercfg /change monitor-timeout-dc 10
powercfg /setactive SCHEME_CURRENT
Write-Host "  done.`n"

# --- 2) scheduled tasks ---------------------------------------------
Write-Host "Registering auto-start tasks..."
$trigger = New-ScheduledTaskTrigger -AtStartup
$trigger.Delay = "PT30S"   # wait 30s after boot so the network is up

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero)

$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType S4U -RunLevel Limited

$backendAction = New-ScheduledTaskAction -Execute "cmd.exe" `
  -Argument "/c set PORT=$Port&& `"$nodeExe`" server.js" -WorkingDirectory $backendDir

$tunnelAction = New-ScheduledTaskAction -Execute $ngrokExe `
  -Argument "http --url=https://$Domain $Port"

Register-ScheduledTask -TaskName "Cadence Backend" -Action $backendAction -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Register-ScheduledTask -TaskName "Cadence Tunnel"  -Action $tunnelAction  -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Write-Host "  registered 'Cadence Backend' and 'Cadence Tunnel'.`n"

# --- 3) start now ----------------------------------------------------
Write-Host "Starting now..."
Start-ScheduledTask -TaskName "Cadence Backend"
Start-Sleep -Seconds 2
Start-ScheduledTask -TaskName "Cadence Tunnel"
Start-Sleep -Seconds 4

try {
  $h = Invoke-RestMethod "https://$Domain/health" -Headers @{ "ngrok-skip-browser-warning" = "1" } -TimeoutSec 15
  Write-Host "  tunnel health: $($h | ConvertTo-Json -Compress)" -ForegroundColor Green
} catch {
  Write-Warning "  Couldn't reach https://$Domain/health yet. Give it a minute, or check the tasks in Task Scheduler."
}

Write-Host ""
Write-Host "Done. Cadence will now start automatically on every boot." -ForegroundColor Green
Write-Host "To stop it:   Stop-ScheduledTask 'Cadence Backend'; Stop-ScheduledTask 'Cadence Tunnel'"
Write-Host "To remove it: Unregister-ScheduledTask 'Cadence Backend' -Confirm:`$false; Unregister-ScheduledTask 'Cadence Tunnel' -Confirm:`$false"
