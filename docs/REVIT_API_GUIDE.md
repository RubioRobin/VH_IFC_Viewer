# BIM Admin API - Revit Plugin Integration Guide

## Overview
Deze documentatie beschrijft hoe de Revit plugin kan communiceren met de BIM Admin backend API voor het uploaden van IFC bestanden en genereren van QR codes.

## Base URL
```
http://localhost:3000
```

Voor productie: vervang met de juiste server URL.

## Authentication

### Login
**Endpoint:** `POST /api/auth/login`

**Request Body:**
```json
{
  "username": "admin",
  "password": "admin123"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "username": "admin",
    "role": "admin"
  }
}
```

**Headers:** De response bevat een session cookie die automatisch wordt meegestuurd bij volgende requests.

**C# Example:**
```csharp
using System.Net.Http;
using System.Text;
using Newtonsoft.Json;

var handler = new HttpClientHandler();
handler.CookieContainer = new CookieContainer();

var client = new HttpClient(handler);
client.BaseAddress = new Uri("http://localhost:3000");

var loginData = new { username = "admin", password = "admin123" };
var content = new StringContent(JsonConvert.SerializeObject(loginData), Encoding.UTF8, "application/json");

var response = await client.PostAsync("/api/auth/login", content);
var result = await response.Content.ReadAsStringAsync();
```

---

## Project Management

### Get All Projects
**Endpoint:** `GET /api/projects`

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "Project Name",
    "description": "Description",
    "status": "active",
    "created_at": "2026-02-02T12:00:00.000Z",
    "updated_at": "2026-02-02T12:00:00.000Z",
    "file_count": 5,
    "total_size": 1024000
  }
]
```

### Create Project
**Endpoint:** `POST /api/projects`

**Request Body:**
```json
{
  "name": "New Project",
  "description": "Optional description",
  "status": "active"
}
```

**Response:**
```json
{
  "id": "uuid",
  "name": "New Project",
  "description": "Optional description",
  "status": "active",
  "created_at": "2026-02-02T12:00:00.000Z",
  "updated_at": "2026-02-02T12:00:00.000Z"
}
```

---

## File Upload

### Upload IFC File
**Endpoint:** `POST /api/projects/:projectId/upload`

**Content-Type:** `multipart/form-data`

**Form Data:**
- `file`: IFC file (binary)

**C# Example:**
```csharp
using System.Net.Http;

var projectId = "your-project-uuid";
var filePath = @"C:\path\to\model.ifc";

using (var form = new MultipartFormDataContent())
{
    var fileContent = new ByteArrayContent(File.ReadAllBytes(filePath));
    fileContent.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
    form.Add(fileContent, "file", Path.GetFileName(filePath));

    var response = await client.PostAsync($"/api/projects/{projectId}/upload", form);
    var result = await response.Content.ReadAsStringAsync();
}
```

**Response:**
```json
{
  "id": "file-uuid",
  "project_id": "project-uuid",
  "filename": "model.ifc",
  "filepath": "/path/to/uploaded/file",
  "size": 1024000,
  "metadata": "{\"mimetype\":\"application/octet-stream\"}",
  "upload_date": "2026-02-02T12:00:00.000Z"
}
```

---

## QR Code Generation

### Generate QR Code
**Endpoint:** `POST /api/qr/generate`

**Request Body:**
```json
{
  "project_id": "project-uuid",
  "file_id": "file-uuid",
  "element_id": "2O2Fr$t4X7Zf8NOew3FLOH"
}
```

**Response:**
```json
{
  "id": "qr-uuid",
  "project_id": "project-uuid",
  "file_id": "file-uuid",
  "element_id": "2O2Fr$t4X7Zf8NOew3FLOH",
  "qr_code_url": "http://localhost:5173/?model=model.ifc&id=2O2Fr$t4X7Zf8NOew3FLOH",
  "qr_image_path": "/path/to/qr.png",
  "created_at": "2026-02-02T12:00:00.000Z",
  "qr_image_url": "/qr-codes/qr-uuid.png"
}
```

### Download QR Code Image
**Endpoint:** `GET /api/qr/:qrId`

**Response:** PNG image (binary)

**C# Example:**
```csharp
var qrId = "qr-uuid";
var response = await client.GetAsync($"/api/qr/{qrId}");
var imageBytes = await response.Content.ReadAsByteArrayAsync();

// Save to file
File.WriteAllBytes(@"C:\path\to\qr-code.png", imageBytes);
```

---

## Complete Workflow Example

### Scenario: Upload IFC and Generate QR Code for Element

```csharp
using System;
using System.Net.Http;
using System.Text;
using System.IO;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class BimApiClient
{
    private HttpClient client;
    private string baseUrl = "http://localhost:3000";
    
    public BimApiClient()
    {
        var handler = new HttpClientHandler();
        handler.CookieContainer = new CookieContainer();
        client = new HttpClient(handler);
        client.BaseAddress = new Uri(baseUrl);
    }
    
    // Step 1: Login
    public async Task<bool> Login(string username, string password)
    {
        var loginData = new { username, password };
        var content = new StringContent(
            JsonConvert.SerializeObject(loginData), 
            Encoding.UTF8, 
            "application/json"
        );
        
        var response = await client.PostAsync("/api/auth/login", content);
        return response.IsSuccessStatusCode;
    }
    
    // Step 2: Get or Create Project
    public async Task<string> GetOrCreateProject(string projectName)
    {
        // Get existing projects
        var response = await client.GetAsync("/api/projects");
        var json = await response.Content.ReadAsStringAsync();
        var projects = JArray.Parse(json);
        
        // Check if project exists
        var existingProject = projects.FirstOrDefault(p => 
            p["name"].ToString() == projectName
        );
        
        if (existingProject != null)
        {
            return existingProject["id"].ToString();
        }
        
        // Create new project
        var projectData = new { 
            name = projectName, 
            description = "Created from Revit", 
            status = "active" 
        };
        var content = new StringContent(
            JsonConvert.SerializeObject(projectData), 
            Encoding.UTF8, 
            "application/json"
        );
        
        response = await client.PostAsync("/api/projects", content);
        json = await response.Content.ReadAsStringAsync();
        var newProject = JObject.Parse(json);
        
        return newProject["id"].ToString();
    }
    
    // Step 3: Upload IFC File
    public async Task<string> UploadIfcFile(string projectId, string filePath)
    {
        using (var form = new MultipartFormDataContent())
        {
            var fileContent = new ByteArrayContent(File.ReadAllBytes(filePath));
            fileContent.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
            form.Add(fileContent, "file", Path.GetFileName(filePath));
            
            var response = await client.PostAsync(
                $"/api/projects/{projectId}/upload", 
                form
            );
            
            var json = await response.Content.ReadAsStringAsync();
            var file = JObject.Parse(json);
            
            return file["id"].ToString();
        }
    }
    
    // Step 4: Generate QR Code
    public async Task<byte[]> GenerateQrCode(
        string projectId, 
        string fileId, 
        string elementId
    )
    {
        var qrData = new { 
            project_id = projectId, 
            file_id = fileId, 
            element_id = elementId 
        };
        var content = new StringContent(
            JsonConvert.SerializeObject(qrData), 
            Encoding.UTF8, 
            "application/json"
        );
        
        var response = await client.PostAsync("/api/qr/generate", content);
        var json = await response.Content.ReadAsStringAsync();
        var qr = JObject.Parse(json);
        
        var qrId = qr["id"].ToString();
        
        // Download QR code image
        response = await client.GetAsync($"/api/qr/{qrId}");
        return await response.Content.ReadAsByteArrayAsync();
    }
    
    // Complete workflow
    public async Task<byte[]> CompleteWorkflow(
        string projectName,
        string ifcFilePath,
        string elementGlobalId
    )
    {
        // 1. Login
        await Login("admin", "admin123");
        
        // 2. Get or create project
        var projectId = await GetOrCreateProject(projectName);
        
        // 3. Upload IFC file
        var fileId = await UploadIfcFile(projectId, ifcFilePath);
        
        // 4. Generate QR code
        var qrImage = await GenerateQrCode(projectId, fileId, elementGlobalId);
        
        return qrImage;
    }
}
```

### Usage in Revit Plugin:
```csharp
// In your Revit command
var apiClient = new BimApiClient();

// Get selected element
var element = uidoc.Selection.PickObject(ObjectType.Element);
var globalId = element.GlobalId;

// Export to IFC (simplified)
string ifcPath = ExportToIfc(doc);

// Upload and generate QR
byte[] qrImage = await apiClient.CompleteWorkflow(
    projectName: doc.Title,
    ifcFilePath: ifcPath,
    elementGlobalId: globalId
);

// Save QR code or place in Revit
File.WriteAllBytes(@"C:\temp\qr-code.png", qrImage);

// TODO: Place QR code as annotation in Revit drawing
```

---

## Error Handling

All endpoints return appropriate HTTP status codes:

- `200 OK`: Success
- `201 Created`: Resource created successfully
- `400 Bad Request`: Invalid request data
- `401 Unauthorized`: Authentication required
- `404 Not Found`: Resource not found
- `500 Internal Server Error`: Server error

Error responses include a JSON body:
```json
{
  "error": "Error message description"
}
```

---

## Notes

1. **Session Management**: De session cookie blijft 24 uur geldig. Daarna moet opnieuw ingelogd worden.

2. **File Size Limits**: Maximum upload size is 500MB per bestand.

3. **CORS**: De backend is geconfigureerd om requests van `http://localhost:5173` te accepteren. Voor productie moet dit aangepast worden.

4. **QR Code URL**: De gegenereerde QR code bevat een URL naar de viewer met de model filename en element ID als parameters.

5. **Viewer URL Format**: 
   ```
   http://localhost:5173/?model=<filename>&id=<elementId>
   ```

---

## Testing

Test de API endpoints met tools zoals:
- Postman
- cURL
- Browser Developer Tools

Example cURL command:
```bash
# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' \
  -c cookies.txt

# Get projects
curl http://localhost:3000/api/projects \
  -b cookies.txt
```
