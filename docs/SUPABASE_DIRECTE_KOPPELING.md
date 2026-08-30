# Directe Supabase-koppeling

De actieve IFC-keten is:

`Revit/admin -> Supabase Auth + Edge Functions -> private Storage -> QR-link -> viewer-link Function -> Vercel viewer`

Een externe Express-host is geen onderdeel van deze keten. `admin-api` behandelt
het adminportaal; `revit-api` behandelt de add-in en uploads; `viewer-link`
behandelt publieke sharetokens. De add-in en browser ontvangen nooit een
Supabase secret/service-role key.

## Wat wordt waar beveiligd

- Revit meldt de gebruiker aan via **Supabase Auth** (e-mail + wachtwoord).
- Het adminportaal gebruikt dezelfde Auth-sessie en accepteert uitsluitend een
  gebruiker met `app_metadata.role = "admin"`.
- `revit-api` valideert de gebruikerssessie server-side via Supabase Auth.
- IFC-bestanden staan in private bucket `ifc-models`.
- Grote IFC-bestanden gebruiken de directe Supabase Storage-hostnaam met TUS-resume.
- Alleen `viewer-link` maakt een download-URL van 15 minuten voor een actieve QR-share.
- Bij een vervangende upload verplaatst `publish_model_version` de bestaande
  share en QR atomair naar de nieuwe versie. De vorige IFC blijft zeven dagen
  als herstelversie bewaard; `retention-cleanup` ruimt verlopen versies en hun
  Storage-objecten dagelijks op zonder bestaande deadlines te verlengen.
- Een publieke viewerlink is altijd `/v/<share-token>`; `?model=` en `?fileId=`
  zijn geen geldige toegangsroute meer.
- De Revit-sessie wordt per Windows-gebruiker DPAPI-versleuteld opgeslagen en
  vóór function-calls automatisch ververst. De publishable key is openbare
  projectconfiguratie; een service-role key komt nooit in de add-in.

## Eenmalige inrichting

1. Koppel de Supabase CLI met het doelproject en voer **alle** migraties uit:

   ```powershell
   supabase link --project-ref <project-ref>
   supabase db push
   ```

   Dit voert onder meer `202607190001_revit_direct_storage.sql`,
   `202607190002_direct_revit_schema.sql`, de versiepublicatie-migratie en
   `202608300001_lock_legacy_data_api.sql` uit. Deze migraties zijn
   niet-destructief, maken/upgraden de tabellen en verwijderen de permissieve
   prototypepolicies voor `anon` en `authenticated`.

2. Stel in Supabase Edge Function Secrets in:

   ```powershell
   supabase secrets set VH_VIEWER_URL=https://<jouw-vercel-domein>
   supabase secrets set VH_RETENTION_CLEANUP_KEY=<willekeurige-sterke-sleutel>
   ```

   `SUPABASE_SECRET_KEYS` wordt door Supabase zelf aan Edge Functions geleverd;
   de Functions gebruiken de moderne standaard-secret-key vóór een eventuele
   legacy service-role key. Een moderne `sb_secret_` key gaat binnen de Function
   uitsluitend als `apikey` mee; een gebruikers-JWT blijft behouden voor de
   Auth-validatie. Kopieer geen van beide naar Revit, Vercel of Git.

3. Activeer Email/Password in **Authentication > Providers** en maak voor elke
   Revit-gebruiker een bevestigde Supabase Auth-gebruiker aan in
   **Authentication > Users**. De add-in gebruikt het e-mailadres als login.
   Nieuwe accounts via het adminportaal vereisen daarom ook een echt,
   bereikbaar e-mailadres; alleen een losse gebruikersnaam is niet voldoende.

4. Deploy de functies:

   ```powershell
   supabase functions deploy admin-api
   supabase functions deploy revit-api
   supabase functions deploy viewer-link
   supabase functions deploy retention-cleanup
   ```

   `verify_jwt = false` in `supabase/config.toml` is bewust: `admin-api` en
   `revit-api` valideren de Auth JWT zelf; `revit-api` houdt zo een health-check
   zonder gebruikerssessie beschikbaar. `viewer-link` is publiek maar geeft
   uitsluitend actieve, niet-verlopen share-links door.

   Zet dezelfde cleanup-sleutel in GitHub Actions secret
   `VH_RETENTION_CLEANUP_KEY` en zet de volledige Function-URL in
   `VH_RETENTION_CLEANUP_ENDPOINT`. Workflow
   `.github/workflows/retention-cleanup.yml` voert de cleanup dagelijks uit en
   kan voor een gecontroleerde test ook handmatig worden gestart.

5. Configureer Vercel met **Root Directory = `frontend`** en:

   ```text
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

   Bestaande projecten met `VITE_SUPABASE_ANON_KEY` blijven tijdelijk
   compatibel. Stel voor nieuwe deployments bij voorkeur de moderne
   `VITE_SUPABASE_PUBLISHABLE_KEY` in.

   `VITE_API_URL` is niet meer nodig. Het adminportaal bouwt de URL van
   `admin-api` uit `VITE_SUPABASE_URL` op.

   In het gekoppelde Vercel-project is `frontend/vercel.json` de geldende
   configuratie en verzorgt die de SPA-rewrite voor `/v/<share-token>`.
   De root-`vercel.json` is alleen een alternatief voor een toekomstig project
   dat bewust vanaf de repository-root wordt gebouwd; wijzig de Root Directory
   niet tegelijk met deze inrichting.

6. Start Revit en meld aan met een bevestigde Supabase Auth-gebruiker. De
   productie-URL en publishable key zijn onderdeel van de releaseconfiguratie;
   exportvoorkeuren blijven beschikbaar via **VH > IFC Instellingen**.

7. Ken de adminrol alleen server-side toe. Bewaar autorisatie nooit in
   `user_metadata`:

   ```sql
   update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
       || '{"role":"admin"}'::jsonb
   where email = '<beheerder>@<domein>';
   ```

   Laat de gebruiker daarna opnieuw inloggen zodat de JWT de nieuwe
   `app_metadata` bevat.

## Controle vóór eerste export

De volgende health-check moet HTTP 200 en `"authentication":"supabase-auth"`
geven. Hij controleert de tabellen én de benodigde Storage-buckets.

```powershell
Invoke-RestMethod "$SUPABASE_URL/functions/v1/revit-api/health" -Headers @{
  apikey = $SUPABASE_PUBLISHABLE_KEY
}
```

Naast tabellen en buckets controleert de health-check ook een geldige
`VH_VIEWER_URL`.

Voer daarna één kleine IFC-export uit:

1. Meld in Revit aan met het Supabase Auth-e-mailadres.
2. Controleer `ifc-models` op een object onder `projects/...`.
3. Controleer dat de modelversie `upload_status = uploaded` heeft.
4. Scan de QR-code of open `/v/<share-token>`.
5. Controleer in de browser DevTools dat alleen `*.supabase.co` wordt aangeroepen,
   geen legacy backend-URL.

Voor een lokale buildcontrole zonder echte sleutels:

```powershell
$env:VITE_SUPABASE_URL = 'https://ci.supabase.invalid'
$env:VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_ci_test'
npm run build:frontend
npm run verify:direct-viewer
```

Dezelfde controle draait in `.github/workflows/direct-supabase-viewer.yml`.

Controleer daarnaast het admincontract met een geldige adminsessie:

- `GET /functions/v1/admin-api/auth/me` geeft de actuele gebruiker;
- `GET /functions/v1/admin-api/projects` en `/qr` geven HTTP 200;
- `POST /functions/v1/admin-api/upload/reserve` maakt een uploadticket plus
  blijvende sharetoken;
- een tweede complete upload voor hetzelfde model houdt de bestaande
  `/v/<share-token>` bruikbaar en zet de vorige versie op zeven dagen retentie;
- een handmatige run van **Supabase model retention cleanup** geeft HTTP 200 en
  rapporteert alleen verlopen, niet-actuele versies;
- een niet-admin JWT krijgt HTTP 403 en een ontbrekende JWT HTTP 401.

## Bestaande IFC-bestanden

Oude records uit bucket `ifc-private` blijven bruikbaar. Kies in Revit **Link
QR**, maak één share aan en de functie bewaart de juiste bucket op de
modelversie. De viewer tekent vervolgens uit die bucket, niet blind uit
`ifc-models`.

Voor bestanden zonder actieve share toont de admin-viewer bewust geen IFC: maak
eerst een QR/share aan. Zo kan een willekeurig `fileId` geen privébestand
publiceren.

Oude publieke links met `?model=...` of `?fileId=...` zijn bewust buiten gebruik
gesteld: zij waren afhankelijk van de voormalige Express-route. Geef
voor zulke modellen een nieuwe QR- of share-link uit.

## Grote IFC-bestanden

De add-in gebruikt TUS/resumable uploads via de signed Supabase Storage-route
wanneer Supabase een signed upload token levert. Uploads worden in 6 MB-chunks
verstuurd en kunnen na een tijdelijke netwerkfout worden hervat. De standaard
signed PUT is uitsluitend een fallback wanneer TUS nog geen upload-URL heeft
aangemaakt. Na een geaccepteerde TUS-chunk wordt nooit van protocol gewisseld.
