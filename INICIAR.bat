@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instale o Node.js e tente novamente.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Instalando dependencias pela primeira vez...
  call npm install || (pause & exit /b 1)
)
if not exist frontend\.next\BUILD_ID (
  echo Preparando o painel...
  call npm run build || (pause & exit /b 1)
)
start "" cmd /c "timeout /t 4 >nul & start http://localhost:3000"
call npm start
pause
