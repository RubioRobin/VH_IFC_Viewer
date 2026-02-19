# Technische Overdracht — VH IFC Viewer

**Project:** VH IFC Viewer  
**Opgesteld:** 19 februari 2026  
**Technologie:** Node.js, Express, Supabase, Vite, React, TypeScript, C# (.NET), Revit API

---

## 1. Architectuuroverzicht

Het systeem bestaat uit drie losstaande componenten die communiceren via HTTP-API's en gedeelde Supabase-opslag:

```
┌─────────────────────────────────────────┐
│              Revit Add-in               │
│  (C#/.NET, draait lokaal in Revit)      │
│                                         │
│  • Export IFC → upload naar Supabase    │
│  • Login via JWT                        │
│  • Genereer QR-code → sla op Supabase   │
└──────────────────┬──────────────────────┘
                   │ HTTPS REST
                   ▼
┌─────────────────────────────────────────┐
│              Node.js Backend            │
│  (Express, draait op Render.com)        │
│                                         │
│  • Authenticatie (sessie + JWT)         │
│  • Projecten & bestandenbeheer         │
│  • Supabase Storage signed URLs         │
│  • QR & deellink generatie              │
└──────────────┬────────────────┬─────────┘
               │                │
    REST API   │                │ Supabase JS
               ▼                ▼
┌──────────────────┐  ┌─────────────────────┐
│  React Frontend  │  │   Supabase Cloud     │
│  (Vercel)        │  │                      │
│                  │  │  • PostgreSQL DB      │
│  • Admin-panel   │  │  • Storage buckets   │
│  • IFC-viewer    │  │  • Row Level Security│
│  • Deelviewer    │  │                      │
└──────────────────┘  └─────────────────────┘
```

---

## 2. Datastromen

### Revit Export Flow
1. Gebruiker klikt op "Exporteren" in Revit add-in
2. Add-in logt in op `/api/plugin/login` → ontvangt JWT
3. Add-in logt gebruiker in op `/api/plugin/user-login` → ontvangt gebruikers-JWT
4. Add-in maakt model aan op `/api/plugin/models/create`
5. Add-in vraagt upload-sessie op → ontvangt ondertekende Supabase upload-URL
6. Add-in uploadt IFC-bestand rechtstreeks naar Supabase Storage
7. Add-in maakt deellink aan → ontvangt `shareToken`
8. Add-in genereert QR-code met viewer-URL (`/v/{shareToken}`)
9. QR-code wordt opgeslagen in Supabase bucket `qr-public`

### Viewer Load Flow (via QR)
1. Gebruiker scant QR → browser opent `https://viewer.url/v/{shareToken}`
2. Frontend haalt modelinfo op via `/api/share/{shareToken}`
3. Backend genereert ondertekende Supabase download-URL (15 min geldig)
4. Frontend downloadt IFC-bestand direct van Supabase Storage
5. Three.js/OpenBIM laadt en rendert het model

---

## 3. Modulebeschrijvingen

### Backend (`src/backend/`)

| Bestand/Map | Beschrijving |
|---|---|
| `app.js` | Entry point: middleware, CORS, routes, server start |
| `database.js` | Initialiseert Supabase client, exporteert alle services |
| `routes/auth.js` | Login, logout, gebruikersprofiel, sessie-verificatie |
| `routes/plugin.js` | JWT-gebaseerde API voor Revit add-in (modellen, versies, QR) |
| `routes/projects.js` | CRUD voor projecten en modellenlijst |
| `routes/files.js` | Bestandsbeheer, download-redirect |
| `routes/share.js` | Publieke deellink ophalen (nieuwe + legacy) |
| `routes/public.js` | Legacy publieke IFC download endpoints |
| `routes/qr.js` | QR-code opslag en beheer |
| `routes/upload.js` | Directe bestandsupload via admin interface |
| `routes/stats.js` | Statistieken voor dashboard |
| `routes/users.js` | Gebruikersbeheer |
| `routes/admin.js` | Admin-functies |
| `routes/debug.js` | Debugtools (beveiligd met auth) |
| `services/activity.service.js` | Activiteitslog schrijven en lezen |
| `services/files.service.js` | Bestanden in Supabase opslaan/ophalen |
| `services/projects.service.js` | Project CRUD via Supabase |
| `services/qr.service.js` | QR-codes, deellinks en versies |
| `services/users.service.js` | Gebruikersauthenticatie |

### Frontend (`src/frontend/src/`)

| Bestand/Map | Beschrijving |
|---|---|
| `main.ts` | IFC viewer initialisatie, model laden, camera, tools |
| `config.ts` | API endpoint configuratie |
| `style.css` | Globale stijlen |
| `pages/` | Paginacomponenten (Dashboard, Projects, Files, etc.) |
| `components/` | Herbruikbare UI-componenten |
| `viewer/alignment.ts` | Modeluitlijning op raster |
| `viewer/transparency-manager.ts` | Doorzichtigheid van elementen |
| `ui-templates/` | BIM UI-sjablonen |
| `hooks/` | React hooks |
| `lib/` | Hulpfuncties |

### Revit Plugin (`RevitPlugin/`)

| Bestand | Beschrijving |
|---|---|
| `Command.cs` | Hoofdcommando: exporteren en QR plaatsen |
| `PluginClient.cs` | HTTP-client voor backend API communicatie |
| `SelectionWindow.xaml` | Projectselectie UI |
| `LoginWindow.xaml` | Inlogvenster |
| `IfcSettingsWindow.xaml` | Exportinstellingen |
| `ProgressWindow.xaml` | Voortgangsindicator |
| `ResultWindow.xaml` | Resultaatscherm |
| `SettingsManager.cs` | Opslaan van instellingen |
| `App.cs` | Revit ExternalApplication |

---

## 4. Authenticatiesysteem

Het systeem gebruikt **twee aparte authenticatiestromen**:

### Admin-dashboard (sessie-gebaseerd)
- Login via `/api/auth/login`
- Express-sessie opgeslagen in server-geheugen
- Cookie met `httpOnly`, `secure` (productie) en `sameSite: none`

### Revit Plugin (JWT-gebaseerd)
- Plugin logt in als service account via `/api/plugin/login`
- Gebruiker logt in via `/api/plugin/user-login`
- JWT geldig voor 1 uur (plugin) of 7 dagen (gebruiker)
- JWT meegestuurd als `Authorization: Bearer <token>` en `X-User-Token`

---

## 5. Supabase Database Structuur

Tabellen (aangemaakt via migraties in `src/backend/migrations/`):

| Tabel | Beschrijving |
|---|---|
| `users` | Admingebruikers met gehashte wachtwoorden |
| `projects` | Bouwprojecten |
| `files` | Geüploade IFC-bestanden |
| `models` | Modellen (Revit plugin flow) |
| `model_versions` | Versies van een model met Supabase storage path |
| `shares` | Deellinks gekoppeld aan model versies |
| `public_links` | Legacy publieke links |
| `qr_assets` | QR-code metadata |
| `activity_log` | Activiteiten (uploads, scans, etc.) |

### Storage Buckets

| Bucket | Inhoud | Toegang |
|---|---|---|
| `ifc-models` | IFC-bestanden (admin uploads) | Privé + signed URLs |
| `revit_exports` | IFC via Revit plugin | Privé + signed URLs |
| `qr-public` | QR-code afbeeldingen | Publiek |

---

## 6. Uitbreidingspunten

### Nieuwe bestandsformaten toevoegen
- Pas `IfcLoader.setup()` aan in `main.ts` voor extra formaten
- Voeg bestandstype-validatie toe in `routes/upload.js`

### Meerdere gebruikersrollen
- Voeg een `role` kolom toe aan de `users` tabel
- Implementeer rolgebaseerde middleware in `routes/auth.js`
- Pas frontend-navigatie aan op basis van rol

### Notificaties/e-mails
- Gebruik Supabase Edge Functions of een externe dienst (SendGrid)
- Koppel aan de activiteitslog events in `services/activity.service.js`

### Offline viewer
- Sla IFC bestanden op als IndexedDB cache in de browser
- Gebruik de Web IFC WASM voor lokale rendering

---

## 7. Risico's en bekende beperkingen

### 🔴 Kritiek
- **Supabase sleutels al gecommit**: Historische git commits kunnen de service role key bevatten. **Draai alle keys in het Supabase dashboard.**
- **Sessies in-memory**: Bij herstarten van de backend verliezen alle gebruikers hun sessie. Productie-aanbeveling: gebruik Redis of `connect-pg-simple` voor sessieopslag.

### 🟡 Belangrijk
- **Mock upload endpoint**: `POST /api/projects/:id/models/:modelId/revisions/:revId/upload` retourneert altijd mock-succes. Dit endpoint is niet geïmplementeerd.
- **Ondertekende URLs verlopen**: Supabase signed URLs zijn standaard 60 seconden geldig. De `expiresAt` in de sharerespons (15 min) klopt niet met de werkelijke Supabase expiry.
- **QR-codes opgeslagen in publieke bucket**: Iedereen met de URL kan de QR-code afbeelding zien. Dit is gewenst gedrag maar moet worden gedocumenteerd.

### 🟢 Aandachtspunten
- **Web IFC WASM versie**: De frontend gebruikt WASM van unpkg.com. Bij versie-updates kan dit breken.
- **Frontend session persistence**: Admin-sessies verlopen na 24 uur; bij sessieverloop moet de gebruiker opnieuw inloggen.
- **Rate limiting**: Er is geen request rate limiting geïmplementeerd. Overweeg `express-rate-limit` voor productie.

---

## 8. Advies voor toekomstige developers

1. **Roteer direct alle Supabase API-sleutels** in het Supabase dashboard als je dit project overneemt.

2. **Gebruik environment variables via Render dashboard** — nooit oplaan in `render.yaml` of andere gecommitte bestanden.

3. **Implementeer sessiepersistentie**: Vervang de in-memory sessie-opslag door een database-backed sessie (bijv. Supabase of Redis).

4. **Voeg rate limiting toe**: Bescherm de login-endpoints tegen brute-force aanvallen met `express-rate-limit`.

5. **Automatische tests**: Er zijn momenteel geen geautomatiseerde tests. Begin met integratietests voor de kritieke API-endpoints (login, share, download).

6. **Mock endpoint implementeren**: Het upload-endpoint in `projects.js` is een mock. Implementeer dit als handmatige uploads via het admin-dashboard gewenst zijn.

7. **Monitoring**: Voeg applicatiemonitoring toe (bijv. Sentry) voor productie-foutopsporing.
