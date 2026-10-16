@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Ночной Работяга [Coder 32B Overnight] — Twitch Drops Sentinel v3

echo ===================================================================
echo   Ночной Работяга: Coder 32B (Qwen 2.5 Coder 32B @ Ollama via Hermes)
echo   Проект: Twitch Drops Sentinel v3.0 [Mortuis_V_Studio]
echo   ТЗ загружено из: NIGHT_WORKER_TASK.md
echo ===================================================================

hermes -p coder32
