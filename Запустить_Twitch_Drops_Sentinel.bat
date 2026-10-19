@echo off
chcp 65001 >nul
title Twitch Drops Sentinel
cd /d "%~dp0"

echo ========================================================
echo   Twitch Drops Sentinel
echo   Mortuis_V_Studio
echo ========================================================
echo Разблокировка файлов после распаковки (SmartScreen fix)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Unblock-File -Path '%~dp0TwitchDropsSentinel.exe' -ErrorAction SilentlyContinue; Get-ChildItem -Path '%~dp0' -Recurse -Filter '*.dll' -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue" >nul 2>&1
echo Запуск автономного комплекса...

start "" "%~dp0TwitchDropsSentinel.exe"
exit
