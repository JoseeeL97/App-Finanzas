@echo off
title FinanzApp - Detener servidor
echo Deteniendo el servidor de FinanzApp...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
    taskkill /PID %%a /F >nul 2>&1
    echo Servidor detenido.
)
pause