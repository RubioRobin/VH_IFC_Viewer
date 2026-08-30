# Revit API-gids — direct Supabase

De eerdere Express/localhost-API in dit document is buiten gebruik voor de IFC
route. Gebruik [SUPABASE_DIRECTE_KOPPELING.md](SUPABASE_DIRECTE_KOPPELING.md)
voor de volledige installatie.

## Basis-URL's

```text
Auth:      https://<project-ref>.supabase.co/auth/v1
Revit API: https://<project-ref>.supabase.co/functions/v1/revit-api
Viewer:    https://<project-ref>.supabase.co/functions/v1/viewer-link
```

## Authenticatie

1. Meld de gebruiker aan met `POST /auth/v1/token?grant_type=password`.
2. Stuur de ontvangen `access_token` als `Authorization: Bearer <token>` naar
   elke `revit-api`-aanroep behalve `GET /health`.
3. Stuur ook `apikey: <publishable-key>` mee. Een desktopclient bevat bewust
   geen apart installatiesecret; autorisatie gebeurt met de server-side
   gevalideerde gebruikerssessie.

De service-role key hoort uitsluitend in de Edge Function-omgeving en nooit in
Revit of de browser.

## Endpoints

| Methode | Endpoint | Doel |
|---|---|---|
| GET | `/health` | Controleert migraties en Storage-buckets |
| GET | `/projects` | Projecten voor de Revit-selectie |
| POST | `/projects/ensure` | Project zoeken of aanmaken |
| POST | `/models/create` | Model voor een export aanmaken |
| POST | `/models/{id}/versions/upload-session` | Signed upload- en TUS-gegevens ophalen |
| POST | `/models/{id}/versions/{versionId}/complete` | Objectgrootte controleren en versie afronden |
| POST | `/models/{id}/versions/{versionId}/share` | QR-share token maken of hergebruiken |
| POST | `/models/{id}/versions/{versionId}/qr` | QR-PNG genereren |

## Uploadcontract

`upload-session` retourneert `uploadUrl`, `uploadToken`, `tusEndpoint`,
`storagePath` en `storageBucket`. Gebruik TUS wanneer `uploadToken` en
`tusEndpoint` aanwezig zijn; de add-in implementeert dit al met hervatbare
6 MB chunks. Val daarna altijd `/complete` aan voordat een share of QR-code
wordt aangemaakt.

## Publieke viewer

Een QR-link opent `/v/<token>`. De viewer gebruikt `viewer-link?token=<token>`
om een tijdelijke IFC-download-URL op te halen. Er is geen `/api/share`,
`/api/plugin/*`, `x-user-token` of externe backend-endpoint nodig.
