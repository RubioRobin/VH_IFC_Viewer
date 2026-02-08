# Deployment Checklist

## Prerequisites

- [ ] Supabase project created
- [ ] Render account set up
- [ ] GitHub repository configured

## Database Setup

- [x] Run migration `001_signed_upload_schema.sql` in Supabase SQL Editor
- [x] Verify tables created: `organizations`, `models`, `revisions`, `shares`
- [x] Verify RLS policies enabled on all tables
- [x] Verify VH Engineering organization seeded

## Storage Setup

- [x] Create `ifc-private` bucket (private, 500MB limit)
- [x] Create `qr-public` bucket (public, 5MB limit)
- [x] Configure storage policies for both buckets
- [ ] Test signed upload URL generation
- [ ] Test signed download URL generation

## Environment Variables

### Supabase Dashboard

Get the following from Supabase Dashboard > Settings > API:

- [ ] Copy `SUPABASE_URL`
- [ ] Copy `SUPABASE_SERVICE_ROLE_KEY` (⚠️ Keep this secret!)

### Generate Admin API Key

Run this command to generate a secure API key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

- [ ] Save generated key as `ADMIN_API_KEY`

### Render Environment Variables

Add these to Render > Environment:

```
PORT=3001
NODE_ENV=production
FRONTEND_URL=https://vh-ifc-viewer.vercel.app
VIEWER_URL=https://vh-ifc-viewer.vercel.app
SUPABASE_URL=<from-supabase-dashboard>
SUPABASE_KEY=<anon-key-from-supabase>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key-from-supabase>
ADMIN_API_KEY=<generated-secure-key>
```

- [ ] Add all environment variables to Render
- [ ] Verify no typos in variable names
- [ ] Verify service role key is correct (starts with `eyJ...`)

## Backend Deployment

- [ ] Install dependencies: `cd src/backend && npm install`
- [ ] Test locally: `npm start`
- [ ] Verify server starts without errors
- [ ] Test health endpoint: `curl http://localhost:3001/api/health`
- [ ] Push to GitHub
- [ ] Deploy to Render
- [ ] Verify Render deployment successful
- [ ] Test production health endpoint

## API Testing

### Test Upload Flow

```bash
# Replace with your actual values
API_URL="https://your-api.onrender.com"
ADMIN_KEY="your-admin-api-key"

# 1. Test init
curl -X POST "$API_URL/api/upload/init" \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "test-project",
    "fileName": "test.ifc",
    "fileSize": 1000
  }'

# Should return: modelId, revisionId, signedUploadUrl, expiresAt
```

- [ ] Test `/api/upload/init` endpoint
- [ ] Test signed upload URL (upload a small test file)
- [ ] Test `/api/upload/complete` endpoint
- [ ] Test `/api/models/:modelId/revisions/:revisionId/qrcode` endpoint
- [ ] Verify QR code generated in `qr-public` bucket

### Test Viewer Endpoint

```bash
# Get shareId from complete response
curl "$API_URL/api/viewer/share/<shareId>"

# Should return: project, model, revision with ifcDownloadUrl
```

- [ ] Test `/api/viewer/share/:shareId` endpoint (no auth)
- [ ] Verify signed download URL works
- [ ] Test expired share (if applicable)

## Frontend Updates

- [ ] Update viewer route to `/v/:shareId`
- [ ] Update API call to use `/api/viewer/share/:shareId`
- [ ] Test viewer loads IFC from signed URL
- [ ] Test viewState application (camera, section box)
- [ ] Deploy frontend to Vercel

## CORS Configuration

- [ ] Verify CORS allows viewer domain for `/api/viewer/*`
- [ ] Test CORS from frontend (check browser console)

## Security Verification

- [ ] Verify service role key is NOT in frontend code
- [ ] Verify admin API key is NOT in frontend code
- [ ] Verify `ifc-private` bucket is not publicly accessible
- [ ] Verify `qr-public` bucket IS publicly accessible
- [ ] Test invalid API key returns 403
- [ ] Test missing API key returns 401

## Revit Add-in Configuration

- [ ] Share `ADMIN_API_KEY` with Revit add-in developers (securely!)
- [ ] Update add-in to use production API URL
- [ ] Test complete flow: Revit → Upload → QR → Viewer

## Monitoring & Logs

- [ ] Set up Render logging
- [ ] Monitor for errors in first 24 hours
- [ ] Check Supabase dashboard for storage usage
- [ ] Check database for new records (models, revisions, shares)

## Documentation

- [ ] Share `REVIT_INTEGRATION_GUIDE.md` with add-in developers
- [ ] Document API endpoints for team
- [ ] Create internal wiki page with deployment info

## Rollback Plan

If something goes wrong:

1. Revert Render deployment to previous version
2. Check Render logs for errors
3. Verify environment variables are correct
4. Test locally to reproduce issue
5. Fix and redeploy

## Post-Deployment

- [ ] Test complete flow end-to-end
- [ ] Monitor performance for 24 hours
- [ ] Gather feedback from Revit add-in users
- [ ] Plan for future enhancements (device pairing, rate limiting, etc.)
