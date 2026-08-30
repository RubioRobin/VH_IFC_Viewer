[CmdletBinding()]
param(
    [switch]$TrustVhCertificate
)

$ErrorActionPreference = "Stop"

$packageDir = $PSScriptRoot
$payloadDir = Join-Path $packageDir "payload"
$manifestTemplate = Join-Path $packageDir "VH_IFC_QR.addin"
$publicCertificate = Join-Path $packageDir "VH-Engineering-Code-Signing.cer"
$revitDir = "C:\Program Files\Autodesk\Revit 2025"
$revitAddinsDir = Join-Path $env:APPDATA "Autodesk\Revit\Addins\2025"
$targetDir = Join-Path $revitAddinsDir "VH_IFC_QR_bundled"
$targetManifest = Join-Path $revitAddinsDir "VH_IFC_QR.addin"
$mainAssembly = Join-Path $payloadDir "VH_IFC_QR.dll"
$expectedSignerThumbprint = "656792BC1651D3FD84AFA614E7DA21E720125A7A"

if (Get-Process Revit -ErrorAction SilentlyContinue) {
    throw "Sluit Revit 2025 voordat je de add-in installeert."
}
foreach ($requiredPath in @($payloadDir, $manifestTemplate, $mainAssembly)) {
    if (-not (Test-Path -LiteralPath $requiredPath)) {
        throw "Releasebestand ontbreekt: $requiredPath"
    }
}
if (-not (Test-Path -LiteralPath (Join-Path $revitDir "RevitAPI.dll"))) {
    throw "Revit 2025 is niet gevonden in $revitDir."
}

$signature = Get-AuthenticodeSignature -LiteralPath $mainAssembly
if (-not $signature.SignerCertificate -or
    $signature.SignerCertificate.Subject -ne "CN=VH Engineering" -or
    $signature.SignerCertificate.Thumbprint -ne $expectedSignerThumbprint) {
    throw "VH_IFC_QR.dll heeft geen geldige VH Engineering-ondertekenaar."
}
if (-not $signature.TimeStamperCertificate) {
    throw "VH_IFC_QR.dll heeft geen vertrouwde tijdstempel."
}
if ($signature.Status -in @("HashMismatch", "NotSigned")) {
    throw "De digitale handtekening van VH_IFC_QR.dll is ongeldig: $($signature.Status)."
}

if ($TrustVhCertificate) {
    if (-not (Test-Path -LiteralPath $publicCertificate)) {
        throw "Openbaar VH-certificaat ontbreekt: $publicCertificate"
    }
    Import-Certificate -FilePath $publicCertificate -CertStoreLocation Cert:\CurrentUser\Root | Out-Null
    Import-Certificate -FilePath $publicCertificate -CertStoreLocation Cert:\CurrentUser\TrustedPublisher | Out-Null
    $signature = Get-AuthenticodeSignature -LiteralPath $mainAssembly
    if ($signature.Status -ne "Valid") {
        throw "De digitale handtekening is na het vertrouwen van het meegeleverde certificaat niet geldig: $($signature.Status)."
    }
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$stagingDir = "$targetDir.staging-$PID"
$backupDir = "$targetDir.backup-$timestamp"
$manifestBackup = "$targetManifest.backup-$timestamp"

New-Item -ItemType Directory -Force -Path $revitAddinsDir, $stagingDir | Out-Null
Get-ChildItem -LiteralPath $payloadDir -Force | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $stagingDir -Recurse -Force
}

# Gebruik altijd de IFC-runtime van de lokaal geïnstalleerde Revit-patch.
foreach ($assemblyName in @("Revit.IFC.Common.dll", "Revit.IFC.Export.dll")) {
    $source = Join-Path $revitDir $assemblyName
    if (-not (Test-Path -LiteralPath $source)) {
        throw "Vereiste Revit IFC-assembly ontbreekt: $source"
    }
    Copy-Item -LiteralPath $source -Destination $stagingDir -Force
}

try {
    if (Test-Path -LiteralPath $targetDir) {
        Move-Item -LiteralPath $targetDir -Destination $backupDir
    }
    if (Test-Path -LiteralPath $targetManifest) {
        Copy-Item -LiteralPath $targetManifest -Destination $manifestBackup -Force
    }

    Move-Item -LiteralPath $stagingDir -Destination $targetDir
    $manifest = Get-Content -LiteralPath $manifestTemplate -Raw
    $manifest = $manifest -replace '<Assembly>.*?</Assembly>', "<Assembly>$targetDir\VH_IFC_QR.dll</Assembly>"
    $manifest | Set-Content -LiteralPath $targetManifest -Encoding UTF8
} catch {
    if (Test-Path -LiteralPath $stagingDir) {
        Remove-Item -LiteralPath $stagingDir -Recurse -Force
    }
    if (-not (Test-Path -LiteralPath $targetDir) -and (Test-Path -LiteralPath $backupDir)) {
        Move-Item -LiteralPath $backupDir -Destination $targetDir
    }
    if (Test-Path -LiteralPath $manifestBackup) {
        Copy-Item -LiteralPath $manifestBackup -Destination $targetManifest -Force
    }
    throw
}

$installedSignature = Get-AuthenticodeSignature -LiteralPath (Join-Path $targetDir "VH_IFC_QR.dll")
if (-not $installedSignature.SignerCertificate -or
    $installedSignature.SignerCertificate.Thumbprint -ne $expectedSignerThumbprint) {
    throw "De geïnstalleerde DLL wijkt af van het gecontroleerde releasebestand."
}
Write-Host "VH IFC Viewer 1.1.0 is geïnstalleerd voor Revit 2025." -ForegroundColor Green
Write-Host "Add-in: $targetDir" -ForegroundColor DarkGray
Write-Host "Manifest: $targetManifest" -ForegroundColor DarkGray
Write-Host "Ondertekenaar: $($installedSignature.SignerCertificate.Subject)" -ForegroundColor DarkGray
if ($installedSignature.Status -ne "Valid") {
    Write-Warning "De handtekening is aanwezig en getimestamped, maar dit Windows-profiel vertrouwt het zelfondertekende VH-certificaat nog niet. Voer het script desgewenst opnieuw uit met -TrustVhCertificate."
}
if (Test-Path -LiteralPath $backupDir) {
    Write-Host "Vorige installatie bewaard als: $backupDir" -ForegroundColor DarkGray
}
Write-Host "Start Revit 2025 en controleer de stappen uit INSTALLATIE.md." -ForegroundColor Cyan
