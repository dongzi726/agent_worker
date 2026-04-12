@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0restart-service.ps1" %*
set EXIT_CODE=%ERRORLEVEL%
echo.
echo restart-service.ps1 exited with code %EXIT_CODE%
if not "%EXIT_CODE%"=="0" pause
exit /b %EXIT_CODE%

