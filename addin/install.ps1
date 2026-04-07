# VH_IFC_QR — Build & Install naar Revit 2025 Addins
# Dubbelklik dit script na installatie van .NET SDK 8

$ErrorActionPreference = "Stop"

$addinDir   = $PSScriptRoot
$targetDir  = "$env:APPDATA\Autodesk\Revit\Addins\2025\VH_IFC_QR"
$addinFile  = "$env:APPDATA\Autodesk\Revit\Addins\2025\VH_IFC_QR.addin"

Write-Host "=== VH IFC QR — Build & Install ===" -ForegroundColor Cyan

# 1. Build
Write-Host "`n[1/3] Building Release..." -ForegroundColor Yellow
dotnet build "$addinDir\VH_IFC_QR.csproj" -c Release
if ($LASTEXITCODE -ne 0) { throw "Build mislukt!" }
Write-Host "Build geslaagd." -ForegroundColor Green

# 2. Kopieer DLL en afhankelijkheden
Write-Host "`n[2/3] Kopieer naar Revit Addins..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
Copy-Item -Path "$addinDir\bin\Release\net8.0-windows\*" -Destination $targetDir -Recurse -Force
Write-Host "Bestanden gekopieerd naar: $targetDir" -ForegroundColor Green

# 3. Kopieer .addin manifest
Write-Host "`n[3/3] Kopieer .addin manifest..." -ForegroundColor Yellow
Copy-Item -Path "$addinDir\VH_IFC_QR.addin" -Destination $addinFile -Force
Write-Host "Manifest gekopieerd naar: $addinFile" -ForegroundColor Green

Write-Host "`n=== Klaar! Start Revit 2025 om de addin te testen. ===" -ForegroundColor Cyan
