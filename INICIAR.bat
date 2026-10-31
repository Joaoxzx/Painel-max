@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instale o Node.js ^(versao LTS^) em https://nodejs.org e tente novamente.
  pause
  exit /b 1
)
rem O banco de dados usa o SQLite que vem no Node 22 ou mais novo.
node -e "require('node:sqlite')" >nul 2>nul
if errorlevel 1 (
  echo Seu Node.js esta desatualizado. Instale a versao LTS mais recente em https://nodejs.org e tente novamente.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Instalando dependencias pela primeira vez. Isso pode levar alguns minutos...
  call npm install || (pause & exit /b 1)
)
rem Prepara o painel sempre, para que uma versao nova do codigo ja entre em uso.
echo Preparando o painel...
call npm run build || (pause & exit /b 1)
start "" cmd /c "timeout /t 4 >nul & start http://localhost:3000"
call npm start
pause
