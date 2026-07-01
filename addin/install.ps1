# VH_IFC_QR — Build & Install naar Revit 2025 Addins
# Dubbelklik dit script na installatie van .NET SDK 8

$ErrorActionPreference = "Stop"

$addinDir   = $PSScriptRoot
$targetDir  = "$env:APPDATA\Autodesk\Revit\Addins\2025\VH_IFC_QR_bundled"
$addinFile  = "$env:APPDATA\Autodesk\Revit\Addins\2025\VH_IFC_QR.addin"
$outputDir  = "$addinDir\bin\Release\net8.0-windows"

Write-Host "=== VH IFC QR - Build en Install ===" -ForegroundColor Cyan
if ($env:VH_CODE_SIGN_CERT) {
    Write-Host "Code signing certificaat gevonden: $env:VH_CODE_SIGN_CERT" -ForegroundColor DarkGray
} else {
    Write-Host "Geen code signing certificaat ingesteld; Revit kan de eerste keer een unsigned add-in melding tonen." -ForegroundColor DarkYellow
}

# 1. Build
Write-Host "`n[1/4] Building Release..." -ForegroundColor Yellow
dotnet build "$addinDir\VH_IFC_QR.csproj" -c Release
if ($LASTEXITCODE -ne 0) { throw "Build mislukt!" }
Write-Host "Build geslaagd." -ForegroundColor Green

# 2. Kopieer DLL, afhankelijkheden én iconen
Write-Host "`n[2/4] Kopieer naar Revit Addins..." -ForegroundColor Yellow
if (Test-Path $targetDir) {
    Remove-Item -LiteralPath $targetDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
Copy-Item -Path "$outputDir\*" -Destination $targetDir -Recurse -Force
# Iconen staan naast de bronbestanden (niet in bin/), dus apart kopiëren
Copy-Item -Path "$addinDir\icon_export.png" -Destination $targetDir -Force

Write-Host "Bestanden gekopieerd naar: $targetDir" -ForegroundColor Green

# 3. Schrijf .addin manifest met Assembly-pad voor deze gebruiker
Write-Host "`n[3/4] Schrijf .addin manifest..." -ForegroundColor Yellow
$addinXml = Get-Content "$addinDir\VH_IFC_QR.addin" -Raw
$addinXml = $addinXml -replace '<Assembly>.*?</Assembly>', "<Assembly>$targetDir\VH_IFC_QR.dll</Assembly>"
$addinXml | Set-Content $addinFile -Encoding UTF8
Write-Host "Manifest geschreven naar: $addinFile" -ForegroundColor Green

# 4. Controleer signature en schrijf settings.json als ClientSecret nog niet ingesteld is
Write-Host "`n[4/4] Controleer installatie..." -ForegroundColor Yellow
$signature = Get-AuthenticodeSignature "$targetDir\VH_IFC_QR.dll"
if ($signature.Status -eq "Valid") {
    Write-Host "Digitale handtekening is geldig: $($signature.SignerCertificate.Subject)" -ForegroundColor Green
} else {
    Write-Host "DLL is niet digitaal ondertekend. Revit toont daarom mogelijk 'Security - Unsigned Add-In'." -ForegroundColor DarkYellow
    Write-Host "Kies in Revit alleen 'Always Load' als deze build van een vertrouwde bron komt." -ForegroundColor DarkYellow
}

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

Write-Host "`n=== Klaar! Start Revit 2025 om de add-in te testen. ===" -ForegroundColor Green
