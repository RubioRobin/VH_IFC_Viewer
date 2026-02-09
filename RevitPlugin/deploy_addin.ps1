$ErrorActionPreference = "Stop"

# Configuration
$year = "2025"
$solutionPath = "$PSScriptRoot\VH_IFC_QR.sln"
$projectPath = "$PSScriptRoot\VH_IFC_QR.csproj"
$addinManifest = "$PSScriptRoot\VH_IFC_QR.addin"
$buildConfig = "Release"

# Paths
$appData = $env:APPDATA
$addinDest = "$appData\Autodesk\Revit\Addins\$year"
$dllDest = "$addinDest\VH_IFC_QR"

Write-Host "--- Revit Plugin Build & Deploy Tool ---" -ForegroundColor Cyan
Write-Host "Target Revit Version: $year"
Write-Host "Destination: $addinDest"
Write-Host ""

# Check for dotnet
if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    Write-Error "dotnet CLI is not found. Please install .NET SDK."
}

# 1. Clean & Build
Write-Host "1. Building Solution ($buildConfig)..." -ForegroundColor Yellow
dotnet build $projectPath -c $buildConfig
if ($LASTEXITCODE -ne 0) {
    Write-Error "Build failed!"
}
Write-Host "Build successful." -ForegroundColor Green

# 2. Create local directory
if (-not (Test-Path $addinDest)) {
    Write-Host "Creating Addin folder: $addinDest"
    New-Item -ItemType Directory -Path $addinDest -Force | Out-Null
}

if (-not (Test-Path $dllDest)) {
    Write-Host "Creating DLL folder: $dllDest"
    New-Item -ItemType Directory -Path $dllDest -Force | Out-Null
}

# 3. Copy Files
Write-Host "2. Deploying files..." -ForegroundColor Yellow

# Copy DLLs and content from bin
$binPath = "$PSScriptRoot\bin\$buildConfig\net8.0-windows" 
# NOTE: Adjust net8.0-windows if target framework is different in csproj

Write-Host "Copying binaries from: $binPath"
Copy-Item -Path "$binPath\*" -Destination $dllDest -Recurse -Force

# Copy .addin manifest
Write-Host "Copying manifest: $addinManifest"
Copy-Item -Path $addinManifest -Destination $addinDest -Force

# 4. Update .addin path (if needed)
# The .addin file usually points to the DLL. 
# If it points to a relative path, we need to make sure it matches the folder structure.
# Standard pattern: <Assembly>VH_IFC_QR/VH_IFC_QR.dll</Assembly>
# Let's read and update the content if necessary to point to the subfolder.

$manifestContent = Get-Content $addinDest\VH_IFC_QR.addin
$newContent = $manifestContent -replace "<Assembly>.*VH_IFC_QR.dll<\/Assembly>", "<Assembly>$dllDest\VH_IFC_QR.dll</Assembly>"
$newContent | Set-Content $addinDest\VH_IFC_QR.addin

Write-Host "--- Deployment Complete! ---" -ForegroundColor Green
Write-Host "Restart Revit to see changes."
