[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^\d+\.\d+\.\d+$')]
    [string]$Version,

    [string]$OutputDirectory = "artifacts"
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path $PSScriptRoot -Parent
$addinRoot = Join-Path $projectRoot "addin"
$buildOutput = Join-Path $addinRoot "bin\Release\net8.0-windows"
$artifactRoot = Join-Path $projectRoot $OutputDirectory
$packageName = "VH-IFC-Viewer-$Version-Revit-2025"
$packageRoot = Join-Path $artifactRoot $packageName
$payloadDir = Join-Path $packageRoot "payload"
$zipPath = Join-Path $artifactRoot "$packageName.zip"
$expectedSignerThumbprint = "656792BC1651D3FD84AFA614E7DA21E720125A7A"

if (-not (Test-Path -LiteralPath (Join-Path $buildOutput "VH_IFC_QR.dll"))) {
    throw "Releasebuild ontbreekt. Bouw eerst addin/VH_IFC_QR.csproj in Release."
}

$signature = Get-AuthenticodeSignature -LiteralPath (Join-Path $buildOutput "VH_IFC_QR.dll")
if (-not $signature.SignerCertificate -or
    $signature.SignerCertificate.Subject -ne "CN=VH Engineering" -or
    $signature.SignerCertificate.Thumbprint -ne $expectedSignerThumbprint) {
    throw "De release-DLL is niet ondertekend door VH Engineering."
}
if (-not $signature.TimeStamperCertificate) {
    throw "De release-DLL mist een Authenticode-tijdstempel."
}
if ($signature.Status -in @("HashMismatch", "NotSigned")) {
    throw "De release-DLL heeft een ongeldige handtekening: $($signature.Status)."
}

if (Test-Path -LiteralPath $packageRoot) {
    Remove-Item -LiteralPath $packageRoot -Recurse -Force
}
if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}
New-Item -ItemType Directory -Force -Path $payloadDir | Out-Null

Get-ChildItem -LiteralPath $buildOutput -Recurse -File |
    Where-Object { $_.Extension -notin @(".pdb", ".xml") } |
    ForEach-Object {
        $relative = $_.FullName.Substring($buildOutput.Length).TrimStart('\')
        $destination = Join-Path $payloadDir $relative
        New-Item -ItemType Directory -Force -Path (Split-Path $destination -Parent) | Out-Null
        Copy-Item -LiteralPath $_.FullName -Destination $destination -Force
    }

foreach ($asset in @("icon_export.png", "icon_admin.png", "icon_settings.png")) {
    Copy-Item -LiteralPath (Join-Path $addinRoot $asset) -Destination $payloadDir -Force
}
Copy-Item -LiteralPath (Join-Path $addinRoot "install-release.ps1") -Destination $packageRoot -Force
Copy-Item -LiteralPath (Join-Path $addinRoot "INSTALLATIE.md") -Destination $packageRoot -Force
Copy-Item -LiteralPath (Join-Path $addinRoot "VH_IFC_QR.addin") -Destination $packageRoot -Force
Copy-Item -LiteralPath (Join-Path $addinRoot "certificates\VH-Engineering-Code-Signing.cer") -Destination $packageRoot -Force

Compress-Archive -LiteralPath $packageRoot -DestinationPath $zipPath -CompressionLevel Optimal
$hash = Get-FileHash -LiteralPath $zipPath -Algorithm SHA256
"$($hash.Hash.ToLowerInvariant())  $([IO.Path]::GetFileName($zipPath))" |
    Set-Content -LiteralPath "$zipPath.sha256" -Encoding ascii

[PSCustomObject]@{
    Package = $zipPath
    Sha256 = $hash.Hash.ToLowerInvariant()
    Signer = $signature.SignerCertificate.Subject
    Timestamped = $null -ne $signature.TimeStamperCertificate
} | Format-List
