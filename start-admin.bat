@echo off
title TechPicks Creator CMS Studio
echo ========================================================
echo   Dang khoi dong TECHPICKS CREATOR CMS STUDIO...
echo   Admin Site:     http://localhost:3003
echo   Website Chinh:  http://localhost:3002
echo ========================================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1" -Port 3002 -AdminPort 3003
pause
