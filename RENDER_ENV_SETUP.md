# Render Environment Variables - KOPIEER DEZE EXACT

Ga naar Render Dashboard → Je backend service → Environment

Voeg deze environment variables toe (of update bestaande):

## Nieuwe Variables (BELANGRIJK!)

```
SUPABASE_SERVICE_ROLE_KEY
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxxa2RjbGx5aWtjdHVkcmdkYW5wIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDM3NTIxNSwiZXhwIjoyMDg1OTUxMjE1fQ.bxbWjrPUB9Qi8ZMO4URvR28-E4anB2EX320hIYFafyc
```

```
ADMIN_API_KEY
8205df224312077ca34a0f846ba6b945200dd83980b
```

```
VIEWER_URL
https://vh-ifc-viewer.vercel.app
```

## Bestaande Variables (Controleer of deze correct zijn)

```
PORT
3001
```

```
NODE_ENV
production
```

```
FRONTEND_URL
https://vh-ifc-viewer.vercel.app
```

```
SUPABASE_URL
https://lqkdcllyikctudrgdanp.supabase.co
```

```
SUPABASE_KEY
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxxa2RjbGx5aWtjdHVkcmdkYW5wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzNzUyMTUsImV4cCI6MjA4NTk1MTIxNX0.9FWKG_QLfcEc5qXw5irnTeB1ppaIOEk_GMkbyAOHELU
```

---

## Na het toevoegen:

1. Klik op "Save Changes"
2. Render zal automatisch re-deployen
3. Wacht tot deployment klaar is (check de logs)
4. Test de endpoints

---

## Test Commands (na deployment):

```bash
# Vervang YOUR-RENDER-URL met je echte Render URL

# 1. Test health
curl https://YOUR-RENDER-URL.onrender.com/api/health

# 2. Test upload init
curl -X POST https://YOUR-RENDER-URL.onrender.com/api/upload/init \
  -H "Authorization: Bearer 8205df224312077ca34a0f846ba6b945200dd83980b" \
  -H "Content-Type: application/json" \
  -d '{"projectId":"test-project-1","fileName":"test.ifc","fileSize":1000000}'
```

---

## Belangrijke Notes:

⚠️ **SUPABASE_SERVICE_ROLE_KEY**: Dit is de belangrijkste nieuwe variable - zonder deze werken de signed URLs niet!

⚠️ **ADMIN_API_KEY**: Deze is nodig voor de Revit add-in authenticatie

⚠️ **VIEWER_URL**: Nodig voor QR code generatie (de URL die in de QR code komt)

✅ Alle andere variables zijn waarschijnlijk al geconfigureerd
