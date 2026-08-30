# VH IFC Viewer — Revit add-in 1.1.0

## Actieve entrypoint

`App : IExternalApplication` maakt in Revit 2025 het ribbon-tabblad **VH** en
de knop **IFC Exporteren** aan. Die knop start `UploadExportCommand`. De add-in
is gebouwd voor `net8.0-windows`, x64 en Revit 2025.

`AdminCommand` en `LinkQRCommand` zijn compileerbare ondersteunende commando's,
maar worden door `App.OnStartup` in 1.1.0 niet als aparte ribbonknop
geregistreerd.

## Hoofdflow

1. `VhAssemblyIfcExporter.Export` toont de exportselectie en maakt IFC's met de
   lokaal geïnstalleerde Revit 2025 IFC-runtime.
2. `DirectSupabaseConnection` maakt de API-client met de productie-URL en
   openbare publishable key.
3. `PluginClient.CheckConnectionAsync` controleert `revit-api/health`.
4. De gebruiker meldt aan via Supabase Auth; de sessie wordt per
   Windows-gebruiker met DPAPI bewaard in
   `%APPDATA%\VH_IFC_Viewer\auth.json`.
5. `RevitProjectIdentity` koppelt Revit Project Number/Name aan het
   Supabase-project.
6. Per IFC maakt de add-in een model/uploadsessie aan, uploadt via signed TUS in
   chunks van 6 MB en rondt de versie server-side af.
7. De add-in maakt of hergebruikt de share en QR, downloadt de PNG en plaatst
   die in een expliciete Revit-`Transaction` op de gekoppelde sheet.
8. `ResultWindow` toont geslaagde en mislukte onderdelen afzonderlijk.

Een vooraf via het adminportaal gereserveerde bestandsnaam wordt als dezelfde
modelidentiteit herkend. Daardoor blijft de al uitgegeven sharetoken/QR geldig
wanneer de echte IFC vanuit Revit wordt geüpload.

## Authenticatie en secrets

- `apikey`: openbare Supabase publishable key; identificeert het project.
- `Authorization: Bearer <JWT>`: vereist voor iedere muterende Revit-actie en
  server-side gevalideerd met Supabase Auth.
- Een service-role/secret key komt nooit in de add-in, browser of
  `settings.json`.
- Er is bewust geen apart desktop-installatiesecret: zo'n waarde is uit een
  clientbinary te extraheren en mag niet als autorisatiegrens dienen.

`SettingsManager` bewaart alleen niet-gevoelige voorkeuren: QR-grootte en
-positie, IFC-versie, zichtbare-exportkeuze en laatste project/map/prefix.
Legacy verbindingsvelden worden bij het laden uit `settings.json` verwijderd.

## API-contract

| Methode | Route | Gebruik |
|---|---|---|
| GET | `/health` | Schema, buckets en viewer-URL controleren |
| GET | `/projects` | Projectlijst ophalen |
| POST | `/projects/ensure` | Revit-project zoeken of aanmaken |
| POST | `/models/create` | Model zoeken of aanmaken |
| POST | `/models/{id}/versions/upload-session` | Signed PUT/TUS-sessie maken |
| POST | `/models/{id}/versions/{versionId}/complete` | Object valideren en publiceren |
| POST | `/models/{id}/versions/{versionId}/share` | Sharetoken maken/hergebruiken |
| POST | `/models/{id}/versions/{versionId}/qr` | QR-PNG maken |

Na de eerste geaccepteerde TUS-chunk schakelt de client nooit terug naar signed
PUT. Alleen vóórdat Storage bytes heeft geaccepteerd is die fallback veilig.

## Revit API-aandachtspunten

- `UploadExportCommand` gebruikt `TransactionMode.Manual`.
- Netwerkwerk draait buiten een Revit-transactie; alleen documentmutaties zijn
  transactioneel.
- Sheets worden met `FilteredElementCollector.OfClass(typeof(ViewSheet))`
  verzameld en placeholders worden overgeslagen.
- IFC-assemblies worden bij installatie uit de lokaal geïnstalleerde Revit
  patch gekopieerd om versieverschillen te voorkomen.
- Een gedeeltelijke QR-download of sheetmatch wordt per item gerapporteerd;
  één fout verbergt geslaagde exports niet.

## Build, signing en installatie

```powershell
dotnet build .\VH_IFC_QR.csproj -c Release -p:CopyToRevitAddins=false
```

Lokale builds gebruiken de geïnstalleerde Revit API. CI gebruikt
`Revit_All_Main_Versions_API_x64` plus de gecontroleerde exporter-runtime. Het
releasepakket accepteert alleen de getimestampede VH Engineering-handtekening
met thumbprint `656792BC1651D3FD84AFA614E7DA21E720125A7A`.

Gebruik voor eindgebruikers het getekende zip-pakket en de stappen uit
`INSTALLATIE.md`; een .NET SDK is voor die installatie niet nodig.
