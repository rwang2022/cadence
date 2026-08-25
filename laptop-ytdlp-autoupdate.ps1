# =====================================================================
# Cadence — yt-dlp auto-update (run on the LAPTOP, the backend host)
#
#   powershell -ExecutionPolicy Bypass -File .\laptop-ytdlp-autoupdate.ps1
#
# Why: laptop-search-speedup.ps1 switched the backend to a pip-installed
# yt-dlp for faster search startup. Unlike the winget standalone build,
# pip's yt-dlp does NOT self-update — it only gets newer when someone runs
# `pip install --upgrade yt-dlp` again. When YouTube changes its player
# internals (which happens every few weeks), search keeps working (it
# only needs lightweight metadata) but /stream — actually resolving +
# downloading playable audio — starts returning HTTP 500. That's exactly
# what happened on 2026-08-23.
#
# This script is self-scheduling: run it ONCE and it registers a
# recurring Windows Scheduled Task that re-runs THIS SAME FILE on a
# schedule. Every run (first one included):
#   1) Registers the recurring task, if it isn't already registered
#      (safe/idempotent — later runs just skip this step).
#   2) Runs `pip install --upgrade yt-dlp`.
#   3) Restarts the 'Cadence Backend' task so it picks up the new binary.
#   4) Appends a timestamped line to logs\ytdlp-autoupdate.log so you can
#      see what happened without a visible console window (the backend
#      itself runs hidden as a background task and doesn't log anywhere).
#
# No admin needed (same as laptop-search-speedup.ps1 — user-scope task).
# =====================================================================

param(
  [string]$RepoPath    = $PSScriptRoot,
  [int]   $IntervalDays = 7,       # how often to check for a new yt-dlp
  [string]$Time         = "04:00"  # local time of day to run (24h, "HH:mm")
)

$ErrorActionPreference = "Stop"
$TaskName = "Cadence yt-dlp Auto-Update"

$logDir  = Join-Path $RepoPath "logs"
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$logFile = Join-Path $logDir "ytdlp-autoupdate.log"

function Log([string]$msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
  Write-Host $line
  Add-Content -Path $logFile -Value $line
}

# --- 1) register the recurring task, if it isn't already ------------
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $existing) {
  $scriptPath = $MyInvocation.MyCommand.Path
  Log "Registering recurring task '$TaskName' (every $IntervalDays day(s) at $Time)..."

  $trigger = New-ScheduledTaskTrigger -Daily -DaysInterval $IntervalDays -At $Time

  $settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
    -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5)

  $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType S4U -RunLevel Limited

  $action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`"" `
    -WorkingDirectory $RepoPath

  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
    -Settings $settings -Principal $principal -Force | Out-Null

  Log "  registered. It will also run right now to update immediately."
} else {
  Log "Task '$TaskName' already registered — skipping registration, just checking for an update."
}

# --- 2) find the pip-installed python (same lookup as the speed-up script) --
function Get-RealPython {
  Get-ChildItem "$env:LOCALAPPDATA\Programs\Python" -Filter python.exe -Recurse -ErrorAction SilentlyContinue |
    Select-Object -First 1 -ExpandProperty FullName
}

try {
  $py = Get-RealPython
  if (-not $py) {
    throw "No python.exe found under %LOCALAPPDATA%\Programs\Python. Run laptop-search-speedup.ps1 first to set up the pip yt-dlp."
  }

  $before = (& $py -m pip show yt-dlp 2>$null | Select-String "^Version:\s*(.+)$").Matches.Groups[1].Value

  # --- 3) upgrade yt-dlp -------------------------------------------
  Log "Checking for a newer yt-dlp (python: $py, current: $before)..."
  $pipOutput = & $py -m pip install --upgrade yt-dlp 2>&1 | Out-String
  Add-Content -Path $logFile -Value $pipOutput.TrimEnd()

  $after = (& $py -m pip show yt-dlp 2>$null | Select-String "^Version:\s*(.+)$").Matches.Groups[1].Value

  if ($pipOutput -match "Successfully installed") {
    Log "yt-dlp updated: $before -> $after"
  } else {
    Log "yt-dlp already up to date ($after) — nothing to do."
  }

  # --- 4) restart the backend so it's using the current binary -----
  Log "Restarting 'Cadence Backend' task..."
  Stop-ScheduledTask -TaskName "Cadence Backend" -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 1
  Start-ScheduledTask -TaskName "Cadence Backend" -ErrorAction Stop
  Log "  restarted."

} catch {
  Log "ERROR: $($_.Exception.Message)"
  Write-Warning $_.Exception.Message
}

Log "Done.`n"
Write-Host ""
Write-Host "Cadence will now auto-check for yt-dlp updates every $IntervalDays day(s) at $Time." -ForegroundColor Green
Write-Host "Log file: $logFile"
Write-Host "To change the schedule: Unregister-ScheduledTask '$TaskName' -Confirm:`$false, then re-run this script with different -IntervalDays / -Time."
Write-Host "To stop it: Unregister-ScheduledTask '$TaskName' -Confirm:`$false"
