# Project Structuur

Dit document beschrijft de mappenstructuur van het VH IFC Viewer project.

## Root Directory

- `README.md`: Hoofddocumentatie van het project.
- `start_all.bat`: Script om zowel backend als frontend tegelijk te starten.
- `_archive/`: Oude bestanden, backups en voorbeelden. Niet verwijderen, dient als referentie.

## Broncode (`src/`)

De applicatie is opgesplitst in een duidelijke `frontend` en `backend`.

### Backend (`src/backend/`)
Dit is de Node.js API server die de database en uploads beheert.

- `app.js`: Het entry-point van de server.
- `config/`: Configuratiebestanden (in aanbouw).
- `controllers/`: Logica voor de API routes (in aanbouw).
- `database.js`: Verbinding met Supabase en database helpers.
- `routes/`: API endpoint definities (in aanbouw).
- `models/`: Database schema definities.
- `uploads/`: Opslag voor geüploade IFC bestanden (indien lokaal).
- `qr-codes/`: Opslag voor gegenereerde QR codes.

### Frontend (`src/frontend/`)
Dit is de React applicatie (Vite) die de gebruiker ziet.

- `src/`: Broncode van de frontend.
    - `assets/`: Afbeeldingen en stijlen.
    - `components/`: Herbruikbare UI componenten (knoppen, panelen).
    - `pages/`: Volledige pagina's (Login, Admin, Viewer).
    - `services/`: Communicatie met de Backend API.
    - `viewer/`: Specifieke logica voor de IFC Viewer (Three.js / OpenBIM).
- `public/`: Statische bestanden die direct toegankelijk zijn.
- `vite.config.ts`: Configuratie voor de Vite build tool.

## Revit Plugin (`RevitPlugin/`)
De source code voor de C# Revit Add-in. Deze staat los van de webapplicatie maar is onderdeel van de totale oplossing.
