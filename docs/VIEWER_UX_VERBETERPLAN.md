# IFC Viewer UX- en performanceverbeterplan

Datum: 2026-08-18
Status: Geïmplementeerd en geverifieerd
Scope: publieke QR-viewer en lokale IFC-viewer in `frontend/`

## Doel en doelgroep

De viewer is primair een inspectiewerkplek voor een standaard gebruiker die via een QR-code of browser een bouwkundig IFC-model opent. De hoofdtaak is: het model direct kunnen bekijken, een element selecteren en de relevante informatie begrijpen zonder kennis van Revit- of IFC-bediening.

## Ontwerprichting

- De 3D-viewer blijft altijd het visuele hoofdelement.
- Panelen gedragen zich als technische informatielagen: docked op brede schermen, als overlay op tablet en als bottom sheet op mobiel.
- De toolbar wordt een compacte instrumentenbalk met vier primaire acties: `Model in beeld`, `Meten`, `Transparant` en `Meer`.
- Selectie- en herstelacties worden alleen aangeboden wanneer ze bruikbaar zijn.
- Bestaande VH-kleuren, Outfit-typografie en iconografie blijven leidend.

## Vastgestelde werkzaamheden

### Responsive en publieke viewer

- [x] Het 799/800 px-layoutprobleem oplossen.
- [x] Tussen 800 en 1439 px maximaal één paneel als overlay openen.
- [x] Onder 800 px panelen als bottom sheet aanbieden.
- [x] In de publieke QR-route upload- en modelbeheeracties verbergen.
- [x] De modelnaam in de publieke viewer zichtbaar en als documenttitel tonen.

Acceptatie:

- Bij 800, 1024 en 1280 px blijft de 3D-viewport volledig bruikbaar.
- Op tablet kan nooit meer dan één paneel tegelijk de viewport bedekken.
- Op mobiel zijn geselecteerde IFC-eigenschappen bereikbaar zonder horizontale pagina-scroll.
- Een publieke share-link toont geen `IFC Inladen`, download-, visibility- of disposebeheer uit de modellenlijst.

### Toolbar en interactiestatus

- [x] Vier primaire toolbaracties tonen zonder horizontale overflow.
- [x] `Verberg` en `Isoleer` alleen activeren bij een selectie.
- [x] `Wis maten` alleen activeren als maten bestaan.
- [x] `Toon alles` alleen activeren nadat zichtbaarheid is gewijzigd.
- [x] Een zichtbare statusmelding met `Ongedaan maken` tonen na verbergen of isoleren.
- [x] Toolbarlabels minimaal `0.75rem` maken.
- [x] Een focusring van 2 px met 2 px offset toevoegen.
- [x] Alleen echte toggles met `aria-pressed` markeren.

Acceptatie:

- De toolbar past bij 320 px viewportbreedte zonder horizontale scrollbar.
- Alle secundaire functies zijn via het menu `Meer` bereikbaar.
- Toetsenbordfocus is zichtbaar en `Escape` sluit menu's/panelen.
- Statusmeldingen zijn zichtbaar en worden via `aria-live` aangekondigd.

### Mobiele eigenschappen

- [x] Na elementselectie de eigenschappen-bottom-sheet openen.
- [x] Boven de technische IFC-tabel een samenvatting met naam, categorie, type en niveau tonen.
- [x] De bottom sheet via een duidelijke knop en `Escape` kunnen sluiten.

Acceptatie:

- Elementinformatie is op 320, 390 en 430 px bereikbaar.
- De samenvatting blijft begrijpelijk als technische velden ontbreken.

### Lichte bootstrap, laden en fouten

- [x] Share-token valideren voordat de zware 3D-engine wordt geïmporteerd.
- [x] De viewer-engine dynamisch laden vanuit een kleine bootstrap-entry.
- [x] Laadfasen tonen: link controleren, viewer voorbereiden, model downloaden, IFC verwerken en 3D-weergave opbouwen.
- [x] Downloadpercentage tonen als `Content-Length` beschikbaar is.
- [x] Bij fouten `Opnieuw proberen` tonen.
- [x] Bij ongeldige, ingetrokken of verlopen links `Vraag een nieuwe link aan` tonen.
- [x] Documenttitel instellen op `VH Engineering IFC Viewer – [modelnaam]`.

Acceptatie:

- Een ongeldige of verlopen link importeert de zware viewerbundle niet.
- Geldige links tonen vóór het IFC-parsen een bestandsnaam en duidelijke voortgang.
- Laad- en foutstatussen hebben correcte statussemantiek en werken met `prefers-reduced-motion`.

### Motion

- [x] Generieke uitschakeling van alle UI-transities verwijderen.
- [x] Alleen korte state-, drawer- en toasttransities van 120–160 ms gebruiken.
- [x] Animaties reduceren of uitschakelen bij `prefers-reduced-motion: reduce`.

### Herhaald laden en Fragments-cache

- [x] Onderzoeken of een vooraf gegenereerd Fragments-formaat naast IFC kan worden opgeslagen en geladen.
- [x] Architectuur, cache-invalidation, storage-impact en terugval naar IFC documenteren.
- [x] Deze wijziging pas implementeren na een benchmark met representatieve modellen.

Acceptatie onderzoek:

- Er is een concreet technisch advies met opslagformaat, aanmaakmoment, versiebeheer en benchmarkplan.
- Het originele IFC-bestand blijft de bron en fallback.

## Ontwerptokens

De implementatie gebruikt CSS-variabelen voor:

- paneelbreedte en bottom-sheethoogte;
- toolbarbreedte, controlhoogte en controltekst;
- focusring;
- overlay/scrim;
- statuskleuren;
- motionduur en easing.

Nieuwe visuele waarden worden niet los in componenten herhaald.

## Verificatiematrix

- Viewports: 320×720, 390×844, 800×720, 1024×768, 1280×720 en 1440×900.
- Routes: lokale viewer zonder token, geldige publieke token, ongeldige token en verlopen token.
- Interacties: laden, selecteren, eigenschappen openen/sluiten, meten, transparantie, verbergen, isoleren, ongedaan maken en alles tonen.
- Kwaliteitschecks: TypeScript/Vite-build, browserconsole, toetsenbordfocus, reduced motion, toolbaroverflow en bundle-splitting.

## Voortgangslog

- 2026-08-18: auditpunten door opdrachtgever geselecteerd en als uitvoeringsscope vastgelegd.
- 2026-08-18: responsive panelen, publieke route, mobiele toolbar, eigenschappen-bottom-sheet, toegankelijke focus en interactiestatus geïmplementeerd.
- 2026-08-18: lichte share-linkbootstrap, dynamische viewerimport, gefaseerde laadstatus en herstelbare foutstatus geïmplementeerd.
- 2026-08-18: Fragments-cachearchitectuur, invalidatie, fallback en benchmarkplan vastgelegd in `docs/FRAGMENTS_CACHE_ONDERZOEK.md`.
- 2026-08-18: TypeScript-controle (`tsc --noEmit`) en Vite-productiebuild geslaagd; initiële viewer-entry 1,36 kB en zware viewerchunk 7.605,79 kB.
- 2026-08-18: browsertests geslaagd op 320, 390, 800, 1024 en 1280 px, inclusief publieke link, verlopen link, selectie, bottom sheet, contextmenu, ongedaan maken, focusring en reduced motion.

## Geleerde aandachtspunten

- Een vaste desktopomslag op 800 px past niet bij BIM-viewers: een brede canvas met één tijdelijke informatielaag blijft tussen mobiel en desktop veel bruikbaarder.
- Share-linkvalidatie hoort vóór de 3D-engine te staan; hierdoor blijft de foutflow klein, snel en onafhankelijk van `web-ifc`.
- Fragments is een afgeleide cache en moet altijd aan bronhash én converterversie worden gekoppeld; alleen een bestandsnaam is onvoldoende voor betrouwbare invalidatie.
