# Onderzoek: vooraf gegenereerde Fragments-cache

Datum: 2026-08-30
Status: Desktop-pilot geslaagd; centrale productiecache nog niet activeren

## Besluit

De lokale desktopbenchmark is positief: de drie aangeleverde IFC's leveren een
gecomprimeerd Fragments-artifact van 8,1–9,0% van de IFC-grootte en laden in de
vergelijkbare testruns 19–24% sneller. Aantallen items, categorieën en de
steekproef van eigenschappen bleven gelijk.

Activeer de centrale productiecache nog niet. De testset is klein en de pilot is
alleen in headless desktop-Chrome uitgevoerd. Test eerst een representatief
zwaar IFC-model en een gangbare telefoon via een beperkt mobiel netwerk. Als die
acceptatie slaagt, sla per `model_version` naast het originele IFC-bestand één
gecomprimeerd `.frag`-bestand op via een asynchrone worker.

Het originele IFC blijft de bron. Fragments is uitsluitend een reproduceerbare viewer-cache.

## Gemeten resultaten

| Model | IFC | Fragments | Verhouding | IFC laden | Fragments laden | Items |
|---|---:|---:|---:|---:|---:|---:|
| BP2-03.ifc | 1.027.139 B | 85.132 B | 8,29% | 2.281 ms | 1.778 ms | 23 = 23 |
| BP2-02A.ifc | 1.090.730 B | 88.662 B | 8,13% | 2.083 ms | 1.680 ms | 39 = 39 |
| BP4-01.ifc | 3.929.039 B | 354.679 B | 9,03% | 2.667 ms | 2.027 ms | 30 = 30 |

De benchmarkroute is inert in normaal gebruik en wordt alleen geactiveerd met
`?benchmark=fragments`. De bron-IFC's en gegenereerde artifacts worden niet in
Git opgenomen.

De gebruikte pakketten ondersteunen deze route rechtstreeks:

- `@thatopen/fragments` `IfcImporter.process({ bytes, raw: false })` maakt een gecomprimeerde Fragments-buffer van IFC-data.
- `FragmentsManager.core.load(buffer, { modelId })` opent die buffer zonder de IFC opnieuw met `web-ifc` te verwerken.
- `FragmentsModel.getBuffer(false)` levert een gecomprimeerde buffer voor opslag.

Bronnen: [That Open IfcImporter](https://github.com/ThatOpen/engine_fragment/blob/main/packages/fragments/src/Importers/IfcImporter/index.ts), [Fragments laden en exporteren](https://github.com/ThatOpen/engine_components/blob/main/packages/core/src/fragments/FragmentsManager/example.ts), [Fragments-formaat](https://github.com/ThatOpen/engine_fragment).

## Aanbevolen flow

```text
Revit uploadt IFC
  -> model_version krijgt status `pending`
  -> conversieworker downloadt de private IFC
  -> IfcImporter maakt compressed .frag
  -> worker uploadt artifact naar dezelfde private bucket
  -> model_version krijgt artifactpad, bronhash, formaatversie en status `ready`

QR-viewer
  -> viewer-link valideert token
  -> geeft signed fragmentUrl terug wanneer artifact `ready` en actueel is
  -> viewer downloadt en laadt .frag
  -> bij artifactfout één automatische fallback naar signed modelUrl (IFC)
```

Gebruik voor het artifact bijvoorbeeld:

```text
projects/{projectId}/models/{modelId}/versions/{versionId}/viewer/{sourceHash}.frag
```

Een aparte private bucket `ifc-viewer-artifacts` is beheerstechnisch het duidelijkst. Als uitbreiding van de huidige `ifc-models`-bucket eenvoudiger is, blijft de beveiliging ook correct zolang alleen `viewer-link` signed URLs verstrekt.

## Datamodel

Voeg aan `model_versions` toe:

```sql
alter table public.model_versions
  add column if not exists fragments_storage_path text,
  add column if not exists fragments_storage_bucket text,
  add column if not exists fragments_size bigint,
  add column if not exists fragments_source_sha256 text,
  add column if not exists fragments_format_version text,
  add column if not exists fragments_converter_version text,
  add column if not exists fragments_status text
    check (fragments_status in ('pending', 'processing', 'ready', 'failed')),
  add column if not exists fragments_error text,
  add column if not exists fragments_created_at timestamptz;
```

`viewer-link` kan compatibel worden uitgebreid met:

```json
{
  "filename": "gebouw.ifc",
  "modelUrl": "<signed IFC URL>",
  "fragmentUrl": "<signed .frag URL of null>",
  "fragmentFormatVersion": "thatopen-fragments-v1",
  "sourceHash": "<sha256>"
}
```

De IFC-URL blijft in de response nodig als fallback. Beide URLs krijgen dezelfde korte geldigheidsduur en worden pas na een geldige, actieve share aangemaakt.

## Aanmaakmoment en runtime

Aanbevolen: een losse asynchrone Node-worker of queue-consumer na `complete-upload`.

- Voordeel: conversie gebeurt één keer en helpt ieder apparaat en iedere QR-bezoeker.
- Voordeel: een mislukte conversie blokkeert de Revit-upload of QR-link niet.
- Voordeel: geheugen, time-out en retrybeleid zijn beter beheersbaar dan in een request-gebonden Edge Function.
- Niet aanbevolen als primaire oplossing: conversie in de browser en alleen IndexedDB gebruiken. Dat versnelt hoogstens herhaalbezoek op hetzelfde apparaat en belast de eerste mobiele bezoeker nog steeds.
- Niet aanbevolen: conversie synchroon in `viewer-link`; dit maakt tokenvalidatie traag en kwetsbaar.

Een browsercache in IndexedDB kan later als tweede laag worden toegevoegd met dezelfde cachekey, maar is geen vervanging voor het centraal gegenereerde artifact.

## Versiebeheer en invalidatie

Gebruik als logische cachekey:

```text
SHA-256(IFC-bytes) + @thatopen/fragments-versie + converter-configversie
```

Genereer opnieuw wanneer één van deze delen verandert. Markeer het bestaande artifact eerst als niet-actueel; overschrijf het niet voordat de nieuwe conversie succesvol is. Hierdoor blijft fallback naar IFC altijd mogelijk.

Minimale controles vóór gebruik:

- `fragments_status = 'ready'`;
- opgeslagen bronhash hoort bij de huidige `model_version`;
- formaat- en converterversie staan in de allowlist van de gedeployde viewer;
- object bestaat en signed URL kan worden gemaakt.

Bij een fout tijdens `.frag`-download of `core.load`:

1. log artifactversie en foutsoort;
2. probeer maximaal één keer het originele IFC;
3. markeer het artifact server-side voor herconversie als de fout reproduceerbaar is.

## Opslagimpact

De extra opslag is de werkelijke `.frag`-grootte per modelversie. Er is geen veilige vaste verhouding ten opzichte van IFC; geometrie, propertysets en importerconfiguratie beïnvloeden dit sterk. Meet daarom per representatieve modelklasse:

- IFC-bytes;
- compressed Fragments-bytes;
- verhouding artifact/IFC;
- tijdelijke piekopslag tijdens vervanging;
- retentie van oude `model_versions`.

Verwijder een artifact via dezelfde deleteflow als de gekoppelde `model_version`. Losse artifacts zonder geldige versie moeten periodiek als orphan worden opgeruimd.

## Benchmark vóór implementatie

Gebruik minimaal drie echte modellen: klein, gemiddeld en groot, inclusief het zwaarste courante bouwkundige model. Test op een desktop en een gangbare telefoon via een geknepen mobiel netwerk.

Meet voor IFC en `.frag`, steeds koud én warm:

- downloadgrootte en downloadduur;
- tijd tot eerste herkenbare 3D-frame;
- totale tijd tot selecteerbaar model;
- main-thread blokkeertijd;
- piekgeheugen;
- succespercentage en fallbackgedrag;
- openen van eigenschappen, selectie en zichtbaarheid na laden.

Go/no-go:

- alle huidige kijk-, selectie- en eigenschapsfuncties blijven gelijk werken;
- geen zichtbaar geometrie- of propertyverlies in de testset;
- tijd tot selecteerbaar model verbetert aantoonbaar op mobiel en desktop;
- de opslagtoename en workerkosten zijn acceptabel ten opzichte van het aantal QR-bezoeken;
- een corrupt, ontbrekend of versie-incompatibel artifact valt zonder gebruikersactie terug op IFC.

## Gefaseerde uitvoering

1. Benchmark lokaal door na `ifcLoader.load` `model.getBuffer(false)` als `.frag` te bewaren en die in een tweede run via `fragments.core.load` te openen.
2. Voeg migratievelden en artifactstatus toe, nog zonder de publieke route om te schakelen.
3. Bouw de idempotente conversieworker met retry en bronhashcontrole.
4. Breid `viewer-link` compatibel uit met `fragmentUrl`.
5. Laat de viewer `.frag` prefereren met één automatische IFC-fallback.
6. Activeer dit eerst voor een beperkt aantal modelversies en verzamel laadtijden en fouten.
