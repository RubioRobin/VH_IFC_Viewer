# Technische overdracht — directe IFC-keten

**Status:** release 1.1.0 — augustus 2026
**Actieve route:** Revit + adminportaal → Supabase → Vercel IFC-viewer
**Legacy, niet gedeployed:** de Express-backend

De uitvoerbare inrichting staat in [SUPABASE_DIRECTE_KOPPELING.md](SUPABASE_DIRECTE_KOPPELING.md).

## Architectuur

```text
Revit add-in
  ├─ Supabase Auth (e-mail/wachtwoord → gebruikers-JWT)
  ├─ revit-api Edge Function (server-side gevalideerde Auth-JWT)
  └─ private Supabase Storage (signed TUS-upload)
                                      │
                                      ▼
                          QR-share /v/<token>
                                      │
                                      ▼
Vercel viewer ── viewer-link Edge Function ── signed download-URL ── IFC

Vercel admin ── Supabase Auth ── admin-api Edge Function ── database/storage
```

De browser en de add-in ontvangen nooit een Supabase secret/service-role key.

## Revit-exportflow

1. De gebruiker meldt zich in de add-in aan via Supabase Auth.
2. `revit-api` valideert de Auth-JWT server-side via Supabase Auth.
3. De add-in maakt een model en een uploadsessie aan.
4. De IFC gaat direct naar private bucket `ifc-models`; grote bestanden gaan
   via TUS in chunks van 6 MB en worden na netwerkverlies hervat.
5. De functie valideert het opgeslagen object en markeert de modelversie als
   `uploaded`.
6. `publish_model_version` zet de nieuwe versie atomair op actueel, verhuist
   bestaande shares/QR-assets en bewaart de vorige versie zeven dagen.
7. De add-in maakt zo nodig een share en QR-code. De QR-link is
   `https://<viewer-domein>/v/<token>`.

De dagelijkse GitHub Actions-workflow roept `retention-cleanup` aan. Die
verwijdert na de vaste retentiedeadline eerst de private Storage-objecten en
daarna de oude metadata. Een mislukte cleanup trekt eventuele capabilities in
en wordt bij de volgende run veilig opnieuw geprobeerd.

## Viewerflow

1. Vercel serveert de SPA voor `/v/<token>`.
2. De viewer roept rechtstreeks `viewer-link` aan met de token.
3. De Edge Function controleert of de share actief en niet verlopen is.
4. De functie levert een Storage signed URL die 15 minuten geldig is.
5. De browser downloadt de IFC rechtstreeks uit Storage en laadt deze lokaal
   met OpenBIM/Three.js.

## Supabase-contract

| Onderdeel | Gebruik |
|---|---|
| `projects` | Projectkeuze in Revit |
| `models` / `model_versions` | IFC-versies en uploadstatus |
| `files` | Koppeling met bestaande adminbestanden |
| `shares` | Publieke QR-capability links |
| `qr_assets` | QR-code metadata |
| `ifc-models` | Nieuwe IFC-exporten, private |
| `ifc-private` | Bestaande IFC-bestanden, private/compatibiliteit |
| `qr-public` | QR-afbeeldingen, publiek |

Alle migraties onder `supabase/migrations/` zijn vereist. De tweede migratie
behoudt de oude `revisions`/`share_id`-gegevens en brengt ze over naar het
actuele modelversiecontract zonder tabellen te verwijderen.

De laatste hardeningmigratie verwijdert ook de permissieve prototypepolicies
op `users`, `projects`, `files`, `activity`, `qr_codes` en `shares`. De tabellen
blijven uitsluitend via de server-side Edge Functions bereikbaar.

## Beveiliging

- RLS sluit de BIM-tabellen voor `anon` en `authenticated`; alleen Edge
  Functions met de server-side sleutel behandelen metadata.
- Nieuwe gebruikers uit het adminportaal krijgen een echt Supabase
  Auth-e-mailadres, zodat dezelfde accountgegevens in Revit werken.
- De add-in bevat alleen de openbare project-URL en publishable key. Een
  service-role key of schijnveilig desktopsecret wordt niet meegeleverd.
- De add-in bewaart de gebruikerssessie met Windows DPAPI in
  `%APPDATA%\VH_IFC_Viewer`.
- `viewer-link` is publiek omdat een QR-link publiek is, maar geeft uitsluitend
  een tijdelijke download-URL voor een actieve share terug.

## Deploy-volgorde

1. `supabase link --project-ref <project-ref>`
2. `supabase db push`
3. Stel `VH_VIEWER_URL` in als Edge Function secret.
4. Activeer Email/Password en maak de Revit-gebruikers aan in Supabase Auth.
5. `supabase functions deploy revit-api`
6. `supabase functions deploy admin-api`
7. `supabase functions deploy viewer-link`
8. `supabase functions deploy retention-cleanup`
9. Configureer de cleanup-sleutel in Supabase én GitHub Actions en test de
   workflow **Supabase model retention cleanup** handmatig.
10. Deploy de Vercel-viewer met `VITE_SUPABASE_URL` en
   `VITE_SUPABASE_PUBLISHABLE_KEY`.

Gebruik bij voorkeur `frontend` als Vercel Root Directory. De root
`vercel.json` bouwt dezelfde frontend als vangnet wanneer de repository-root
wordt gedeployed; hij start de Express-backend niet.

## Verificatie

- `GET /functions/v1/revit-api/health` moet HTTP 200 teruggeven met
  `"authentication":"supabase-auth"`.
- Test één kleine IFC-export en controleer `upload_status = uploaded`.
- Scan de QR-code en controleer dat `/v/<token>` een IFC uit een signed URL
  opent.
- Controleer in de browsernetwerktab dat de viewer alleen Vercel en
  `*.supabase.co` aanroept en geen legacy backend-URL.

## Adminportaal

Alle adminpagina's roepen `admin-api` aan. Dat omvat authenticatie/profiel,
projecten en bestanden, uploadtickets, QR-assets, gebruikersbeheer, activiteit
en statistieken. De Function controleert de Supabase-JWT en gebruikt uitsluitend
`app_metadata.role` voor adminautorisatie. `backend/` is alleen bewaarde
legacycode voor regressieonderzoek; `VITE_API_URL` is uit de actieve route
verwijderd.

Bij verwijderen van een gepubliceerd bestand trekt `admin-api` eerst de share
in en verwijdert daarna IFC, QR-asset en gekoppelde modelversie. Het dashboard
kan daardoor geen actief ogende QR-link naar een verwijderd object achterlaten.
