@echo off
:: WhatIfImpossible Editor - start or restart server

set PORT=3030
set PIDFILE=%~dp0.server.pid
set LOGFILE=%~dp0server.log
set REBOOTLOG=%~dp0reboot.log

echo. >> "%REBOOTLOG%"
echo ===== %DATE% %TIME% ===== >> "%REBOOTLOG%"
echo [reboot] start >> "%REBOOTLOG%"

:: Stop process from PID file
if exist "%PIDFILE%" (
  set /p OLD_PID=<"%PIDFILE%"
  echo [reboot] found PID file: %OLD_PID% >> "%REBOOTLOG%"
  tasklist /FI "PID eq %OLD_PID%" /NH 2>nul | find "%OLD_PID%" >nul
  if not errorlevel 1 (
    echo [reboot] stopping PID %OLD_PID%...
    echo [reboot] stopping PID %OLD_PID% >> "%REBOOTLOG%"
    taskkill /PID %OLD_PID% /F >nul 2>&1
  )
  del "%PIDFILE%"
)

:: Kill any process using the port
for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr ":%PORT% " ^| findstr "LISTENING"') do (
  echo [reboot] killing PID %%P on port %PORT%...
  echo [reboot] killing port PID %%P >> "%REBOOTLOG%"
  taskkill /PID %%P /F >nul 2>&1
)
timeout /t 1 /nobreak >nul

:: Start server
echo [reboot] starting server...
echo [reboot] starting node server.js >> "%REBOOTLOG%"
cd /d "%~dp0"
echo [server start %DATE% %TIME%] >> "%LOGFILE%"
start /B node server.js >> "%LOGFILE%" 2>&1

:: Wait for port (up to 5 tries)
set TRIES=0
:WAIT_PID
timeout /t 1 /nobreak >nul
set /a TRIES+=1
echo [reboot] checking port, try %TRIES% >> "%REBOOTLOG%"
for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr ":%PORT% " ^| findstr "LISTENING"') do (
  echo %%P> "%PIDFILE%"
  echo [reboot] ready - PID %%P - http://localhost:%PORT%
  echo [reboot] ready PID=%%P >> "%REBOOTLOG%"
  goto :OPEN
)
if %TRIES% lss 5 goto :WAIT_PID
echo [reboot] TIMEOUT: server did not start
echo [reboot] TIMEOUT >> "%REBOOTLOG%"
echo.
echo --- server.log ---
type "%LOGFILE%" 2>nul || echo (no server.log)
goto :DONE

:OPEN
start http://localhost:%PORT%

:DONE
echo.
echo log: %REBOOTLOG%
echo.
pause
