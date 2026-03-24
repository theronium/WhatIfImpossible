@echo off
:: WhatIfImpossible Editor - stop server

set PORT=3030
set PIDFILE=%~dp0.server.pid

:: Stop process from PID file
if exist "%PIDFILE%" (
  set /p OLD_PID=<"%PIDFILE%"
  echo [stop] found PID file: %OLD_PID%
  tasklist /FI "PID eq %OLD_PID%" /NH 2>nul | find "%OLD_PID%" >nul
  if not errorlevel 1 (
    echo [stop] stopping PID %OLD_PID%...
    taskkill /PID %OLD_PID% /F >nul 2>&1
    echo [stop] done.
  ) else (
    echo [stop] PID %OLD_PID% not running.
  )
  del "%PIDFILE%"
) else (
  echo [stop] no PID file found.
)

:: Kill any remaining process on the port
for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr ":%PORT% " ^| findstr "LISTENING"') do (
  echo [stop] killing remaining PID %%P on port %PORT%...
  taskkill /PID %%P /F >nul 2>&1
)

echo [stop] server stopped.
echo.
pause
