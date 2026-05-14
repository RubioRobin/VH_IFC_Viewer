# VH_IFC_QR — Build & Install naar Revit 2025 Addins
# Dubbelklik dit script na installatie van .NET SDK 8

$ErrorActionPreference = "Stop"

$addinDir   = $PSScriptRoot
$targetDir  = "$env:APPDATA\Autodesk\Revit\Addins\2025\VH_IFC_QR"
$addinFile  = "$env:APPDATA\Autodesk\Revit\Addins\2025\VH_IFC_QR.addin"

Write-Host "=== VH IFC QR - Build en Install ===" -ForegroundColor Cyan

# 1. Build
Write-Host "`n[1/3] Building Release..." -ForegroundColor Yellow
dotnet build "$addinDir\VH_IFC_QR.csproj" -c Release
if ($LASTEXITCODE -ne 0) { throw "Build mislukt!" }
Write-Host "Build geslaagd." -ForegroundColor Green

# 2. Kopieer DLL, afhankelijkheden én iconen
Write-Host "`n[2/3] Kopieer naar Revit Addins..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
Copy-Item -Path "$addinDir\bin\Release\net8.0-windows\*" -Destination $targetDir -Recurse -Force
# Iconen staan naast de bronbestanden (niet in bin/), dus apart kopiëren
Get-ChildItem -Path $addinDir -Filter "*.png" | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination $targetDir -Force
}

$exporterSource = Join-Path $addinDir "Exporter"
$exporterTarget = Join-Path $targetDir "Exporter"
$standaloneExporterTarget = "$env:APPDATA\Autodesk\Revit\Addins\2025\VHIFCExportSingleAssembly"
if (Test-Path $exporterSource) {
    New-Item -ItemType Directory -Force -Path $exporterTarget | Out-Null
    New-Item -ItemType Directory -Force -Path $standaloneExporterTarget | Out-Null
    Copy-Item -Path "$exporterSource\*" -Destination $exporterTarget -Recurse -Force
    Copy-Item -Path "$exporterSource\*" -Destination $standaloneExporterTarget -Recurse -Force
    Write-Host "IFC exporter dependencies gekopieerd naar: $exporterTarget" -ForegroundColor Green
    Write-Host "IFC exporter runtime gekopieerd naar: $standaloneExporterTarget" -ForegroundColor Green
} else {
    Write-Host "WAARSCHUWING: Exporter-map niet gevonden: $exporterSource" -ForegroundColor Yellow
}
Write-Host "Bestanden gekopieerd naar: $targetDir" -ForegroundColor Green

$securityDir = "$env:APPDATA\Autodesk\Security"
$securityFile = Join-Path $securityDir "securitydatalog.txt"
New-Item -ItemType Directory -Force -Path $securityDir | Out-Null
if (-not (Test-Path $securityFile)) {
    Write-Host "LET OP: VHPrefab autorisatiebestand ontbreekt: $securityFile" -ForegroundColor Yellow
}

# 3. Schrijf .addin manifest met Assembly-pad voor deze gebruiker
Write-Host "`n[3/3] Schrijf .addin manifest..." -ForegroundColor Yellow
$addinXml = Get-Content "$addinDir\VH_IFC_QR.addin" -Raw
$addinXml = $addinXml -replace '<Assembly>.*?</Assembly>', "<Assembly>$targetDir\VH_IFC_QR.dll</Assembly>"
$addinXml | Set-Content $addinFile -Encoding UTF8
Write-Host "Manifest geschreven naar: $addinFile" -ForegroundColor Green

# 4. Schrijf settings.json als ClientSecret nog niet ingesteld is
$settingsDir  = "$env:APPDATA\VH_IFC_Viewer"
$settingsFile = "$settingsDir\settings.json"
$clientSecret = "0a50db56042b384daa545b904c1d76bae3ad9437a23fa620431e2d5844f8d3c9"

New-Item -ItemType Directory -Force -Path $settingsDir | Out-Null

$needsWrite = $true
if (Test-Path $settingsFile) {
    $existing = Get-Content $settingsFile -Raw | ConvertFrom-Json
    if ($existing.ClientSecret -and $existing.ClientSecret -ne "") {
        $needsWrite = $false
        Write-Host "Settings al aanwezig, ClientSecret ongewijzigd." -ForegroundColor DarkGray
    }
}

if ($needsWrite) {
    $settings = @{
        BackendUrl       = "https://vh-ifc-backend.onrender.com"
        AdminUrl         = "https://vh-ifc-viewer.vercel.app/admin.html#/login"
        ClientId         = "revit_plugin"
        ClientSecret     = $clientSecret
        QrSizeMm         = 50.0
        QrOffsetMm       = 10.0
        QrLocation       = "BottomRight"
        IfcVersion       = "IFC4"
        ExportOnlyVisible = $true
    }
    $settings | ConvertTo-Json | Set-Content $settingsFile -Encoding UTF8
    Write-Host "Settings aangemaakt met ClientSecret." -ForegroundColor Green
}

Write-Host "`n=== Klaar! Start Revit 2025 om de addin te testen. ===" -ForegroundColor Green
