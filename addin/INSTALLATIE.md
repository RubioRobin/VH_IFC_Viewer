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
gedateerde backup staan. Supabase-URL, publishable key en Revit-toegangssleutel
worden niet door het installatiepakket opgeslagen; stel die bij de eerste start
in via **VH > IFC Instellingen**.

Controleer na installatie in Revit:

- aanmelden met een bevestigde Supabase Auth-gebruiker;
- projectnummer wordt correct herkend;
- één klein model exporteren, uploaden en via de QR-link openen;
- een tweede upload met dezelfde bestandsnaam vervangt de vorige versie;
- een afgebroken upload kan worden hervat;
- eigenschappen, selectie, zichtbaarheid en meetfunctie werken in de viewer.
