@echo off
title Brisoft Shop - Backend & WhatsApp Server
echo ========================================================
echo   BRISOFT SHOP - INICIANDO SERVIDOR & WHATSAPP
echo ========================================================
echo.

set "PATH=%USERPROFILE%\git\cmd;%USERPROFILE%\nodejs;%PATH%"

cd /d "%~dp0client"
if not exist node_modules (
  echo Instalando dependencias da interface...
  call npm install
  if errorlevel 1 goto :error
)
echo Gerando a interface de producao...
call npm run build
if errorlevel 1 goto :error

cd /d "%~dp0server"
if not exist node_modules (
  echo Instalando dependencias do servidor...
  call npm install
  if errorlevel 1 goto :error
)

echo Iniciando servidor na porta 3000...
node src/server.js
pause
exit /b 0

:error
echo Falha ao preparar o Brisoft Shop. Verifique as mensagens acima.
pause
exit /b 1
