@echo off
chcp 65001 >nul
title Twitch Drops Sentinel
cd /d "%~dp0"

echo ========================================================
echo   Twitch Drops Sentinel
echo   Mortuis_V_Studio
echo ========================================================
echo Запуск автономного комплекса...

start "" "%~dp0TwitchDropsSentinel.exe"
exit
