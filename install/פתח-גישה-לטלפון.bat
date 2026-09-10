@echo off
chcp 65001 >nul
title פתיחת גישה לטלפון - הפנקס היומי
echo.
echo   פותח את הפנקס היומי לגישה מהטלפון.
echo   מיד יופיע חלון אישור (UAC) - לחצו "כן" / "Yes".
echo.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','%~dp0allow-firewall.ps1'"
timeout /t 3 >nul
