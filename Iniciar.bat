@echo off
title FinanzApp - Servidor
cd /d "%~dp0"

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js no esta instalado.
    echo Descargalo de https://nodejs.org/
    pause
    exit /b 1
)

if not exist node_modules (
    echo Instalando dependencias...
    call npm install
)

echo.
echo ============================================
echo  FinanzApp - Finanzas Personales
echo  Abre en tu navegador: http://localhost:3000
echo  Presiona CTRL+C para detener el servidor.
echo ============================================
echo.

start "" http://localhost:3000
call npm start

pause