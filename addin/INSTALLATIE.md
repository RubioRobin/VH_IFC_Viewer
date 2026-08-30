# VH IFC Viewer 1.1.0 installeren

1. Sluit Revit 2025.
2. Pak het release-zipbestand volledig uit.
3. Open PowerShell in de uitgepakte map en voer uit:

   ```powershell
   .\install-release.ps1
   ```

4. Alleen op beheerde VH-werkplekken waarop dit openbare certificaat bewust
   vertrouwd mag worden:

   ```powershell
   .\install-release.ps1 -TrustVhCertificate
   ```

Het script installeert alleen in het huidige Windows-profiel onder
`%APPDATA%\Autodesk\Revit\Addins\2025`. Een vorige installatie blijft als
gedateerde backup staan. De productie-URL en publishable key zijn onderdeel van
de geteste releaseconfiguratie. Er wordt geen service-role key of apart
desktopsecret geïnstalleerd; meld bij de eerste start aan met een bevestigde
Supabase Auth-gebruiker.

Controleer na installatie in Revit:

- aanmelden met een bevestigde Supabase Auth-gebruiker;
- projectnummer wordt correct herkend;
- één klein model exporteren, uploaden en via de QR-link openen;
- een tweede upload met dezelfde bestandsnaam vervangt de actuele versie,
  terwijl de bestaande QR-link blijft werken;
- een afgebroken upload kan worden hervat;
- eigenschappen, selectie, zichtbaarheid en meetfunctie werken in de viewer.
