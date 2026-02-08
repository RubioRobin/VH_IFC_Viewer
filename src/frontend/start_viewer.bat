@echo off
cd /d "%~dp0"
echo Starting Webviewer...
if not exist node_modules (
    echo Installing dependencies...
    call npm install
)
npm run dev
pause
