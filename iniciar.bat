@echo off
chcp 65001 >nul
title Just Another VTT
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  No se encontro Node.js.
  echo  Instala la version LTS ^(22 o superior^) desde https://nodejs.org y vuelve a abrir este archivo.
  echo.
  pause
  exit /b 1
)
start "" cmd /c "timeout /t 2 >nul & start http://localhost:3000"
node server.js
pause
