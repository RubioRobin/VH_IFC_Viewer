@echo off
echo ===================================================
echo   VH IFC VIEWER - STARTUP SCRIPT
echo ===================================================
echo.
echo 1. Starting Backend (Port 3001)...
start "VH Backend" /D "Backend" cmd /k "npm start"

echo 2. Starting Frontend (Port 5173)...
start "VH Webviewer" /D "Webviewer" cmd /k "npm run dev"

echo.
echo ===================================================
echo   Servers are launching in separate windows.
echo   - Backend: http://localhost:3001
echo   - Frontend: http://localhost:5173
echo.
echo   Press any key to close this launcher...
echo ===================================================
pause >nul
