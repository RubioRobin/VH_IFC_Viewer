# Production Deployment - Snelle Checklist

## ✅ Wat is al klaar:

- [x] Database schema (organizations, models, revisions, shares)
- [x] Storage buckets (ifc-private, qr-public)
- [x] Backend code (alle routes en services)
- [x] Code gepusht naar GitHub
- [x] Supabase live
- [x] Vercel live
- [x] Render live

## 🔧 Wat je NU moet doen:

### 1. Render Environment Variables Toevoegen

**Ga naar**: Render Dashboard → Je backend service → Environment

**Voeg toe** (zie `RENDER_ENV_SETUP.md` voor exacte waarden):
- [ ] `SUPABASE_SERVICE_ROLE_KEY` (KRITISCH!)
- [ ] `ADMIN_API_KEY`
- [ ] `VIEWER_URL`

**Controleer**:
- [ ] `SUPABASE_URL` is correct
- [ ] `SUPABASE_KEY` (anon key) is correct
- [ ] `FRONTEND_URL` is correct

**Klik op**: "Save Changes"

### 2. Wacht op Deployment

- [ ] Render deploy automatisch (check logs)
- [ ] Deployment succesvol (groen vinkje)

### 3. Test Production API

```bash
# Vervang YOUR-RENDER-URL

# Test 1: Health check
curl https://YOUR-RENDER-URL.onrender.com/api/health

# Test 2: Upload init (met admin key)
curl -X POST https://YOUR-RENDER-URL.onrender.com/api/upload/init \
  -H "Authorization: Bearer 8205df224312077ca34a0f846ba6b945200dd83980b" \
  -H "Content-Type: application/json" \
  -d '{"projectId":"test-project-1","fileName":"test.ifc","fileSize":1000000}'
```

- [ ] Health endpoint werkt
- [ ] Upload init endpoint werkt
- [ ] Signed URL gegenereerd

### 4. Frontend Aanpassen (Later)

Dit kan je later doen, maar voor volledig werkende flow:

**In je frontend code**:
- [ ] Wijzig viewer route naar `/v/:shareId`
- [ ] Update API call naar `/api/viewer/share/:shareId`
- [ ] Gebruik `ifcDownloadUrl` om IFC te laden
- [ ] Deploy naar Vercel

### 5. Revit Add-in (Later)

**Deel met Revit developers**:
- [ ] API URL: `https://YOUR-RENDER-URL.onrender.com`
- [ ] Admin API Key: `8205df224312077ca34a0f846ba6b945200dd83980b`
- [ ] Documentatie: `src/backend/REVIT_INTEGRATION_GUIDE.md`

---

## 🎯 Prioriteit NU:

**ALLEEN stap 1-3** zijn nodig om de backend werkend te krijgen!

Stap 4-5 kunnen later, wanneer je de frontend en Revit add-in wilt integreren.

---

## ❓ Hulp Nodig?

Zie `DEPLOYMENT_CHECKLIST.md` voor volledige details.
