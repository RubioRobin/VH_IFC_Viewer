# VH_IFC_Viewer — Claude Code Context

## Project
Volledig systeem voor het bekijken van IFC-bestanden vanuit Revit. Bestaat uit een web frontend, Express backend en een Revit C# plugin.

## Structuur
```
vh-ifc-viewer/
├── frontend/     → Vite/React IFC viewer (deploy: Vercel)
│   └── public/   → Statische bestanden (incl. VH logo)
├── backend/      → Express.js API server (deploy: Render.com)
├── addin/        → Revit plugin manifests (C#)
├── docs/         → Documentatie
├── package.json  → Root scripts (coördineert frontend + backend)
├── Procfile      → Heroku config
└── render.yaml   → Render.com deploy config
```

## Tech Stack

### Frontend (`frontend/`)
- **Build:** Vite 7, TypeScript 5.2
- **UI:** React 19.2, React Router 7, Tailwind CSS 3, Framer Motion
- **3D/IFC:** Three.js 0.175, web-ifc 0.0.72, @thatopen/components ~3.2
- **Deploy:** Vercel

### Backend (`backend/`)
- **Server:** Express.js 4, Node.js
- **DB:** Supabase (`@supabase/supabase-js`)
- **Auth:** JWT (`jsonwebtoken`), bcryptjs, express-session
- **Security:** Helmet, express-rate-limit, xss-clean, CORS
- **Overig:** QR-code generatie, UUID
- **Deploy:** Render.com

### Revit Plugin (`addin/`)
- C# plugin voor Revit
- Targets: net48 (Revit 2023/2024), net8.0-windows (Revit 2025)

## Commando's (vanuit root)
```bash
npm run install:all     # Installeer dependencies (frontend + backend)
npm run dev:backend     # Start backend dev server (nodemon)
npm run dev:frontend    # Start frontend dev server (vite --host)
npm run build:frontend  # Build frontend voor productie
npm start               # Start backend productie (node backend/app.js)
```

### Backend apart (`backend/`)
```bash
npm run dev    # nodemon app.js
npm start      # node app.js
```

### Frontend apart (`frontend/`)
```bash
npm run dev      # vite --host
npm run build    # vite build
npm run preview  # vite preview
```

## Omgevingsvariabelen
Backend vereist `.env`:
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`
- `JWT_SECRET`, `SESSION_SECRET`

## Veiligheidsregels
- NOOIT `.env` committen naar git
- NOOIT bestanden verwijderen zonder bevestiging
- `git status` uitvoeren voor je begint
- Backend heeft security-middleware — pas hier voorzichtig aan
