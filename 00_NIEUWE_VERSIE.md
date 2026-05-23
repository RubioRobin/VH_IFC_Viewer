# Nieuwe versie - VH IFC Viewer

Datum: 2026-05-16

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

Let op:

- De map `addin/OriginalExporter` hoort bij deze nieuwe versie en moet mee in Git/deploy.
- Na build moet Revit opnieuw gestart worden om de nieuwe add-in te laden.
- Na backend/frontend deploy zijn de QR-link en websitevolgorde actief op productie.
