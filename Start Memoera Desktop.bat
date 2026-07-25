@echo off
title Memoera Desktop
echo.
echo  ==========================================
echo   Memoera - Starting Desktop App
echo  ==========================================
echo.

where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo  ERROR: Node.js is not installed.
  echo  Download it from https://nodejs.org and try again.
  echo.
  pause
  exit /b 1
)

echo  Starting server... browser will open automatically.
echo  Press Ctrl+C to stop.
echo.

node "%~dp0memoera-desktop-server.js"
pause
