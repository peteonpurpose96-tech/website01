@echo off
chcp 65001 >nul
echo ====================================================
echo  🚀 COUPONHIKER AUTO BATCH IMPORTER
echo ====================================================
set "NODE_EXE=C:\Users\admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%NODE_EXE%" (
    set "NODE_EXE=node"
)

if "%~1"=="" (
    echo Vui long truyen link Google Sheet hoac file danh sach link!
    echo Vi du: batch-import.bat "https://docs.google.com/spreadsheets/d/.../edit"
    pause
    exit /b
)

"%NODE_EXE%" "%~dp0batch-import.js" "%~1"
pause
