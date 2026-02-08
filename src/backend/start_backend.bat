@echo off
cd /d "%~dp0"
echo Starting Backend...
if not exist node_modules (
    echo Installing dependencies...
    call npm install
)
npm start
pause
