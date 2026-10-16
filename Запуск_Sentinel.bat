@echo off
chcp 65001 >nul
title Twitch Drops Sentinel

echo =====================================================================
echo                     Twitch Drops Sentinel
echo                   Mortuis_V_Studio - Production
echo =====================================================================
echo.

:: 1. Проверка наличия Python в системе
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [!] ОШИБКА: Python не найден в системе!
    echo.
    echo Пожалуйста, установите Python 3.10 или новее с официального сайта:
    echo https://www.python.org/downloads/
    echo.
    echo ВАЖНО: При установке обязательно поставьте галочку:
    echo "[x] Add Python to PATH" (Добавить Python в переменные среды)
    echo.
    pause
    exit /b 1
)

:: 2. Проверка и автоматическая установка библиотек
echo [*] Проверка необходимых библиотек Python...
python -c "import aiohttp, psutil, truststore" >nul 2>nul
if %errorlevel% neq 0 (
    echo [*] Устанавливаем необходимые зависимости (aiohttp, psutil, truststore)...
    python -m pip install --upgrade pip >nul 2>nul
    python -m pip install -r requirements.txt
    if %errorlevel% neq 0 (
        echo [!] Не удалось установить зависимости. Проверьте интернет-соединение.
        pause
        exit /b 1
    )
    echo [OK] Все библиотеки успешно установлены!
    echo.
) else (
    echo [OK] Все зависимости уже установлены.
    echo.
)

:: 3. Запуск Twitch Drops Sentinel
echo [*] Запуск Twitch Drops Sentinel v3...
start "" "%~dp0TwitchDropsSentinel.exe"

exit /b 0
