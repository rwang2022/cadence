# =====================================================================
# Cadence - stop any orphaned backend/tunnel process, then (re)start the
# "Cadence Backend" + "Cadence Tunnel" Scheduled Tasks and check the tunnel
# comes up. Assumes those tasks are already registered (run-background.ps1
# does that on first run).
#
# Shared by run-background.ps1's own restart step and by auto-deploy.ps1
# after pulling new code, so there's one restart implementation instead of
# two copies that can drift apart.
# =====================================================================
param(
  [string]$NodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source,
  [string]$Domain  = "say-sixfold-scrap.ngrok-free.dev",
  [int]   $Port    = 3999,
  [string]$LogFile = $null   # optional - also appends here if given, in addition to stdout
)

function Log([string]$msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
  Write-Host $line
  if ($LogFile) { Add-Content -Path $LogFile -Value $line }
}

if (-not $NodeExe) { Write-Error "node not found on PATH."; exit 1 }

Log "Restarting backend + tunnel now..."
Stop-ScheduledTask -TaskName "Cadence Backend" -ErrorAction SilentlyContinue
Stop-ScheduledTask -TaskName "Cadence Tunnel"  -ErrorAction SilentlyContinue

# Stop-ScheduledTask only signals the task; it doesn't reliably kill node/ngrok
# processes left behind by a crash or a manual run outside the task, which then
# hold the port/tunnel open and make the freshly-started task fail silently.
# Find and kill any such leftovers by command line before restarting.
function Stop-OrphanedProcess([string]$ProcessName, [string]$Pattern, [int]$TimeoutSec = 10) {
  $procs = Get-CimInstance Win32_Process -Filter "Name = '$ProcessName'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine -match $Pattern }
  foreach ($p in $procs) {
    Log "  Stopping orphaned $ProcessName (PID $($p.ProcessId)): $($p.CommandLine)"
    Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
  }
  if ($procs) {
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline -and ($procs | Where-Object { Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue })) {
      Start-Sleep -Milliseconds 500
    }
  }
}
# Scope the match to *this* node.exe running *this* server.js, not just any
# process anywhere whose command line happens to contain "server.js".
Stop-OrphanedProcess -ProcessName "node.exe"  -Pattern ([regex]::Escape($NodeExe) + '.*server\.js')
Stop-OrphanedProcess -ProcessName "ngrok.exe" -Pattern ([regex]::Escape($Domain))

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
