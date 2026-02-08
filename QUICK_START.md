# Signed Upload Flow - Quick Start Guide

## What Was Built

✅ **Direct upload flow**: Revit → Signed URL → Supabase Storage (bypass Render)  
✅ **QR code generation**: Automatic PNG generation with public viewer link  
✅ **Public viewer**: Share IFC files via unguessable `shareId` token  
✅ **Multi-tenant database**: Organizations, models, revisions, shares  
✅ **Security**: Service role key isolation, admin API key auth, RLS policies  

## Files Created

### Database
- `src/backend/migrations/001_signed_upload_schema.sql` - Schema migration

### Services
- `src/backend/services/supabase-admin.js` - Service role client + signed URLs
- `src/backend/services/share-generator.js` - ShareId generation
- `src/backend/services/qr-generator.js` - QR code generation
- `src/backend/services/database-helpers.js` - DB CRUD operations

### Routes
- `src/backend/routes/upload.js` - Upload init/complete/QR endpoints
- `src/backend/routes/viewer.js` - Public viewer endpoint

### Middleware
- `src/backend/middleware/admin-api-key.js` - API key authentication

### Documentation
- `src/backend/REVIT_INTEGRATION_GUIDE.md` - Complete API docs + C# examples
- `src/backend/.env.example` - Environment variables template
- `DEPLOYMENT_CHECKLIST.md` - Step-by-step deployment guide

## Quick Start (Local)

1. **Install dependencies**:
   ```bash
   cd src/backend
   npm install
   ```

2. **Configure `.env`**:
   ```bash
   cp .env.example .env
   # Edit .env and add:
   # - SUPABASE_SERVICE_ROLE_KEY (from Supabase Dashboard)
   # - ADMIN_API_KEY (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
   ```

3. **Start server**:
   ```bash
   npm start
   ```

4. **Test**:
   ```bash
   curl http://localhost:3001/api/health
   ```

## API Flow

```
1. POST /api/upload/init → {signedUploadUrl, modelId, revisionId}
2. PUT <signedUploadUrl> → Upload IFC directly to Supabase
3. POST /api/upload/complete → {shareUrl, qrDownloadUrl}
4. GET /api/models/:modelId/revisions/:revisionId/qrcode → QR PNG
5. GET /api/viewer/share/:shareId (PUBLIC) → {ifcDownloadUrl, viewState}
```

## Deployment

Follow **[DEPLOYMENT_CHECKLIST.md](file:///C:/Users/Robin/Downloads/VH_IFC_Viewer/DEPLOYMENT_CHECKLIST.md)** for production deployment.

## Revit Integration

See **[REVIT_INTEGRATION_GUIDE.md](file:///C:/Users/Robin/Downloads/VH_IFC_Viewer/src/backend/REVIT_INTEGRATION_GUIDE.md)** for complete C# examples.

## Next Steps

1. Get Supabase service role key
2. Generate admin API key
3. Deploy to Render
4. Test production endpoints
5. Share API key with Revit add-in developers
