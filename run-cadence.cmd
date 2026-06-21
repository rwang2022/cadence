@echo off
REM Starts the Cadence backend + ngrok tunnel in two windows.
REM Requires: node, yt-dlp, ffmpeg, ngrok all installed and on PATH.
REM ngrok authtoken must already be configured (ngrok config add-authtoken ...).

set PORT=3999
set NGROK_DOMAIN=say-sixfold-scrap.ngrok-free.dev

start "Cadence backend" cmd /k "cd /d %~dp0backend && set PORT=%PORT% && node server.js"
timeout /t 2 >nul
start "Cadence tunnel" cmd /k "ngrok http --url=https://%NGROK_DOMAIN% %PORT%"

echo.
echo Cadence is starting:
echo   backend  -> http://localhost:%PORT%
echo   tunnel   -> https://%NGROK_DOMAIN%
echo.
echo Leave both windows open. Close them to stop Cadence.
