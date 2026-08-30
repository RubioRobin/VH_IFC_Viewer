# VH IFC Viewer

Een IFC 3D-viewersysteem voor het bekijken, beheren en delen van BIM-modellen. Revit-export, adminportaal en publieke viewer gebruiken rechtstreeks Supabase Auth, Edge Functions en Storage. De Express-backend is alleen nog bewaarde legacycode en wordt niet naar productie gedeployed.

---

## Functionaliteit

- **3D IFC-viewer** — laad en bekijk IFC-modellen in de browser via QR-code of directe link
- **Admin dashboard** — beheer projecten, bestanden en gebruikers
- **Revit add-in** — exporteer modellen rechtstreeks vanuit Revit, genereer QR-codes en upload naar de cloud
- **Deellinks** — genereer openbare links en QR-codes voor gedeeld gebruik op mobiel
- **Activiteitslog** — bijhouden wie wanneer welk model heeft bekeken of geüpload

---

## Architectuur

```
VH_IFC_Viewer/
├── src/
├── backend/             → Legacy Node.js/Express API; geen productieonderdeel
├── frontend/            → Vite/React/TypeScript viewer (Vercel)
├── addin/               → C# Revit add-in
└── supabase/            → Edge Functions, migraties en Storage-configuratie
```

---

## Installatie

### Vereisten

- [Node.js](https://nodejs.org/) v18 of hoger
- [npm](https://www.npmjs.com/) v9 of hoger
- Een [Supabase](https://supabase.com/) project (gratis tier volstaat)

### 1. Repository klonen

```bash
git clone <repository-url>
cd VH_IFC_Viewer
```

### 2. Directe Revit/Supabase-koppeling instellen

```bash
Zie `docs/SUPABASE_DIRECTE_KOPPELING.md`. Dit is de actieve route voor
Revit-export, QR-codes en de publieke viewer.
```

### 3. Frontend instellen

```bash
cd frontend
npm install
```

Maak een `.env.local` bestand aan voor de viewer:

```bash
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

---

## Gebruik

### Legacy Express-backend starten (alleen voor regressieonderzoek)

```bash
cd backend
npm run dev
```

De backend draait op `http://localhost:3001`.

### Frontend starten (ontwikkeling)

```bash
cd frontend
npm run dev
```

De frontend draait op `http://localhost:5173`.

### Of via de root (beide tegelijk)

```bash
# Installeer alles
npm run install:all

# Backend starten
npm run dev:backend

# Frontend starten (apart terminal)
npm run dev:frontend
```

---

## Omgevingsvariabelen voor de legacy Express-backend

Deze variabelen zijn **niet** nodig voor het actieve adminportaal, Revit-export,
QR-codes of de publieke IFC-viewer. Zie voor de actieve route
`docs/SUPABASE_DIRECTE_KOPPELING.md`.

| Variabele | Beschrijving | Vereist |
|---|---|---|
| `PORT` | Poort voor de backend | Nee (standaard 3001) |
| `NODE_ENV` | `development` of `production` | Ja |
| `FRONTEND_URL` | URL van de frontend (CORS) | Ja |
| `VIEWER_URL` | URL van de viewer (QR generatie) | Ja |
| `SUPABASE_URL` | URL van je Supabase project | Ja |
| `SUPABASE_KEY` | Supabase anon key | Ja |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | Ja |
| `SESSION_SECRET` | Willekeurige string voor sessies | **Ja (productie)** |
| `JWT_SECRET` | Geheim voor JWT tokens (plugin) | **Ja (productie)** |
| `PLUGIN_CLIENT_ID` | Client ID voor Revit plugin | Ja |
| `PLUGIN_CLIENT_SECRET` | Client secret voor Revit plugin | **Ja (productie)** |
| `ADMIN_API_KEY` | API-sleutel voor admin toegang | Ja |

---

## Revit Plugin Installeren

1. Bouw `addin/VH_IFC_QR.csproj` voor Revit 2025.
2. Kopieer de output uit `addin/bin/Release/net8.0-windows/` naar:
   ```
   %AppData%\Autodesk\Revit\Addins\2025\
   ```
3. Registreer de add-in met `addin/VH_IFC_QR.addin` of gebruik het
   buildtarget dat de manifest en DLL automatisch naar Revit kopieert.
4. Herstart Revit

---

## Deployment

### Supabase (admin, Revit en publieke viewer)
- Zie `docs/SUPABASE_DIRECTE_KOPPELING.md` voor de migration, Edge Function secrets en deployment.

### Frontend (Vercel)
- Root directory: `frontend`
- Buildcommando: `npm run build`
- Output directory: `dist`
- Voeg `VITE_SUPABASE_URL` en `VITE_SUPABASE_PUBLISHABLE_KEY` toe. Een bestaand
  `VITE_SUPABASE_ANON_KEY` blijft compatibel tijdens de key-migratie.
- Met Root Directory `frontend` is `frontend/vercel.json` de geldende
  configuratie voor de `/v/<share-token>` SPA-route. De root `vercel.json` is
  uitsluitend bedoeld voor een project dat bewust vanaf repository-root bouwt.

---

## Afhankelijkheden

### Backend
| Package | Versie | Doel |
|---|---|---|
| express | ^4.18 | Web framework |
| @supabase/supabase-js | ^2.95 | Database & opslag |
| bcryptjs | ^2.4 | Wachtwoord hashing |
| jsonwebtoken | ^9.0 | JWT authenticatie |
| express-session | ^1.18 | Sessie beheer |
| helmet | ^8.1 | Beveiligingsheaders |
| xss-clean | ^0.1 | XSS bescherming |
| qrcode | ^1.5 | QR-code generatie |
| uuid | ^9.0 | Unieke IDs |

### Frontend
| Package | Versie | Doel |
|---|---|---|
| @thatopen/components | ~3.2 | IFC viewer engine |
| three | 0.175 | 3D rendering |
| react | ^19 | UI framework |
| react-router-dom | ^7 | Routing |
| vite | ^7 | Build tool |

---

## Probleemoplossing

### Backend start niet
- Deze service is niet nodig voor de productieapp
- Controleer of alle omgevingsvariabelen in `.env` zijn ingevuld
- Controleer of `SESSION_SECRET` is ingesteld
- Bekijk de consolelogs voor specifieke foutmeldingen

### IFC-model laadt niet in de viewer
- Controleer `VITE_SUPABASE_URL` en `VITE_SUPABASE_PUBLISHABLE_KEY`
- Controleer de Revit health-check uit `docs/SUPABASE_DIRECTE_KOPPELING.md`
- Controleer of `ifc-models` bestaat en de uploadstatus `uploaded` is

### Revit plugin werkt niet
- Controleer of het `.addin` bestand in de juiste Revit-map staat
- Controleer in `VH > IFC Instellingen` de Supabase URL, publishable key en Revit toegangssleutel
- Controleer of de gebruiker bestaat in Supabase Auth

### QR-code scan werkt niet op mobiel
- Controleer of `VH_VIEWER_URL` in Supabase secrets de correcte publieke Vercel URL is
204: 
205: <!-- Deployment trigger -->
