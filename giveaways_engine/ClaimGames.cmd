@echo off
rem Twitch Drops Sentinel Giveaways Subsystem Proxy
setlocal
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"
node "%SCRIPT_DIR%runner.js" %*
exit /b %ERRORLEVEL%
