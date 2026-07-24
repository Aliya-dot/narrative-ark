@echo off
setlocal
title Narrative Ark Launcher

pushd "%~dp0"
if errorlevel 1 (
  echo Failed to open the project directory:
  echo %~dp0
  pause
  exit /b 1
)

if not exist "package.json" (
  echo package.json was not found in:
  echo %CD%
  echo Keep this launcher in the project root directory.
  pause
  popd
  exit /b 1
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js first.
  pause
  popd
  exit /b 1
)

if not exist "node_modules\.bin\next.cmd" (
  echo Project dependencies are not installed.
  echo Run npm.cmd install in this directory first.
  pause
  popd
  exit /b 1
)

echo Starting Narrative Ark on http://localhost:3001
start "" "http://localhost:3001"

call npm.cmd run dev -- --port 3001
set "launcher_exit=%errorlevel%"

if not "%launcher_exit%"=="0" (
  echo.
  echo Narrative Ark failed to start. Exit code: %launcher_exit%
  pause
)

popd
endlocal
exit /b %launcher_exit%
