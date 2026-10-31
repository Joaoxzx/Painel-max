@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instale o Node.js e tente novamente.
  pause
  exit /b 1
)
start "" http://localhost:3000
node server.js
pause
