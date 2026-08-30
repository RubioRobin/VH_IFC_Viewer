# VH_IFC_QR — Build & Install naar Revit 2025 Addins
# Dubbelklik dit script na installatie van .NET SDK 8

$ErrorActionPreference = "Stop"

$addinDir   = $PSScriptRoot
$targetDir  = "$env:APPDATA\Autodesk\Revit\Addins\2025\VH_IFC_QR_bundled"
$addinFile  = "$env:APPDATA\Autodesk\Revit\Addins\2025\VH_IFC_QR.addin"
$outputDir  = "$addinDir\bin\Release\net8.0-windows"
$revitDir   = "C:\Program Files\Autodesk\Revit 2025"

Write-Host "=== VH IFC QR - Build en Install ===" -ForegroundColor Cyan
$signingIdentity = if ($env:VH_CODE_SIGN_THUMBPRINT) {
    $env:VH_CODE_SIGN_THUMBPRINT
} elseif ($env:VH_CODE_SIGN_CERT) {
    $env:VH_CODE_SIGN_CERT
} else {
    $null
}
if ($signingIdentity) {
    Write-Host "Code signing-identiteit gevonden: $signingIdentity" -ForegroundColor DarkGray
} else {
    Write-Host "Geen code signing certificaat ingesteld; Revit kan de eerste keer een unsigned add-in melding tonen." -ForegroundColor DarkYellow
}

# 1. Build
Write-Host "`n[1/4] Building Release..." -ForegroundColor Yellow
dotnet clean "$addinDir\VH_IFC_QR.csproj" -c Release -p:CopyToRevitAddins=false --nologo
if ($LASTEXITCODE -ne 0) { throw "Opschonen van de vorige build is mislukt!" }
dotnet build "$addinDir\VH_IFC_QR.csproj" -c Release -p:CopyToRevitAddins=false
if ($LASTEXITCODE -ne 0) { throw "Build mislukt!" }
Write-Host "Build geslaagd." -ForegroundColor Green

# 2. Kopieer DLL, afhankelijkheden én iconen
Write-Host "`n[2/4] Kopieer naar Revit Addins..." -ForegroundColor Yellow
if (Test-Path $targetDir) {
    Remove-Item -LiteralPath $targetDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
Get-ChildItem -LiteralPath $outputDir -Recurse -File -Include *.dll,*.deps.json |
    ForEach-Object {
        $relativePath = $_.FullName.Substring($outputDir.Length).TrimStart('\')
        $destinationPath = Join-Path $targetDir $relativePath
        $destinationFolder = Split-Path $destinationPath -Parent
        New-Item -ItemType Directory -Force -Path $destinationFolder | Out-Null
        Copy-Item -LiteralPath $_.FullName -Destination $destinationPath -Force
    }

# Deze twee Autodesk IFC-assemblies worden bewust direct uit de actieve
# Revit-installatie gekopieerd. Copy Local zou ook interne DBAPI-modules meenemen.
Copy-Item -LiteralPath (Join-Path $revitDir "Revit.IFC.Common.dll") -Destination $targetDir -Force
Copy-Item -LiteralPath (Join-Path $revitDir "Revit.IFC.Export.dll") -Destination $targetDir -Force
# Iconen staan naast de bronbestanden (niet in bin/), dus apart kopiëren
Copy-Item -Path "$addinDir\icon_export.png" -Destination $targetDir -Force

Write-Host "Bestanden gekopieerd naar: $targetDir" -ForegroundColor Green

$ifcAssemblies = @("Revit.IFC.Common.dll", "Revit.IFC.Export.dll")
foreach ($assemblyName in $ifcAssemblies) {
    $sourceAssembly = Join-Path $revitDir $assemblyName
    $installedAssembly = Join-Path $targetDir $assemblyName

    if (-not (Test-Path -LiteralPath $sourceAssembly)) {
        throw "Vereiste Revit-assembly ontbreekt: $sourceAssembly"
    }

    if (-not (Test-Path -LiteralPath $installedAssembly)) {
        throw "Vereiste IFC-assembly is niet meegekopieerd: $installedAssembly"
    }

    $sourceVersion = [System.Reflection.AssemblyName]::GetAssemblyName($sourceAssembly).Version
    $installedVersion = [System.Reflection.AssemblyName]::GetAssemblyName($installedAssembly).Version
    if ($sourceVersion -ne $installedVersion) {
        throw "$assemblyName heeft versie $installedVersion; Revit vereist $sourceVersion."
    }

    Write-Host "$assemblyName versie $installedVersion gecontroleerd." -ForegroundColor DarkGray
}

# 3. Schrijf .addin manifest met Assembly-pad voor deze gebruiker
Write-Host "`n[3/4] Schrijf .addin manifest..." -ForegroundColor Yellow
$addinXml = Get-Content "$addinDir\VH_IFC_QR.addin" -Raw
$addinXml = $addinXml -replace '<Assembly>.*?</Assembly>', "<Assembly>$targetDir\VH_IFC_QR.dll</Assembly>"
$addinXml | Set-Content $addinFile -Encoding UTF8
Write-Host "Manifest geschreven naar: $addinFile" -ForegroundColor Green

# 4. Controleer handtekening en geef de eenmalige configuratiestap aan
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
New-Item -ItemType Directory -Force -Path $settingsDir | Out-Null
Write-Host "Stel bij de eerste start de Supabase URL, publishable key en Revit toegangssleutel in via IFC Instellingen." -ForegroundColor Yellow
Write-Host "Het installatieprogramma schrijft geen sleutels of server-URL's naar AppData." -ForegroundColor DarkGray

Write-Host "`n=== Klaar! Start Revit 2025 om de add-in te testen. ===" -ForegroundColor Green
