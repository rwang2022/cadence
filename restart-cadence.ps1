# =====================================================================
# Cadence - stop any orphaned backend/tunnel process, then (re)start the
# "Cadence Backend" + "Cadence Tunnel" Scheduled Tasks and check the tunnel
# comes up. Assumes those tasks are already registered (run-background.ps1
# does that on first run).
#
# Tunnel is a named Cloudflare Tunnel (cloudflared), not ngrok - ngrok's free
# plan bandwidth cap (a few hundred MB/month) gets exhausted fast once video
# downloads are in the mix; Cloudflare Tunnel is free with no such cap, at
# the cost of needing a domain (rwang.dev, already on Cloudflare DNS) for a
# stable hostname instead of ngrok's random-but-free subdomain.
#
# Shared by run-background.ps1's own restart step and by auto-deploy.ps1
# after pulling new code, so there's one restart implementation instead of
# two copies that can drift apart.
# =====================================================================
param(
  [string]$NodeExe        = (Get-Command node -ErrorAction SilentlyContinue).Source,
  [string]$CloudflaredExe = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source,
  [string]$Domain         = "cadence.rwang.dev",
  [string]$TunnelName     = "cadence",
  [int]   $Port           = 3999,
  [string]$LogFile        = $null   # optional - also appends here if given, in addition to stdout
)

function Log([string]$msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
  Write-Host $line
  if ($LogFile) { Add-Content -Path $LogFile -Value $line }
}

if (-not $NodeExe) { Write-Error "node not found on PATH."; exit 1 }
if (-not $CloudflaredExe) {
  $fallback = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
  if (Test-Path $fallback) { $CloudflaredExe = $fallback }
}
if (-not $CloudflaredExe -or -not (Test-Path $CloudflaredExe)) { Write-Error "cloudflared not found on PATH or at the default winget install path."; exit 1 }

Log "Restarting backend + tunnel now..."
Stop-ScheduledTask -TaskName "Cadence Backend" -ErrorAction SilentlyContinue
Stop-ScheduledTask -TaskName "Cadence Tunnel"  -ErrorAction SilentlyContinue

# Stop-ScheduledTask only signals the task; it doesn't reliably kill node/
# cloudflared processes left behind by a crash or a manual run outside the
# task, which then hold the port/tunnel open and make the freshly-started
# task fail silently.
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
# Scope the match to *this* node.exe running *this* server.js as its own
# argument - not just any process whose command line happens to CONTAIN the
# substring "server.js" anywhere, which previously also matched (and killed)
# an unrelated project's "start-server.js" dev server on the same machine.
# The (?<=[\s"]) / (?=\s|$) boundaries require "server.js" to be a standalone
# token, not part of a longer filename like "start-server.js".
Stop-OrphanedProcess -ProcessName "node.exe" -Pattern (
  [regex]::Escape($NodeExe) + '.*(?<=[\s"])server\.js(?=\s|$)'
)
Stop-OrphanedProcess -ProcessName "cloudflared.exe" -Pattern ([regex]::Escape($TunnelName))

Start-Sleep -Seconds 1
Start-ScheduledTask -TaskName "Cadence Backend"
Start-Sleep -Seconds 2
Start-ScheduledTask -TaskName "Cadence Tunnel"
Start-Sleep -Seconds 4

try {
  $h = Invoke-RestMethod "https://$Domain/health" -TimeoutSec 15
  Log "  tunnel health: $($h | ConvertTo-Json -Compress)"
} catch {
  Log "  WARNING: couldn't reach https://$Domain/health yet. Give it a minute, or check the tasks in Task Scheduler."
}
