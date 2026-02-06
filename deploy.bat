@echo off
echo ========================================
echo VH IFC Viewer - Quick Deploy Script
echo ========================================
echo.

echo [1/3] Building frontend...
cd Webviewer
call npm run build
if %errorlevel% neq 0 (
    echo ERROR: Frontend build failed!
    pause
    exit /b 1
)

echo.
echo [2/3] Frontend build successful!
echo.
echo [3/3] Ready to deploy to Vercel
echo.
echo Run the following command to deploy:
echo   vercel --prod
echo.
echo After deployment, update the backend FRONTEND_URL
echo with your Vercel URL in Render dashboard.
echo.
pause
