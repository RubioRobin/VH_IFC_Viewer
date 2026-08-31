# Nieuwe versie - VH IFC Viewer 1.10.0

Datum: 2026-08-31

Deze map bevat de nieuwe versie van de VH IFC Viewer add-in en website.

Belangrijk in deze versie:

- De originele VH IFC exporter is ingebouwd als stap 1 van de Revit add-in.
- De oude UI blijft gebruikt worden.
- De licentiecontrole uit de oude add-in is verwijderd.
- Upload naar Supabase en QR-plaatsing blijven onderdeel van de bestaande workflow.
- QR-codes verwijzen naar de publieke viewer-link.
- QR-plaatsing gebruikt de juiste positie en maat van 20.6 mm.
- Meldingen worden boven Revit geopend.
- De website sorteert IFC-bestanden op natuurlijke volgorde, bijvoorbeeld GP5-02 voor GP5-10.
- De panelen Model en Eigenschappen blijven permanent zichtbaar; de inklapknoppen zijn verwijderd.

Let op:

- De map `addin/OriginalExporter` hoort bij deze nieuwe versie en moet mee in Git/deploy.
- Na build moet Revit opnieuw gestart worden om de nieuwe add-in te laden.
- Voor de actieve QR/viewerroute: voer eerst de Supabase-migraties uit, deploy
  daarna de Edge Functions en deploy vervolgens de Vercel-frontend. De
  Express-backend is alleen nog relevant voor het legacy adminportaal.
