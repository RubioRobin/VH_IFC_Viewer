# setup_remote_access.ps1
Write-Host "Setting up Remote Access for VH IFC Viewer..." -ForegroundColor Cyan

# 1. Check for Ngrok
if (-not (Get-Command "ngrok" -ErrorAction SilentlyContinue)) {
    Write-Host "Error: 'ngrok' command not found. Please install ngrok and add it to your PATH." -ForegroundColor Red
    exit
}

# 2. Check Auth
# Try a simple config check or just ask user if it fails later
# Note: 'ngrok config check' verify syntax
# Simplification: Assume if tunnels fail, we need auth.

# 3. Kill existing ngrok processes (to be clean)
Stop-Process -Name "ngrok" -ErrorAction SilentlyContinue

# 4. Start Tunnels
Write-Host "Starting Tunnels..." -ForegroundColor Green
# Start Backend Tunnel
$backendJob = Start-Process ngrok -ArgumentList "http 3001 --log=stdout" -PassThru -NoNewWindow
# Start Frontend Tunnel
$frontendJob = Start-Process ngrok -ArgumentList "http 5173 --log=stdout" -PassThru -NoNewWindow

# Wait for tunnels to initialize
Start-Sleep -Seconds 5

# 5. Get URLs via local Ngrok API (http://localhost:4040/api/tunnels)
try {
    $tunnels = Invoke-RestMethod -Uri "http://localhost:4040/api/tunnels"
    
    $backendTunnel = $tunnels.tunnels | Where-Object { $_.config.addr -like "*:3001" }
    $frontendTunnel = $tunnels.tunnels | Where-Object { $_.config.addr -like "*:5173" }

    if (-not $backendTunnel -or -not $frontendTunnel) {
        Write-Host "Failed to retrieve tunnel URLs." -ForegroundColor Red
        $authToken = Read-Host "Ngrok might need authentication. Paste Authtoken (or Enter to skip)"
        if ($authToken) {
             ngrok config add-authtoken $authToken
             Write-Host "Token added. Please re-run this script."
        }
        exit
    }

    $backendUrl = $backendTunnel.public_url
    $frontendUrl = $frontendTunnel.public_url

    Write-Host "`n✅ Tunnels Active!" -ForegroundColor Green
    Write-Host "Backend Public URL: $backendUrl"
    Write-Host "Frontend Public URL: $frontendUrl"

    # 6. Update Revit Plugin Config
    # Check both likely debug paths
    $paths = @(
        "c:\Users\Robin\Downloads\VH_IFC_Viewer\RevitPlugin\bin\Debug\config.txt",
        "$PSScriptRoot\RevitPlugin\bin\Debug\config.txt"
    )
    
    foreach ($path in $paths) {
        $dir = Split-Path $path
        if (Test-Path $dir) {
            $backendUrl | Out-File -FilePath $path -Encoding utf8 -Force
            Write-Host "✅ Updated Revit Plugin config at: $path"
        }
    }

    # 7. Instructions
    Write-Host "`n===============================================" -ForegroundColor Cyan
    Write-Host "      FINAL STEPS (Restart your servers)" -ForegroundColor Cyan
    Write-Host "===============================================" -ForegroundColor Cyan
    
    Write-Host "`n1. Restart BACKEND (Terminal 1):"
    Write-Host "   Stop current server (Ctrl+C), then run:" -ForegroundColor Yellow
    Write-Host "   `$env:FRONTEND_URL='$frontendUrl'; node server.js" -ForegroundColor White

    Write-Host "`n2. Restart FRONTEND (Terminal 2):"
    Write-Host "   Stop current server (Ctrl+C), then run:" -ForegroundColor Yellow
    Write-Host "   `$env:VITE_BACKEND_URL='$backendUrl'; npm run dev" -ForegroundColor White

    Write-Host "`n===============================================" -ForegroundColor Cyan
    Write-Host "Keep this window open to keep tunnels alive!" -ForegroundColor Magenta

} catch {
    Write-Host "Error fetching ngrok info: $_" -ForegroundColor Red
    Write-Host "Is ngrok blocked by firewall?"
}
