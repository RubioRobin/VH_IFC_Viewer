# VH IFC Viewer - Installatie & Gebruik

## 1. Web Viewer
De web viewer is online beschikbaar en toegankelijk voor iedereen met een link.
- **URL:** https://vh-ifc-viewer.vercel.app/ (of de domeinnaam die u gebruikt)

## 2. Revit Plugin Installatie
De Revit plugin maat het mogelijk om direct vanuit Revit modellen te uploaden en QR codes op sheets te plaatsen.

### Installatie Stappen:
1. Sluit Autodesk Revit af.
2. Kopieer de inhoud van de map `RevitPlugin` naar de volgende locatie op uw computer:
   `%APPDATA%\Autodesk\Revit\Addins\2025\`
   *(Pas het jaartal aan indien u een andere Revit versie gebruikt, bijv. 2024)*
3. Start Revit opnieuw op.
4. Ga naar de tab **"VH Engineering"** in de ribbon.

## 3. Gebruik
1. Open een 3D view in Revit die u wilt exporteren.
2. Klik op **"Generate QR"** in de VH Engineering tab.
3. Selecteer de gewenste 3D view en de Sheet waar de QR code moet komen.
4. Klik op **"Genereer & Upload"**.
5. Wacht tot de upload voltooid is en de QR code op de sheet verschijnt.
6. Scan de QR code met uw mobiele telefoon om het model direct te openen.

## 4. Troubleshooting
- **Geen internet:** De plugin heeft een actieve internetverbinding nodig.
- **Foutmeldingen:** Controleer of u schrijfrechten heeft in de exportmap.
