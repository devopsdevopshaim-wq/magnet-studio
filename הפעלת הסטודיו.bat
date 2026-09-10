@echo off
chcp 65001 >nul
title חיים קריספין - מערכת הפעלה מתקדמת
cd /d "%~dp0"
start "חיים קריספין - שרת" /min cmd /c "node server.js"
timeout /t 2 /nobreak >nul
start "" http://localhost:4420/daily.html
