# Project Structuur — VH IFC Viewer

Bijgewerkt: 19 februari 2026

---

## Boomstructuur

```
VH_IFC_Viewer/
│
├── 📁 backend/                     ← Node.js/Express API server
│   ├── 📄 app.js                   ← Entry point: middleware, routes, server
│   ├── 📄 database.js              ← Supabase client + service exports
│   ├── 📄 package.json             ← Backend afhankelijkheden
│   ├── 📄 .env.template            ← Template voor omgevingsvariabelen
│   │
│   ├── 📁 routes/                  ← Express route handlers
│   ├── 📁 services/                ← Business logica (Supabase queries)
│   ├── 📁 middleware/              ← Express middleware
│   └── 📁 migrations/              ← Database migraties (SQL)
│
├── 📁 frontend/                    ← Vite/React/TypeScript webapp
│   ├── 📄 package.json             ← Frontend afhankelijkheden
│   ├── 📄 vite.config.ts           ← Vite build configuratie
│   ├── 📄 vercel.json              ← Vercel deployment configuratie
│   │
│   ├── 📁 public/                  ← Statische bestanden
│   └── 📁 src/                     ← TypeScript broncode
│       ├── 📁 pages/               ← Paginacomponenten
│       ├── 📁 components/          ← Herbruikbare UI-componenten
│       └── 📁 viewer/              ← IFC viewer hulpmodules
│
├── 📁 addin/                       ← C# Revit add-in (voorheen RevitPlugin)
│   ├── 📄 Command.cs                   ← Hoofdcommando (export + QR)
│   ├── 📄 PluginClient.cs              ← HTTP API client
│   ├── 📄 VH_IFC_QR.csproj            ← C# project bestand
│   ├── 📁 addin/                       ← Revit addin manifest bestanden
│   └── 📁 install/                     ← Installatie bestanden
│
├── 📁 docs/                        ← Project documentatie
│   ├── 📄 README.md                        ← Projectoverzicht en installatiegids
│   ├── 📄 TECHNISCHE_OVERDRACHT.md         ← Architectuur, risico's, aanbevelingen
│   ├── 📄 PROJECT_STRUCTUUR.md             ← Dit bestand
│   ├── 📄 REVIT_API_GUIDE.md               ← Plugin API documentatie
│   └── 📄 REVIT_INTEGRATION_GUIDE.md       ← Plugin integratiegids
│
└── 📄 package.json                     ← Root scripts (start, install:all, etc.)
```

---

## Beschrijving per hoofdmap

| Map | Doel |
|---|---|
| `backend/` | REST API, authenticatie, bestandsbeheer (Node.js/Express) |
| `frontend/` | Dashboard en IFC-viewer (React/Vite) |
| `addin/` | Revit add-in voor export en QR-tagging (C#) |
| `docs/` | Centrale documentatie en handleidingen |

---

## Niet in git (runtime / build)

| Patroon | Reden |
|---|---|
| `**/node_modules/` | Externe afhankelijkheden |
| `**/.env` | Gevoelige configuratie |
| `**/bin/`, `**/obj/` | Build output C# |
| `frontend/dist/` | Build output frontend |
| `backend/uploads/` | Tijdelijke opslag geüploade bestanden |
