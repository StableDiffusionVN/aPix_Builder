@echo off
setlocal EnableExtensions EnableDelayedExpansion
title Update aPix Builder

if /i not "%~1"=="--worker" (
  set "UPDATE_COPY=%TEMP%\aPix-Builder-update-!RANDOM!-!RANDOM!.bat"
  copy /y "%~f0" "!UPDATE_COPY!" >nul
  if errorlevel 1 (
    echo [ERROR] Could not create the temporary updater.
    goto :failed
  )
  call "!UPDATE_COPY!" --worker "%~dp0"
  set "UPDATE_EXIT=!ERRORLEVEL!"
  del /q "!UPDATE_COPY!" >nul 2>&1
  exit /b !UPDATE_EXIT!
)

set "APP_DIR=%~2"
cd /d "!APP_DIR!"
if errorlevel 1 (
  echo [ERROR] Cannot open the aPix Builder folder.
  goto :failed
)

where git.exe >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Git was not found.
  echo Install Git for Windows from https://git-scm.com/download/win
  goto :failed
)

if not exist ".git" (
  echo [ERROR] This folder is not a Git repository.
  echo Download or clone aPix Builder with Git before using this updater.
  goto :failed
)

for /f "delims=" %%B in ('git branch --show-current 2^>nul') do set "BRANCH=%%B"
if not defined BRANCH (
  echo [ERROR] Cannot update while Git is in detached HEAD mode.
  goto :failed
)

git remote get-url origin >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Git remote "origin" is not configured.
  goto :failed
)

echo Updating aPix Builder on branch "!BRANCH!"...
echo.

set "STASHED=0"
for /f "delims=" %%S in ('git status --porcelain --untracked-files^=all') do set "HAS_CHANGES=1"
if defined HAS_CHANGES (
  echo Saving local changes temporarily...
  git stash push --include-untracked --message "aPix Builder automatic update"
  if errorlevel 1 (
    echo [ERROR] Could not save local changes.
    goto :failed
  )
  set "STASHED=1"
)

git fetch --prune origin
if errorlevel 1 (
  echo [ERROR] Could not connect to the Git repository.
  goto :restore_and_fail
)

git show-ref --verify --quiet "refs/remotes/origin/!BRANCH!"
if errorlevel 1 (
  echo [ERROR] Branch "origin/!BRANCH!" does not exist.
  goto :restore_and_fail
)

set "OLD_COMMIT="
for /f "delims=" %%C in ('git rev-parse HEAD') do set "OLD_COMMIT=%%C"

git merge --ff-only "origin/!BRANCH!"
if errorlevel 1 (
  echo [ERROR] The local branch cannot be updated with fast-forward.
  echo No commit was overwritten.
  goto :restore_and_fail
)

set "NEW_COMMIT="
for /f "delims=" %%C in ('git rev-parse HEAD') do set "NEW_COMMIT=%%C"

if not "!OLD_COMMIT!"=="!NEW_COMMIT!" (
  git diff --name-only "!OLD_COMMIT!" "!NEW_COMMIT!" | findstr /x /c:"package.json" /c:"package-lock.json" >nul
  if not errorlevel 1 (
    where npm.cmd >nul 2>&1
    if errorlevel 1 (
      echo [WARNING] Dependencies changed, but npm was not found.
      echo Install Node.js LTS before starting the app.
    ) else (
      echo.
      echo Updating dependencies...
      call npm.cmd install
      if errorlevel 1 (
        echo [ERROR] Git was updated, but npm install failed.
        git reset --hard "!OLD_COMMIT!"
        goto :restore_and_fail
      )
    )
  )
)

if "!STASHED!"=="1" (
  echo.
  echo Restoring local changes...
  git stash pop
  if errorlevel 1 (
    echo [ERROR] Git was updated, but local changes could not be restored automatically.
    echo Resolve the conflicts shown above. Your changes remain available in Git stash.
    goto :failed
  )
)

echo.
if "!OLD_COMMIT!"=="!NEW_COMMIT!" (
  echo aPix Builder is already up to date.
) else (
  echo aPix Builder was updated successfully.
)
echo You can now run Start-windows.bat.
echo.
pause
endlocal
exit /b 0

:restore_and_fail
if "!STASHED!"=="1" (
  echo.
  echo Restoring local changes...
  git stash pop
  if errorlevel 1 (
    echo [WARNING] Local changes remain available in Git stash.
  )
)

:failed
echo.
echo Update was not completed. Review the error above.
pause
endlocal
exit /b 1
