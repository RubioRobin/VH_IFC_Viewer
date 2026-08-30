# Directe Supabase-koppeling

De actieve IFC-keten is:

`Revit add-in -> Supabase Auth + Edge Function -> signed/TUS upload -> private Storage -> QR-link -> viewer-link Function -> Vercel viewer`

Een externe Express-host is geen onderdeel van deze keten. De add-in en browser ontvangen nooit een Supabase secret/service-role key.

## Wat wordt waar beveiligd

- Revit meldt de gebruiker aan via **Supabase Auth** (e-mail + wachtwoord).
- `revit-api` valideert zowel de gebruikerssessie als `VH_REVIT_PLUGIN_KEY`.
- IFC-bestanden staan in private bucket `ifc-models`.
- Grote IFC-bestanden gebruiken de directe Supabase Storage-hostnaam met TUS-resume.
- Alleen `viewer-link` maakt een download-URL van 15 minuten voor een actieve QR-share.
- Een publieke viewerlink is altijd `/v/<share-token>`; `?model=` en `?fileId=`
  zijn geen geldige toegangsroute meer.
- De Revit toegangssleutel en sessie worden per Windows-gebruiker DPAPI-versleuteld opgeslagen; de sessie wordt vóór function-calls automatisch ververst.

## Eenmalige inrichting

1. Koppel de Supabase CLI met het doelproject en voer **alle** migraties uit:

   ```powershell
   supabase link --project-ref <project-ref>
   supabase db push
   ```

   Dit voert zowel `202607190001_revit_direct_storage.sql` als
   `202607190002_direct_revit_schema.sql` uit. De tweede migratie is
   niet-destructief en maakt/upgrade de tabellen, RLS en `service_role` grants.

2. Stel in Supabase Edge Function Secrets in:

   ```powershell
   supabase secrets set VH_REVIT_PLUGIN_KEY=<lange-willekeurige-sleutel>
   supabase secrets set VH_VIEWER_URL=https://<jouw-vercel-domein>
   ```

   Gebruik een unieke, roteerbare sleutel per organisatie of Revit-installatie.
   `SUPABASE_SECRET_KEYS` wordt door Supabase zelf aan Edge Functions geleverd;
   de Functions gebruiken de moderne standaard-secret-key vóór een eventuele
   legacy service-role key. Een moderne `sb_secret_` key gaat binnen de Function
   uitsluitend als `apikey` mee; een gebruikers-JWT blijft behouden voor de
   Auth-validatie. Kopieer geen van beide naar Revit, Vercel of Git.

3. Activeer Email/Password in **Authentication > Providers** en maak voor elke
   Revit-gebruiker een bevestigde Supabase Auth-gebruiker aan in
   **Authentication > Users**. De add-in gebruikt het e-mailadres als login.

4. Deploy de functies:

   ```powershell
   supabase functions deploy revit-api
   supabase functions deploy viewer-link
   ```

   `verify_jwt = false` in `supabase/config.toml` is bewust: `revit-api`
   controleert de Auth JWT zelf zodat de health-check zonder gebruikerssessie
   kan werken; `viewer-link` is publiek maar geeft uitsluitend actieve,
   niet-verlopen share-links door.

5. Configureer Vercel met **Root Directory = `frontend`** en:

   ```text
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

   Bestaande projecten met `VITE_SUPABASE_ANON_KEY` blijven tijdelijk
   compatibel. Stel voor nieuwe deployments bij voorkeur de moderne
   `VITE_SUPABASE_PUBLISHABLE_KEY` in.

   `VITE_API_URL` is niet nodig voor de IFC-viewer. Het kan uitsluitend nog
   bestaan voor het niet-gemigreerde legacy adminportaal.

   In het gekoppelde Vercel-project is `frontend/vercel.json` de geldende
   configuratie en verzorgt die de SPA-rewrite voor `/v/<share-token>`.
   De root-`vercel.json` is alleen een alternatief voor een toekomstig project
   dat bewust vanaf de repository-root wordt gebouwd; wijzig de Root Directory
   niet tegelijk met deze inrichting.

6. Open in Revit het tabblad **VH > IFC Instellingen** en vul in:

   - Supabase project-URL
   - Supabase publishable key
   - Revit toegangssleutel (`VH_REVIT_PLUGIN_KEY`)

## Controle vóór eerste export

De volgende health-check moet HTTP 200 en `"authentication":"supabase-auth"`
geven. Hij controleert de tabellen én de benodigde Storage-buckets.

```powershell
Invoke-RestMethod "$SUPABASE_URL/functions/v1/revit-api/health" -Headers @{
  apikey = $SUPABASE_PUBLISHABLE_KEY
  'x-vh-plugin-key' = $VH_REVIT_PLUGIN_KEY
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
