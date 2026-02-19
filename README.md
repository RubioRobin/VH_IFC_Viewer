# VH IFC Viewer

Een volledig IFC 3D-viewersysteem voor het bekijken, beheren en delen van BIM-modellen. Het systeem bestaat uit een webapplicatie (frontend + backend) en een Revit add-in.

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
│   ├── backend/        → Node.js/Express API (draait op Render.com)
│   └── frontend/       → Vite/React/TypeScript viewer (draait op Vercel)
├── RevitPlugin/        → C# Revit add-in (lokaal geïnstalleerd)
├── addin/              → Revit addin-manifest bestanden
└── scripts/            → Hulpscripts voor deployment
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

### 2. Backend instellen

```bash
cd src/backend
npm install
```

Maak een `.env` bestand aan op basis van het template:

```bash
copy .env.template .env
```

Vul alle waarden in `.env` in (zie commentaar in het bestand voor uitleg).

### 3. Frontend instellen

```bash
cd src/frontend
npm install
```

Maak een `.env.local` bestand aan:

```bash
VITE_API_URL=http://localhost:3001
```

---

## Gebruik

### Backend starten (ontwikkeling)

```bash
cd src/backend
npm run dev
```

De backend draait op `http://localhost:3001`.

### Frontend starten (ontwikkeling)

```bash
cd src/frontend
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

## Omgevingsvariabelen

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

1. Bouw het project in Visual Studio (Release configuratie)
2. Kopieer de bestanden uit `RevitPlugin/publish/` naar:
   ```
   %AppData%\Autodesk\Revit\Addins\2024\
   ```
3. Kopieer `addin/VH_IFC_QR.addin` naar dezelfde map
4. Herstart Revit

---

## Deployment

### Backend (Render.com)
- Configureer omgevingsvariabelen via Render dashboard
- Buildcommando: `cd src/backend && npm install`
- Startcommando: `cd src/backend && node app.js`

### Frontend (Vercel)
- Root directory: `src/frontend`
- Buildcommando: `npm run build`
- Output directory: `dist`
- Voeg omgevingsvariabele toe: `VITE_API_URL=<jouw-render-url>`

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
- Controleer of alle omgevingsvariabelen in `.env` zijn ingevuld
- Controleer of `SESSION_SECRET` is ingesteld
- Bekijk de consolelogs voor specifieke foutmeldingen

### IFC-model laadt niet in de viewer
- Controleer of `VITE_API_URL` correct is ingesteld
- Controleer of de backend bereikbaar is via de health endpoint: `GET /api/health`
- Controleer of het Supabase bucket `ifc-models` bestaat en de juiste rechten heeft

### Revit plugin werkt niet
- Controleer of het `.addin` bestand in de juiste Revit-map staat
- Controleer of `PLUGIN_CLIENT_ID` en `PLUGIN_CLIENT_SECRET` overeenkomen in de plugin en backend
- Controleer of de backend bereikbaar is via het ingestelde serveradres

### QR-code scan werkt niet op mobiel
- Controleer of `VIEWER_URL` de correcte publieke URL is (geen localhost)
- Zorg dat de backend CORS toestaat voor de frontend URL
