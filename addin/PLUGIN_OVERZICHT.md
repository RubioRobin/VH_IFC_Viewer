# VH IFC QR – Revit Plugin Overzicht
Gegenereerd op: 25-02-2026  
Namespace: `VH_IFC_QR`  
Project bestand: `VH_IFC_QR.csproj` (.NET 8.0 Windows, WPF, x64)

---

## 1. DOEL VAN DE PLUGIN

De plugin voegt een tab **"VH"** toe aan de Revit ribbon met drie knoppen. Via die knoppen kunnen gebruikers:

1. **IFC exporteren** – één of meerdere 3D views exporteren als IFC-bestand, rechtstreeks naar Supabase Storage uploaden, een deelbare viewerlink genereren, en automatisch een **QR-code op de bijbehorende tekenbladen (sheets)** plaatsen.
2. **Admin Dashboard** – de beheerwebsite openen in de browser.
3. **Instellingen** – QR-code en IFC exportopties configureren.

---

## 2. PROJECTSTRUCTUUR / BESTANDEN

```
revit-plugin/
├── VH_IFC_QR.addin          ← Revit registratiebestand
├── VH_IFC_QR.csproj          ← Project/build configuratie
│
├── App.cs                    ← Ribbon registratie (entry point)
├── AdminCommand.cs           ← Knop: Admin Dashboard
├── IfcSettingsCommand.cs     ← Knop: Instellingen openen
├── Command.cs                ← Knop: Export IFC (hoofd logica)
│
├── PluginClient.cs           ← Supabase Auth, Edge Function en Storage client
├── SettingsManager.cs        ← Opslaan/laden van instellingen (JSON)
│
├── SelectionWindow.xaml/.cs  ← UI: Project + View/Sheet selectie
├── IfcSettingsWindow.xaml/.cs← UI: Instellingen scherm
├── LoginWindow.xaml/.cs      ← UI: Inlogscherm
├── NotificationWindow.xaml/.cs ← UI: Fout/Info/Waarschuwing popups
├── ProgressWindow.xaml/.cs   ← UI: Voortgangsbalk tijdens upload
├── ResultWindow.xaml/.cs     ← UI: Resultaat na voltooiing
│
├── icon_export.png           ← Ribbon icoon: Export knop
├── icon_admin.png            ← Ribbon icoon: Admin knop
├── icon_settings.png         ← Ribbon icoon: Instellingen knop
└── dist/                     ← Gecompileerde output (DLL, etc.)
```

---

## 3. REGISTRATIE & OPSTARTEN

### `VH_IFC_QR.addin`
Vertelt Revit welke DLL geladen moet worden bij opstarten.

| Veld             | Waarde                                                                 |
|------------------|------------------------------------------------------------------------|
| Type             | Application                                                            |
| FullClassName    | `VH_IFC_QR.App`                                                        |
| Assembly         | `C:\Users\Robin\AppData\Roaming\Autodesk\Revit\Addins\2025\VH_IFC_QR\VH_IFC_QR.dll` |
| AddInId          | `0F3C8A7B-E2D1-4B8F-9C4D-8A2E1F3B4C5D`                                |
| VendorId         | `VH_ENGINEERING`                                                       |

### `App.cs` – `IExternalApplication`
- Maakt de Ribbon tab **"VH"** en het panel **"Tools"**.
- Registreert drie knoppen (PushButton):
  - **Export IFC** → `ExportIFCCommand` – icoon: `icon_export.png`
  - **Admin Dashboard** → `AdminCommand` – icoon: `icon_admin.png`
  - **IFC Settings** → `IfcSettingsCommand` – icoon: `icon_settings.png`
- Iconen worden geladen via `BitmapImage` vanuit dezelfde map als de DLL.

---

## 4. COMMANDO'S (KNOPPEN)

### `AdminCommand.cs`
Eenvoudig commando dat de beheerwebsite opent:
```
https://vh-ifc-viewer.vercel.app/admin.html#/login
```
Gebruikt `Process.Start` met `UseShellExecute = true` (opent de standaard browser).

---

### `IfcSettingsCommand.cs`
Opent `IfcSettingsWindow` als modaal dialoogvenster.  
Bij fout: toont `NotificationWindow.ShowError(...)`.

---

### `Command.cs` – `ExportIFCCommand` (hoofd logica)

**Instellingen (via `VH > IFC Instellingen`, niet hardcoded):**
```
SupabaseUrl            = "https://<project-ref>.supabase.co"
SupabasePublishableKey = "<publishable-key>"
PluginAccessKey        = "<VH_REVIT_PLUGIN_KEY>"
```

**Stapsgewijze flow bij klikken op "Export IFC":**

```
Stap 1: Revit data verzamelen
        - Alle 3D views (geen templates)
        - Alle sheets (ViewSheet)

Stap 2: PluginClient aanmaken + configuratiecontrole
        → GET /functions/v1/revit-api/health (x-vh-plugin-key)
        → Bij fout: NotificationWindow fout, stop

Stap 3: Gebruiker authenticatie
        → Token laden uit auth.json (geldig tot Supabase expiry)
        → Geen token? → LoginWindow tonen
        → Bij annuleren: stop

Stap 4: Projecten ophalen
        → GET /functions/v1/revit-api/projects

Stap 5: SelectionWindow tonen
        - Gebruiker kiest project, prefix, view→sheet mappings
        - Logout knop beschikbaar

Stap 6: ProgressWindow openen

Stap 7: Loop over alle geselecteerde mappings:
  7a. IFC exporteren naar temp-bestand
      → ExportToIfc() → doc.Export() met IFCExportOptions
      → IFC versie uit SettingsManager (standaard: IFC4)
      
  7b. [Achtergrondthread]:
      - SHA-256 hash berekenen van IFC bestand
      - POST /functions/v1/revit-api/models/create → modelId
      - POST /functions/v1/revit-api/models/{id}/versions/upload-session
        → signed upload-URL, TUS-token en versionId
      - TUS upload in hervatbare chunks (signed PUT als compatibiliteitsfallback)
      - POST /functions/v1/revit-api/models/{id}/versions/{versionId}/complete
      - POST /functions/v1/revit-api/models/{id}/versions/{versionId}/share → viewerUrl
      - POST /functions/v1/revit-api/models/{id}/versions/{versionId}/qr → qrUrl

  7c. QR code downloaden (GET qrUrl) → PNG bytes
  7d. QR PNG opslaan in temp
  7e. Revit transactie: PlaceQrOnSheet()
  7f. Temp bestanden opruimen

Stap 8: ProgressWindow sluiten
Stap 9: ResultWindow tonen
```

**`ExportToIfc(doc, view, outputPath)`**
- Maakt `IFCExportOptions` aan.
- IFC versie uit `SettingsManager.Instance.IfcVersion` (IFC2x3 of IFC4).
- Filtert op de geselecteerde 3D view via `FilterViewId`.
- Roept `doc.Export(dir, filename, options)` aan.

**`PlaceQrOnSheet(doc, sheetId, imagePath, viewName)`**
- Leest QR-grootte (mm) en offset (mm) uit `SettingsManager`.
- Converteert mm naar feet (÷ 304.8) voor Revit API.
- Zoekt het titleblock op de sheet via `FilteredElementCollector`.
- Berekent exacte plaatsingspunt op basis van de gekozen hoek:
  - `BottomRight`: Max.X - margin - halfSize, Min.Y + margin + halfSize
  - `BottomLeft`: Min.X + margin + halfSize, Min.Y + margin + halfSize
  - `TopRight`:   Max.X - margin - halfSize, Max.Y - margin - halfSize
  - `TopLeft`:    Min.X + margin + halfSize, Max.Y - margin - halfSize
- Als er geen titleblock gevonden wordt: fallback naar `BoxPlacement`.
- Maakt een `ImageType` en `ImageInstance` aan.
- Probeert grootte in te stellen via:
  1. `RASTER_SYMBOL_WIDTH` / `RASTER_SYMBOL_HEIGHT` parameters op TYPE
  2. Dezelfde parameters op de INSTANCE (na `doc.Regenerate()`)
  3. Fallback: `Horizontal Scale` / `Vertical Scale` parameters

**`DoEvents()` / `ExitFrame()`**
- Houdt de WPF UI-draad responsive terwijl een achtergrondtaak loopt.
- Gebruikt een `DispatcherFrame` loop.

---

## 5. API CLIENT – `PluginClient.cs`

### Configuratie
- `HttpClient` met timeout **10 minuten**.
- TLS 1.2 + TLS 1.3 expliciet ingeschakeld.
- User-Agent: `VH-Revit-Plugin/2.0`
- Token opslag: `%APPDATA%\VH_IFC_Viewer\auth.json`

### Twee-laags authenticatie
| Laag | Methode | Endpoint | Token |
|------|---------|----------|-------|
| Installatie | `LoginPluginAsync()` | `GET /functions/v1/revit-api/health` | `x-vh-plugin-key` |
| Gebruiker | `LoginUserAsync(email, password)` | `/auth/v1/token?grant_type=password` | Supabase Auth JWT → `Authorization: Bearer` |

### Token persistentie
- `LoadToken()` – leest het DPAPI-versleutelde `auth.json` en controleert de Supabase expiry.
- `SaveToken(AuthData)` – schrijft de DPAPI-versleutelde sessie per Windows-gebruiker.
- `Logout()` – wist token in geheugen en verwijdert `auth.json`.

### Data klassen
```
ProjectInfo      { id, name, code }
UploadSessionInfo{ versionId, uploadUrl, uploadToken, tusEndpoint, storagePath, storageBucket }
ShareInfo        { token, viewerUrl }
AuthData         { Token, Username, Expiry (DateTime) }
```

### API methoden
| Methode | HTTP | Endpoint |
|---------|------|----------|
| `GetHealthAsync()` | GET | `/functions/v1/revit-api/health` |
| `LoginPluginAsync()` | GET | `/functions/v1/revit-api/health` |
| `LoginUserAsync()` | POST | `/auth/v1/token?grant_type=password` |
| `GetProjectsAsync()` | GET | `/functions/v1/revit-api/projects` |
| `CreateModelAsync()` | POST | `/functions/v1/revit-api/models/create` |
| `CreateUploadSessionAsync()` | POST | `/functions/v1/revit-api/models/{id}/versions/upload-session` |
| `UploadFileAsync()` | TUS/PATCH | Directe hervatbare upload naar Supabase Storage |
| `CompleteVersionAsync()` | POST | `/functions/v1/revit-api/models/{id}/versions/{versionId}/complete` |
| `CreateShareAsync()` | POST | `/functions/v1/revit-api/models/{id}/versions/{versionId}/share` |
| `GenerateQRAsync()` | POST | `/functions/v1/revit-api/models/{id}/versions/{versionId}/qr` |
| `DownloadQRAsync()` | GET | `{qrUrl}` → `byte[]` |

---

## 6. INSTELLINGEN – `SettingsManager.cs`

Singleton (`SettingsManager.Instance`) dat een `AppSettings` object beheert.

**Opgeslagen als:** `%APPDATA%\VH_IFC_Viewer\settings.json`

**`AppSettings` velden en standaardwaarden:**

| Veld | Type | Standaard | Beschrijving |
|------|------|-----------|--------------|
| `LastProjectId` | string | null | Laatste geselecteerde project-ID |
| `LastPrefix` | string | null | Laatste gebruikte IFC modelprefix |
| `QrSizeMm` | double | 50.0 | Grootte van de QR code in mm |
| `QrOffsetMm` | double | 10.0 | Afstand van de QR code tot de hoek in mm |
| `QrLocation` | string | "BottomRight" | Hoek: BottomRight / BottomLeft / TopRight / TopLeft |
| `IfcVersion` | string | "IFC4" | IFC versie: IFC2x3 / IFC4 |
| `ExportOnlyVisible` | bool | true | Alleen zichtbare elementen exporteren |

- **`Load()`** – wordt automatisch aangeroepen bij eerste gebruik (statische constructor). Leest JSON en deserialiseert naar `AppSettings`. Bij fout: standaardwaarden.
- **`Save()`** – serialiseert `Instance` naar geïndenteerde JSON en schrijft weg.

---

## 7. WINDOWS (UI)

Alle windows gebruiken `WindowStyle="None"` + `AllowsTransparency="True"` voor een eigen custom look zonder Windows titelbar. Verslepen wordt mogelijk gemaakt via `MouseLeftButtonDown` = `DragMove()`.

---

### 7a. `SelectionWindow` (680×730 px)
**Doel:** Gebruiker selecteert project, IFC prefix en view→sheet mappings.

**XAML design keuzes:**
- Achtergrond: `#FFFFFF` met `DropShadowEffect` (blur 15, opacity 0.15).
- `CornerRadius="12"` op de buitenste `Border`.
- Herschikbare kolommen via een `DataGrid`.

**Stijlen (Window.Resources):**

| Stijl | Kleur | Gebruik |
|-------|-------|---------|
| `PrimaryButtonStyle` | `#4F46E5` (indigo) → hover `#4338CA` → pressed `#3730A3` | "Uitvoeren" knop |
| `SecondaryButtonStyle` | Wit met grijze rand → hover `#F3F4F6` | "Annuleren" knop |
| `ComboBox` | Aangepaste template met pijl `#6B7280` en popup `#E5E7EB` | Dropdowns |
| `TextBox` | `CornerRadius="6"`, rand `#E5E7EB` | Prefix veld |
| `Label` | `FontWeight=SemiBold`, `#374151`, 14px | Veldlabels |
| `CheckBox` | Grijs, gecentreerd | Rijselectie |

**Layout (4 rijen):**
1. **Header** – Draggable. Left: "VH Engineering" + subtitle. Right: ingelogde gebruiker + uitloglink.
2. **Project + Prefix** – ComboBox (projecten) + TextBox (IFC prefix), 2:1 breedte verhouding.
3. **DataGrid** – View→Sheet mappings. Kolommen:
   - Selectie checkbox (50px) – inclusief "selecteer alles" in header
   - 3D View naam (tekst, *)
   - Pijl → (40px)
   - Sheet selectie ComboBox (2*)
4. **Footer** – Lichtgrijs vlak. Left: samenvatting ("X views geselecteerd"). Right: Annuleren + Uitvoeren buttons.

**Code-behind sleutellogica:**
- `ViewSheetMapping` – datamodel met `IsSelected`, `View`, `ViewName`, `SelectedSheet`, `AllSheets`.
- Constructor: bouwt lijst van alle views + sheets, probeert automatisch een sheet te koppelen op naam.
- `LoadSettings()` / `SaveSettings()` – herinnert laatste project en prefix.
- `UpdateSummary()` – update footer tekst + activeert/deactiveert Uitvoeren knop + waarschuwt bij ontbrekende sheets.
- `BtnExport_Click()` – validatie (project, prefix, alle sheets ingevuld), daarna `DialogResult = true`.

---

### 7b. `IfcSettingsWindow` (420×540 px)
**Doel:** Gebruiker configureert QR en IFC exportopties.

**XAML design keuzes:**
- Font: `Segoe UI`.
- Achtergrond: `#FFFFFF` met `DropShadowEffect`, `CornerRadius="12"`.

**Stijlen (Window.Resources):**

| Stijl | Kleur | Gebruik |
|-------|-------|---------|
| `RoundedButtonStyle` | `#3498DB` (blauw) → hover `#2980B9` | "Opslaan" knop |
| `SecondaryButtonStyle` | Wit met `#BDC3C7` rand → hover `#ECF0F1` | "Annuleren" knop |
| `TextBox` | `CornerRadius="8"`, focus highlight `#3498DB` 1.5px | Getal invoervelden |
| `ComboBox` | `CornerRadius="8"`, pijl `#2C3E50` | Dropdown keuzes |

**Velden:**
1. **QR Code Grootte (mm)** – TextBox (`txtQrSize`), default 50
2. **QR Afstand naar hoek (mm)** – TextBox (`txtQrOffset`), default 10
3. **QR Locatie op Sheet** – ComboBox:
   - Rechtsonder (tag: `BottomRight`)
   - Linksonder (tag: `BottomLeft`)
   - Rechtsboven (tag: `TopRight`)
   - Linksboven (tag: `TopLeft`)
4. **IFC Versie** – ComboBox:
   - IFC4 (tag: `IFC4`)
   - IFC2x3 (tag: `IFC2x3`)
   - IFC4 RV (tag: `IFC4RV`)
5. **Alleen zichtbare elementen exporteren** – CheckBox (`chkVisibleOnly`), default true

**Code-behind:**
- `LoadSettingsToUI()` – vult velden vanuit `SettingsManager.Instance`.
- `BtnSave_Click()` – parseert getallen met `InvariantCulture` (komma en punt beide toegestaan), schrijft naar `SettingsManager.Instance`, roept `SettingsManager.Save()` aan.

---

### 7c. `LoginWindow` (440×520 px)
**Doel:** Gebruiker logt in met e-mailadres + wachtwoord via Supabase Auth.

**XAML:**
- Font: `Segoe UI`. Header: "VH Engineering" + "Inloggen om te exporteren".
- Inlogknop: `#3498DB` met blauwe `DropShadowEffect`.
- Statuslabel (`lblStatus`): rood bij fout, groen bij succes.

**Code-behind:**
- `BtnLogin_Click()` (async) – roept `PluginClient.LoginUserAsync()` aan.
  - Succes: 500ms delay (om "Succesvol ingelogd!" te tonen), `DialogResult = true`.
  - Fout (ongeldige credentials): rode foutmelding.
  - Fout (exception): rode foutmelding met details.

---

### 7d. `NotificationWindow` (380×200 px)
**Doel:** Vervangt `TaskDialog.Show`. Toont info, waarschuwing of foutmelding.

**XAML:** Icoon + titel + bericht + OK-knop (`#1e3a5f` donkerblauw).

**Typen (`NotificationType` enum):**

| Type | Icoon | Titel |
|------|-------|-------|
| Info | ℹ️ | Informatie |
| Warning | ⚠️ | Let op |
| Error | ❌ | Er ging iets mis |

**Statische hulpmethoden (korte aanroep):**
```csharp
NotificationWindow.ShowError("...");
NotificationWindow.ShowInfo("...");
NotificationWindow.ShowWarning("...");
```

---

### 7e. `ProgressWindow` (420×160 px)
**Doel:** Toont voortgang tijdens export/upload loop.

**XAML:**
- Header: "Even geduld..." (ook draggable).
- `TextBlock` (`lblMessage`) – huidige stap in woorden.
- `ProgressBar` (`progressBar`) – indigo `#4F46E5`, `CornerRadius="4"`.

**Code-behind:**
- `Update(message, percent)` – update via `Dispatcher.BeginInvoke()` op de UI thread zodat UI niet blokkeert.

---

### 7f. `ResultWindow` (500×350 px)
**Doel:** Toont een lijst van succesvol geëxporteerde modellen na voltooiing.

**XAML:**
- Header: "Klaar!" + "De export is succesvol voltooid."
- `ItemsControl` met lijst (opsommingsteken `•` in indigo `#4F46E5`).
- Twee knoppen: "Sluiten" (secundair) + "Ga naar Project" (primair indigo `#4F46E5`).

**Code-behind:**
- "Ga naar Project" opent `https://vh-ifc-viewer.vercel.app/admin.html#/projects` in de browser.

---

## 8. KLEURPALET SAMENVATTING

| Kleur | Hex | Gebruik |
|-------|-----|---------|
| Indigo primair | `#4F46E5` | Primaire knoppen, voortgangsbalk, opsomming |
| Indigo hover | `#4338CA` | Knop hover state |
| Indigo pressed | `#3730A3` | Knop ingedrukt state |
| Blauw (settings) | `#3498DB` | Knoppen in instellingen/login |
| Donkerblauw (notif) | `#1e3a5f` | OK knop in NotificationWindow |
| Tekst primair | `#111827` | Titels, koppen |
| Tekst secundair | `#374151` | Body tekst, labels |
| Tekst grijs | `#6B7280` | Subtitels, hints |
| Random grid grijs | `#64748B` | DataGrid kolomkoppen |
| Achtergrond licht | `#F8FAFC` | DataGrid kolomheader achtergrond |
| Rand grijs | `#E5E7EB` / `#CBD5E1` | Randen van vensters en controls |
| Fout rood | `#DC2626` | Foutmeldingen in login |

---

## 9. ICONEN

Drie PNG iconen in de plugin map (naast de DLL):

| Bestand | Grootte | Gebruik |
|---------|---------|---------|
| `icon_export.png` | 1.4 KB | Ribbon: "Export IFC" knop |
| `icon_admin.png` | 1.4 KB | Ribbon: "Admin Dashboard" knop |
| `icon_settings.png` | 2.1 KB | Ribbon: "IFC Settings" knop |

Worden geladen via `BitmapImage` met `CacheOption.OnLoad` (zodat het bestand direct vrijgegeven wordt).

---

## 10. BUILD CONFIGURATIE (`VH_IFC_QR.csproj`)

| Instelling | Waarde |
|------------|--------|
| Target Framework | `net8.0-windows` |
| WPF | `true` |
| Windows Forms | `true` |
| Platform | `x64` |
| Language Version | `latest` |
| NuGet: Revit API | `Revit_All_Main_Versions_API_x64` v2025.0.* (ExcludeAssets: runtime) |
| NuGet: JSON | `Newtonsoft.Json` v13.0.3 |
| Debug output | `bin\Debug\` |
| Release output | `bin\Release\` (geoptimaliseerd) |

---

## 11. COMPLETE FLOW DIAGRAM

```
Revit opstart
└── App.OnStartup()
    └── Ribbon Tab "VH" + Panel "Tools" + 3 knoppen

Klik "Export IFC"
└── ExportIFCCommand.Execute()
    ├── PluginClient aanmaken
    ├── LoginPluginAsync() → health-check met installatiekey
    ├── LoadToken() → user JWT (of LoginWindow)
    ├── GetProjectsAsync() → lijst projecten
    ├── SelectionWindow.ShowDialog()
    │   └── Gebruiker kiest: project + prefix + views + sheets
    ├── ProgressWindow.Show()
    └── Foreach mapping:
        ├── ExportToIfc() → .ifc temp bestand
        ├── [Achtergrond Task]:
        │   ├── GetSha256() → checksum
        │   ├── CreateModelAsync() → modelId
        │   ├── CreateUploadSessionAsync() → uploadUrl + TUS-token + versionId
        │   ├── UploadFileAsync() → bestand naar storage
        │   ├── CompleteVersionAsync()
        │   ├── CreateShareAsync() → viewerUrl
        │   └── GenerateQRAsync() → qrUrl
        ├── DoEvents() (UI responsive houden)
        ├── DownloadQRAsync() → PNG bytes
        └── PlaceQrOnSheet() [Revit Transaction]
            ├── ImageType aanmaken
            ├── TitleBlock BoundingBox ophalen
            ├── Plaatsingspunt berekenen (hoek + marge)
            └── ImageInstance plaatsen + grootte zetten

    ├── ProgressWindow.Close()
    └── ResultWindow.ShowDialog()
        └── Knop "Ga naar Project" → browser opent admin URL

Klik "Admin Dashboard"
└── AdminCommand.Execute()
    └── Browser opent https://vh-ifc-viewer.vercel.app/admin.html#/login

Klik "IFC Settings"
└── IfcSettingsCommand.Execute()
    └── IfcSettingsWindow.ShowDialog()
        └── Opslaan → SettingsManager.Save() → settings.json
```

---

## 12. PERSISTERINGSLOCATIES

| Wat | Pad |
|-----|-----|
| Instellingen | `%APPDATA%\VH_IFC_Viewer\settings.json` |
| Auth token | `%APPDATA%\VH_IFC_Viewer\auth.json` |
| IFC temp export | `%TEMP%\{modelName}.ifc` (verwijderd na upload) |
| QR PNG temp | `%TEMP%\{modelId}_{ticks}_qr.png` (verwijderd na plaatsing) |
| DLL + iconen | `%APPDATA%\Autodesk\Revit\Addins\2025\VH_IFC_QR\` |
