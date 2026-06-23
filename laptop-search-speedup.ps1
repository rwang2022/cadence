# =====================================================================
# Cadence — search speed-up (run on the LAPTOP, the backend host)
#
#   powershell -ExecutionPolicy Bypass -File .\laptop-search-speedup.ps1
#
# Why: the standalone winget yt-dlp.exe is a PyInstaller one-file build that
# unpacks itself to a temp dir on EVERY run — ~1.7s of pure startup before the
# YouTube query even begins, and search spawns it fresh each time. Installing
# yt-dlp under a real Python starts in ~0.3s instead, roughly halving search
# latency for every search.
#
# No admin needed (everything is user-scope). It will:
#   1) git pull (so the backend also gets the search-results cache)
#   2) install Python if it's missing, then pip-install yt-dlp
#   3) set YT_DLP_PATH (user) so the backend uses the fast binary
#   4) restart the 'Cadence Backend' task so changes take effect
# =====================================================================

$ErrorActionPreference = "Stop"
$repo = $PSScriptRoot

# --- 0) pull latest code (cache + this script) -----------------------
try {
  Write-Host "Pulling latest code..."
  git -C $repo pull --ff-only
} catch {
  Write-Warning "git pull failed ($($_.Exception.Message)). Continuing with the code already on disk."
}

# --- 1) ensure a REAL Python (not the Microsoft Store stub) ----------
function Get-RealPython {
  Get-ChildItem "$env:LOCALAPPDATA\Programs\Python" -Filter python.exe -Recurse -ErrorAction SilentlyContinue |
    Select-Object -First 1 -ExpandProperty FullName
}
$py = Get-RealPython
if (-not $py) {
  Write-Host "Installing Python 3.12 (user scope, no admin)..."
  winget install --id Python.Python.3.12 -e --silent `
    --accept-package-agreements --accept-source-agreements --scope user
  $py = Get-RealPython
}
if (-not $py) { Write-Error "No python.exe found under %LOCALAPPDATA%\Programs\Python after install."; exit 1 }
Write-Host "python: $py"

# --- 2) pip install yt-dlp ------------------------------------------
Write-Host "Installing yt-dlp via pip..."
& $py -m pip install --upgrade --quiet pip
& $py -m pip install --upgrade --quiet yt-dlp

$ytdlp = Join-Path (Split-Path $py) "Scripts\yt-dlp.exe"
if (-not (Test-Path $ytdlp)) { Write-Error "pip yt-dlp not found at $ytdlp"; exit 1 }
Write-Host "yt-dlp: $ytdlp"

# --- 3) point the backend at the fast binary ------------------------
# server.js reads process.env.YT_DLP_PATH; the auto-start task inherits the
# user environment, so a user-scope var is enough.
[Environment]::SetEnvironmentVariable("YT_DLP_PATH", $ytdlp, "User")
$env:YT_DLP_PATH = $ytdlp
Write-Host "Set YT_DLP_PATH (user) -> $ytdlp"

# --- 4) show the win ------------------------------------------------
$secs = (Measure-Command { & $ytdlp --version *> $null }).TotalSeconds
Write-Host ("pip yt-dlp startup: {0:N2}s  (standalone was ~1.7s)" -f $secs) -ForegroundColor Green

# --- 5) restart the backend so it picks up the new code + binary ----
try {
  Stop-ScheduledTask  -TaskName "Cadence Backend" -ErrorAction SilentlyContinue
  Start-ScheduledTask -TaskName "Cadence Backend" -ErrorAction Stop
  Write-Host "Restarted 'Cadence Backend'." -ForegroundColor Green
} catch {
  Write-Warning "Couldn't restart 'Cadence Backend' automatically. Restart it in Task Scheduler, or reboot the laptop (it'll auto-start and pick up YT_DLP_PATH)."
}

Write-Host ""
Write-Host "Done. New searches should be noticeably faster; repeats are instant (cached)." -ForegroundColor Green
