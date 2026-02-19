# Project Structuur — VH IFC Viewer

Bijgewerkt: 19 februari 2026

---

## Boomstructuur

```
VH_IFC_Viewer/
│
├── 📄 README.md                        ← Projectoverzicht en installatiegids
├── 📄 TECHNISCHE_OVERDRACHT.md         ← Architectuur, risico's, aanbevelingen
├── 📄 PROJECT_STRUCTUUR.md             ← Dit bestand
├── 📄 package.json                     ← Root scripts (start, install:all, etc.)
├── 📄 .gitignore                       ← Git-uitsluitingen
├── 📄 render.yaml                      ← Render.com deployment configuratie
├── 📄 Procfile                         ← Heroku startcommando (legacy)
│
├── 📁 src/                             ← Broncode (backend + frontend)
│   │
│   ├── 📁 backend/                     ← Node.js/Express API server
│   │   ├── 📄 app.js                   ← Entry point: middleware, routes, server
│   │   ├── 📄 database.js              ← Supabase client + service exports
│   │   ├── 📄 setup-storage.js         ← Hulpscript: Supabase buckets aanmaken
│   │   ├── 📄 package.json             ← Backend afhankelijkheden
│   │   ├── 📄 .env.template            ← Template voor omgevingsvariabelen
│   │   ├── 📄 .env.example             ← Alternatief voorbeeld (verouderd)
│   │   ├── 📄 REVIT_API_GUIDE.md       ← Plugin API documentatie
│   │   ├── 📄 REVIT_INTEGRATION_GUIDE.md ← Plugin integratiegids
│   │   │
│   │   ├── 📁 routes/                  ← Express route handlers
│   │   │   ├── 📄 auth.js              ← Authenticatie (login/logout/profiel)
│   │   │   ├── 📄 plugin.js            ← Revit plugin JWT-API
│   │   │   ├── 📄 projects.js          ← Projecten CRUD
│   │   │   ├── 📄 files.js             ← Bestandenbeheer & downloads
│   │   │   ├── 📄 upload.js            ← Admin bestandsupload
│   │   │   ├── 📄 share.js             ← Publieke deellinks
│   │   │   ├── 📄 public.js            ← Legacy publieke IFC endpoints
│   │   │   ├── 📄 qr.js                ← QR-code beheer
│   │   │   ├── 📄 users.js             ← Gebruikersbeheer
│   │   │   ├── 📄 admin.js             ← Admin functies
│   │   │   ├── 📄 stats.js             ← Statistieken
│   │   │   └── 📄 debug.js             ← Debug tools (beveiligd)
│   │   │
│   │   ├── 📁 services/                ← Business logica (Supabase queries)
│   │   │   ├── 📄 activity.service.js  ← Activiteitslog
│   │   │   ├── 📄 files.service.js     ← Bestanden CRUD + signed URLs
│   │   │   ├── 📄 projects.service.js  ← Projecten CRUD
│   │   │   ├── 📄 qr.service.js        ← QR, shares, model versies
│   │   │   └── 📄 users.service.js     ← Gebruikers authenticatie
│   │   │
│   │   ├── 📁 middleware/              ← Express middleware
│   │   ├── 📁 migrations/              ← Database migraties (SQL)
│   │   ├── 📁 data/                    ← Lokale data bestanden
│   │   ├── 📁 uploads/                 ← Runtime: geüploade bestanden (niet in git)
│   │   └── 📁 qr-codes/               ← Runtime: lokale QR opslag (niet in git)
│   │
│   └── 📁 frontend/                    ← Vite/React/TypeScript webapp
│       ├── 📄 index.html               ← HTML entry point (viewer)
│       ├── 📄 admin.html               ← HTML entry point (admin)
│       ├── 📄 package.json             ← Frontend afhankelijkheden
│       ├── 📄 vite.config.ts           ← Vite build configuratie
│       ├── 📄 tsconfig.json            ← TypeScript configuratie
│       ├── 📄 tailwind.config.js       ← Tailwind CSS configuratie
│       ├── 📄 .eslintrc.cjs            ← ESLint regels
│       ├── 📄 .gitignore               ← Frontend git-uitsluitingen
│       ├── 📄 vercel.json              ← Vercel deployment configuratie
│       ├── 📄 api.ts                   ← Gedeelde API functies
│       ├── 📄 ui.ts                    ← UI hulpfuncties
│       │
│       ├── 📁 public/                  ← Statische bestanden (favicon, etc.)
│       │
│       └── 📁 src/                     ← TypeScript broncode
│           ├── 📄 main.ts              ← IFC viewer initialisatie
│           ├── 📄 config.ts            ← API configuratie
│           ├── 📄 globals.ts           ← Globale TypeScript definities
│           ├── 📄 style.css            ← Globale stijlen
│           ├── 📄 admin.tsx            ← Admin app entry
│           ├── 📄 vite-env.d.ts        ← Vite TypeScript types
│           │
│           ├── 📁 pages/               ← Paginacomponenten
│           │   ├── Dashboard.tsx       ← Overzichtspagina
│           │   ├── Projects.tsx        ← Projectenlijst
│           │   ├── ProjectDetail.tsx   ← Projectdetails
│           │   ├── Files.tsx           ← Bestandenbeheer
│           │   ├── Users.tsx           ← Gebruikersbeheer
│           │   ├── Settings.tsx        ← Instellingen
│           │   ├── Login.tsx           ← Inlogpagina
│           │   ├── Activity.tsx        ← Activiteitslog
│           │   └── Profile.tsx         ← Gebruikersprofiel
│           │
│           ├── 📁 components/          ← Herbruikbare UI-componenten
│           ├── 📁 viewer/              ← IFC viewer hulpmodules
│           │   ├── alignment.ts        ← Model uitlijning
│           │   └── transparency-manager.ts ← Doorzichtigheid
│           ├── 📁 hooks/               ← React hooks
│           ├── 📁 lib/                 ← Hulpfuncties
│           ├── 📁 ui-templates/        ← BIM UI sjablonen
│           └── 📁 bim-components/      ← Aangepaste BIM-componenten
│
├── 📁 RevitPlugin/                     ← C# Revit add-in
│   ├── 📄 Command.cs                   ← Hoofdcommando (export + QR)
│   ├── 📄 PluginClient.cs              ← HTTP API client
│   ├── 📄 App.cs                       ← Revit ExternalApplication
│   ├── 📄 SelectionWindow.xaml(.cs)    ← Projectselectie venster
│   ├── 📄 LoginWindow.xaml(.cs)        ← Inlogvenster
│   ├── 📄 IfcSettingsWindow.xaml(.cs)  ← Exportinstellingen venster
│   ├── 📄 ProgressWindow.xaml(.cs)     ← Voortgangsvenster
│   ├── 📄 ResultWindow.xaml(.cs)       ← Resultaatvenster
│   ├── 📄 SettingsManager.cs           ← Instellingen opslag
│   ├── 📄 SelectionForm.cs             ← Formulierlogica
│   ├── 📄 VH_IFC_QR.csproj            ← C# project bestand
│   ├── 📄 VH_IFC_QR.addin             ← Revit addin manifest
│   ├── 📁 Deployment/                  ← Deployment bestanden
│   ├── 📁 Installer/                   ← Installer bestanden
│   ├── 📁 bin/                         ← Build output (niet in git)
│   ├── 📁 obj/                         ← Build cache (niet in git)
│   └── 📁 publish/                     ← Gepubliceerde DLL bestanden
│
├── 📁 addin/                           ← Revit addin manifest bestanden
│   ├── 📄 VH_IFC_QR.addin             ← Installatie manifest
│   └── 📁 VH_IFC_QR/                  ← Plugin DLL bestanden
│
└── 📁 scripts/                         ← Hulpscripts (niet in git)
    ├── 📄 deploy_height_fix.ps1        ← PowerShell deployscript
    └── 📄 deploy_security.ps1          ← PowerShell beveiligingsscript
```

---

## Uitleg per map

| Map | Omgeving | Doel |
|---|---|---|
| `src/backend/` | Server (Render.com) | REST API, authenticatie, bestandsbeheer |
| `src/backend/routes/` | Server | URL-afhandeling per functiegebied |
| `src/backend/services/` | Server | Herbruikbare data-toegangslaag |
| `src/frontend/` | Browser (Vercel) | Viewer en admin dashboard |
| `src/frontend/src/pages/` | Browser | Paginaweergaven |
| `src/frontend/src/components/` | Browser | Herbruikbare UI-bouwblokken |
| `src/frontend/src/viewer/` | Browser | IFC-viewer hulplogica |
| `RevitPlugin/` | Revit (lokaal) | Add-in voor IFC-export |
| `addin/` | Revit (installatie) | Manifest voor Revit installatie |
| `scripts/` | Lokaal | Deployment hulpscripts |

---

## Niet in git (runtime)

| Map | Reden |
|---|---|
| `src/backend/uploads/` | Runtime uploads, te groot voor git |
| `src/backend/qr-codes/` | Runtime gegenereerde QR-codes |
| `src/backend/node_modules/` | Afhankelijkheden via npm |
| `src/frontend/node_modules/` | Afhankelijkheden via npm |
| `src/frontend/dist/` | Build output |
| `RevitPlugin/bin/` | Build output |
| `RevitPlugin/obj/` | Build cache |
| `%AppData%/` | Windows omgevingsvariabele-fout |
| `scripts/` | Bevat mogelijk gevoelige informatie |
