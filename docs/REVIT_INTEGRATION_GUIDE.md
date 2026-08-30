# Revit add-in integratie

De actieve Revit-integratie gebruikt geen Express-uploadroute.

```text
Revit -> Supabase Auth -> revit-api Edge Function -> signed TUS upload
      -> private Storage -> share + QR -> viewer-link -> Vercel IFC viewer
```

De concrete installatie-, security- en verificatiestappen staan in
[`SUPABASE_DIRECTE_KOPPELING.md`](SUPABASE_DIRECTE_KOPPELING.md).

Belangrijke contractpunten:

- De add-in gebruikt een Supabase **publishable key**, nooit een secret/service-role key.
- Revit-gebruikers melden aan met een Supabase Auth e-mailadres en wachtwoord.
- Elke `revit-api` actie vereist zowel de Supabase Auth JWT als de per-installatie
  `VH_REVIT_PLUGIN_KEY` header.
- IFC-bestanden worden met TUS chunks naar de private `ifc-models` bucket gestuurd.
- Alleen een actieve, niet-verlopen share kan via `viewer-link` een tijdelijke
  download-URL voor de browser verkrijgen.

De implementatie staat in `addin/PluginClient.cs` en
`supabase/functions/revit-api/index.ts`.
