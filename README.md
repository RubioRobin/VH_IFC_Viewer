# VH IFC Webviewer

Een geavanceerde webapplicatie voor het uploaden, beheren en bekijken van IFC modellen, inclusief QR-code generatie en Revit integratie.

## 🚀 Snel Starten

Om het volledige project (Backend + Frontend) lokaal te starten:

1.  Zorg dat Node.js geïnstalleerd is.
2.  Dubbelklik op `start_all.bat` in deze map.

Dit script zal:
-   De Backend starten op poort `3001`.
-   De Frontend starten op poort `5173`.
-   Vanzelf browser vensters openen.

## 📁 Project Overzicht

Het project bestaat uit drie hoofdonderdelen:

1.  **Backend (`src/backend`)**
    -   Node.js API server.
    -   Verzorgt authenticatie, bestandsopslag en database connecties.
    
2.  **Frontend (`src/frontend`)**
    -   Moderne React webapplicatie.
    -   Bevat de 3D IFC Viewer.
    -   Admin interface voor projectbeheer.

3.  **Revit Plugin (`RevitPlugin`)**
    -   C# Add-in voor Autodesk Revit.
    -   Maakt directe export en koppeling mogelijk.

## 🛠 Vereisten

-   Node.js (v18+)
-   NPM of Yarn
-   Een Supabase database (configuratie in `.env` bestanden).

## 📚 Documentatie

Zie `STRUCTUUR.md` voor een gedetailleerde uitleg van de bestandsindeling.

## ⚠️ Ontwikkeling

-   **Backend:** Draait op `http://localhost:3001`.
-   **Frontend:** Draait op `http://localhost:5173`.

Wijzigingen aan de database structuur moeten via migraties in Supabase verlopen.
Zie `_archive/Examples` voor referentiemateriaal uit eerdere versies.
