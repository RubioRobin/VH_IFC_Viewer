# Run Local Script
$ErrorActionPreference = "Stop"

$scriptPath = $PSScriptRoot
$backendPath = Join-Path $scriptPath "Backend"
$viewerPath = Join-Path $scriptPath "Webviewer"

Write-Host "--- VH IFC Viewer Local Setup ---" -ForegroundColor Cyan

# 1. Backend Setup
Write-Host "`n[1/2] Checking Backend..." -ForegroundColor Yellow
if (-not (Test-Path (Join-Path $backendPath "node_modules"))) {
    Write-Host "Installing Backend dependencies..." -ForegroundColor Gray
    Start-Process -FilePath "npm" -ArgumentList "install" -WorkingDirectory $backendPath -Wait -NoNewWindow
}
Write-Host "Starting Backend Server..." -ForegroundColor Green
Start-Process -FilePath "cmd.exe" -ArgumentList "/c start_backend.bat" -WorkingDirectory $backendPath

# 2. Viewer Setup
Write-Host "`n[2/2] Checking Webviewer..." -ForegroundColor Yellow
if (-not (Test-Path (Join-Path $viewerPath "node_modules"))) {
    Write-Host "Installing Webviewer dependencies..." -ForegroundColor Gray
    Start-Process -FilePath "npm" -ArgumentList "install" -WorkingDirectory $viewerPath -Wait -NoNewWindow
}
Write-Host "Starting Webviewer..." -ForegroundColor Green
Start-Process -FilePath "cmd.exe" -ArgumentList "/c start_viewer.bat" -WorkingDirectory $viewerPath

Write-Host "`n--- All systems nominal ---" -ForegroundColor Cyan
Write-Host "Backend: http://localhost:3001"
Write-Host "Viewer:  http://localhost:5173"
Write-Host "Admin:   http://localhost:5173/admin.html"
Write-Host "`nPress any key to exit this launcher (terminals will stay open)..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
