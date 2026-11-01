@echo off
cd /d "%~dp0"
echo Starting ReleaseGuard with demo data (press Ctrl+C or close this window to stop)...
call npm run start:demo
pause
