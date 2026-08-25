# =====================================================================
# Cadence - auto-deploy. Registered as "Cadence AutoDeploy" by
# run-background.ps1, this runs every ~2 minutes so a `git push` to main
# gets picked up on this machine without ever needing a manual restart.
#
# Cheap when there's nothing new: one `git fetch` + a HEAD comparison, then
# exit. Only pulls + reinstalls + restarts when origin/main actually moved.
#
# Deliberately does NOT touch power settings, upgrade yt-dlp, or re-register
# the Scheduled Tasks themselves - that stays on "Cadence Maintenance"'s
# weekly schedule via run-background.ps1, so this fast-polling task stays
# lightweight. (A push that changes run-background.ps1's own task
# definitions - trigger times, task names, etc. - still needs a manual
# admin run, or waits for the weekly Maintenance run.)
# =====================================================================
param(
  [string]$RepoPath = $PSScriptRoot,
  [string]$Domain   = "say-sixfold-scrap.ngrok-free.dev",
  [int]   $Port     = 3999
)

$ErrorActionPreference = "Stop"

$logDir  = Join-Path $RepoPath "logs"
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$logFile = Join-Path $logDir "auto-deploy.log"
function Log([string]$msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
  Add-Content -Path $logFile -Value $line
}

try {
  git -C $RepoPath fetch origin main --quiet 2>&1 | Out-Null
} catch {
  Log "git fetch failed ($($_.Exception.Message)) - skipping this check."
  exit 0
}

$localHead  = (git -C $RepoPath rev-parse HEAD 2>$null).Trim()
$remoteHead = (git -C $RepoPath rev-parse origin/main 2>$null).Trim()
if (-not $remoteHead -or $localHead -eq $remoteHead) { exit 0 }  # nothing new - stay quiet

Log "New commit detected ($localHead -> $remoteHead) - deploying..."
git -C $RepoPath pull --ff-only 2>&1 | ForEach-Object { Add-Content -Path $logFile -Value $_ }

# We know code just changed, so always reinstall (cheap/no-op when the
# backend's package.json/lockfile didn't actually change).
$backendDir = Join-Path $RepoPath "backend"
Log "Running npm install in backend\..."
Push-Location $backendDir
try {
  $npmOutput = & npm install 2>&1 | Out-String
  Add-Content -Path $logFile -Value $npmOutput.TrimEnd()
} finally {
  Pop-Location
}

$nodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source
& (Join-Path $RepoPath "restart-cadence.ps1") -NodeExe $nodeExe -Domain $Domain -Port $Port -LogFile $logFile
Log "Deploy done."
