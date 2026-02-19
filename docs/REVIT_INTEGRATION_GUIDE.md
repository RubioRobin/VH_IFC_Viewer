# Revit Add-in Integration Guide

This guide explains how to integrate the Revit add-in with the VH IFC Viewer backend for direct IFC upload to Supabase Storage.

## Overview

The Revit add-in uploads IFC files **directly to Supabase Storage** via signed URLs, bypassing the Render backend. This approach is more efficient and scalable than uploading through the API server.

## Flow Diagram

```
1. Revit exports IFC locally
2. Revit → API: POST /api/upload/init (get signed upload URL)
3. Revit → Supabase Storage: PUT <signedUploadUrl> (direct upload)
4. Revit → API: POST /api/upload/complete (generate QR code)
5. Revit → API: GET /api/models/{modelId}/revisions/{revisionId}/qrcode (download QR)
6. Revit places QR on sheet
```

## Authentication

All API requests must include the **Admin API Key** in the `Authorization` header:

```
Authorization: Bearer <ADMIN_API_KEY>
```

**Security Note**: The API key should be stored securely in the Revit add-in configuration and NEVER hardcoded in source code.

## API Endpoints

### 1. Initialize Upload

**Endpoint**: `POST /api/upload/init`

**Headers**:
```
Authorization: Bearer <ADMIN_API_KEY>
Content-Type: application/json
```

**Request Body**:
```json
{
  "projectId": "uuid-or-string",
  "modelName": "Building A",
  "fileName": "BuildingA_Rev01.ifc",
  "fileSize": 12345678,
  "sha256": "optional-hash-for-duplicate-detection",
  "viewState": {
    "camera": {
      "position": [10, 5, 15],
      "target": [0, 0, 0]
    },
    "sectionBox": {
      "min": [0, 0, 0],
      "max": [100, 50, 30]
    }
  },
  "meta": {
    "revitDocGuid": "guid-from-revit",
    "viewId": "view-id",
    "elementIds": ["id1", "id2"]
  }
}
```

**Response** (200 OK):
```json
{
  "modelId": "uuid",
  "revisionId": "uuid",
  "objectKey": "projects/{projectId}/models/{modelId}/revisions/{revisionId}/BuildingA_Rev01.ifc",
  "signedUploadUrl": "https://...supabase.co/storage/v1/object/upload/sign/...",
  "expiresAt": "2026-02-08T12:00:00Z"
}
```

**Error Responses**:
- `400 Bad Request`: Missing required fields or invalid file type
- `401 Unauthorized`: Missing or invalid API key
- `500 Internal Server Error`: Server error

---

### 2. Upload IFC File

**Endpoint**: `PUT <signedUploadUrl>` (from step 1)

**Headers**:
```
Content-Type: application/octet-stream
```

**Body**: Binary IFC file data

**Notes**:
- This is a **direct upload to Supabase Storage**, not to the API server
- The signed URL is valid for **15 minutes**
- If upload fails or times out, call `/api/upload/init` again to get a new signed URL

**C# Example**:
```csharp
using (var client = new HttpClient())
{
    var fileContent = new ByteArrayContent(File.ReadAllBytes(ifcFilePath));
    fileContent.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
    
    var response = await client.PutAsync(signedUploadUrl, fileContent);
    response.EnsureSuccessStatusCode();
}
```

---

### 3. Complete Upload

**Endpoint**: `POST /api/upload/complete`

**Headers**:
```
Authorization: Bearer <ADMIN_API_KEY>
Content-Type: application/json
```

**Request Body**:
```json
{
  "modelId": "uuid-from-init",
  "revisionId": "uuid-from-init",
  "viewState": {
    "camera": { ... },
    "sectionBox": { ... }
  }
}
```

**Response** (200 OK):
```json
{
  "status": "ready",
  "shareUrl": "https://vh-ifc-viewer.vercel.app/v/AbC123XyZ",
  "qrDownloadUrl": "/api/models/{modelId}/revisions/{revisionId}/qrcode?format=png",
  "qrPublicUrl": "https://...supabase.co/storage/v1/object/public/qr-public/shares/AbC123XyZ.png"
}
```

**Notes**:
- This endpoint generates the QR code and creates the public share link
- The `shareUrl` is what gets encoded in the QR code
- This endpoint is **idempotent** - calling it multiple times with the same `revisionId` will return the same result

---

### 4. Download QR Code

**Endpoint**: `GET /api/models/{modelId}/revisions/{revisionId}/qrcode?format=png`

**Headers**:
```
Authorization: Bearer <ADMIN_API_KEY>
```

**Query Parameters**:
- `format`: `png` or `svg` (default: `png`)

**Response**: Redirects to signed download URL for the QR code image

**C# Example**:
```csharp
using (var client = new HttpClient())
{
    client.DefaultRequestHeaders.Authorization = 
        new AuthenticationHeaderValue("Bearer", adminApiKey);
    
    var response = await client.GetAsync(qrDownloadUrl);
    var qrImageBytes = await response.Content.ReadAsByteArrayAsync();
    
    // Save to temp file for Revit import
    File.WriteAllBytes(tempQrPath, qrImageBytes);
}
```

---

## Complete C# Example

```csharp
public async Task<string> UploadIfcAndGetQR(string ifcFilePath, string projectId)
{
    var apiBaseUrl = "https://your-api.onrender.com";
    var adminApiKey = "your-admin-api-key";
    
    using (var client = new HttpClient())
    {
        client.DefaultRequestHeaders.Authorization = 
            new AuthenticationHeaderValue("Bearer", adminApiKey);
        
        // Step 1: Initialize upload
        var initRequest = new
        {
            projectId = projectId,
            fileName = Path.GetFileName(ifcFilePath),
            fileSize = new FileInfo(ifcFilePath).Length
        };
        
        var initResponse = await client.PostAsJsonAsync(
            $"{apiBaseUrl}/api/upload/init", 
            initRequest
        );
        initResponse.EnsureSuccessStatusCode();
        
        var initData = await initResponse.Content.ReadAsAsync<dynamic>();
        string signedUploadUrl = initData.signedUploadUrl;
        string modelId = initData.modelId;
        string revisionId = initData.revisionId;
        
        // Step 2: Upload IFC directly to Supabase
        var fileContent = new ByteArrayContent(File.ReadAllBytes(ifcFilePath));
        fileContent.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        
        var uploadResponse = await client.PutAsync(signedUploadUrl, fileContent);
        uploadResponse.EnsureSuccessStatusCode();
        
        // Step 3: Complete upload and generate QR
        var completeRequest = new
        {
            modelId = modelId,
            revisionId = revisionId
        };
        
        var completeResponse = await client.PostAsJsonAsync(
            $"{apiBaseUrl}/api/upload/complete",
            completeRequest
        );
        completeResponse.EnsureSuccessStatusCode();
        
        var completeData = await completeResponse.Content.ReadAsAsync<dynamic>();
        string qrDownloadUrl = completeData.qrDownloadUrl;
        
        // Step 4: Download QR code
        var qrResponse = await client.GetAsync($"{apiBaseUrl}{qrDownloadUrl}");
        var qrBytes = await qrResponse.Content.ReadAsByteArrayAsync();
        
        // Save QR to temp file
        var tempQrPath = Path.Combine(Path.GetTempPath(), $"qr_{revisionId}.png");
        File.WriteAllBytes(tempQrPath, qrBytes);
        
        return tempQrPath;
    }
}
```

---

## Error Handling

### Timeout During Upload
If the upload to Supabase times out (signed URL expires after 15 minutes):
1. Call `/api/upload/init` again with the same parameters
2. The backend will detect the duplicate and return the existing revision OR create a new one
3. Retry the upload with the new signed URL

### Duplicate Detection
If you provide a `sha256` hash in the init request, the backend will check for duplicates:
- If a duplicate is found, the init response will include `"duplicate": true` and the existing `revisionId`
- You can skip the upload and proceed directly to `/api/upload/complete`

### Network Errors
- Implement retry logic with exponential backoff
- Log errors for debugging
- Show user-friendly error messages in Revit UI

---

## Placing QR Code on Revit Sheet

After downloading the QR code PNG, you can place it on a Revit sheet using the `ImageInstance` API:

```csharp
public void PlaceQROnSheet(Document doc, string qrImagePath, ElementId sheetId)
{
    using (Transaction trans = new Transaction(doc, "Place QR Code"))
    {
        trans.Start();
        
        // Create ImageType
        var imageType = ImageType.Create(doc, qrImagePath);
        
        // Get sheet
        var sheet = doc.GetElement(sheetId) as ViewSheet;
        
        // Place image on sheet
        var imageInstance = ImageInstance.Create(doc, sheet, imageType.Id);
        
        // Position image (adjust as needed)
        var location = imageInstance.Location as LocationPoint;
        location.Point = new XYZ(1.5, 0.5, 0); // Bottom right corner
        
        trans.Commit();
    }
}
```

---

## Security Best Practices

1. **Never hardcode the API key** - Store it in a secure configuration file or user settings
2. **Use HTTPS** - All API calls must use HTTPS in production
3. **Validate responses** - Always check HTTP status codes and handle errors gracefully
4. **Log securely** - Don't log sensitive data (API keys, signed URLs)
5. **Timeout handling** - Implement proper timeout handling for long uploads

---

## Testing

### Local Testing
1. Start backend locally: `cd src/backend && npm start`
2. Use Postman or curl to test endpoints
3. Point Revit add-in to `http://localhost:3001`

### Production Testing
1. Deploy backend to Render
2. Update `ADMIN_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` in Render environment variables
3. Point Revit add-in to production URL

---

## Support

For issues or questions, contact VH Engineering support.
