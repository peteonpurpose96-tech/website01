@echo off
title TechPicks Review - Tech & Smart Gadgets Localhost Server
echo ========================================================
echo   Dang khoi dong TECHPICKS REVIEW (Tech & Smart Gadgets)...
echo   Website Chinh:  http://localhost:3002
echo   Admin Studio:   http://localhost:3003
echo ========================================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1" -Port 3002 -AdminPort 3003
pause
