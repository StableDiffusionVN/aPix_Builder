@echo off
setlocal
title aPix Builder

cd /d "%~dp0"
if errorlevel 1 (
  echo [ERROR] Cannot open the aPix Builder folder.
  goto :failed
)

where node.exe >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js was not found.
  echo Install the current Node.js LTS from https://nodejs.org/ then restart Windows.
  goto :failed
)

where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm was not found. Reinstall Node.js LTS and enable "Add to PATH".
  goto :failed
)

node scripts\check-git-update.mjs
if errorlevel 1 (
  echo.
  echo [WARNING] Update was not completed. Starting the installed version.
  echo.
)

call npm.cmd run start:app
if errorlevel 1 goto :failed

endlocal
exit /b 0

:failed
echo.
echo aPix Builder could not start. Review the error above.
pause
endlocal
exit /b 1
