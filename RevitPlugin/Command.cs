using System;
using System.Collections.Generic;
using System.Linq;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Threading.Tasks;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Autodesk.Revit.Attributes;
using System.Text.Json; // Using System.Text.Json for modern .NET

namespace VH_IFC_QR
{
    [Transaction(TransactionMode.Manual)]
    public class GenerateQRCommand : IExternalCommand
    {
        // Backend URL configuration - Default fallback
        private const string DefaultBackendUrl = "https://vh-ifc-backend.onrender.com";
        // Hardcoded project ID for MVP (User can change this or we implement a selector later)
        private const string ProjectId = "default-project-id"; 

        public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
        {
            UIDocument uidoc = commandData.Application.ActiveUIDocument;
            Document doc = uidoc.Document;

            // Load Backend URL from config file if exists
            string backendUrl = GetConfiguredUrl();

            try
            {
                // 1. Get Elements for Selection
                var views3D = new FilteredElementCollector(doc)
                    .OfClass(typeof(View3D))
                    .Cast<View3D>()
                    .Where(v => !v.IsTemplate)
                    .OrderBy(v => v.Name)
                    .ToList();

                var sheets = new FilteredElementCollector(doc)
                    .OfClass(typeof(ViewSheet))
                    .Cast<ViewSheet>()
                    .OrderBy(s => s.Name)
                    .ToList();

                if (views3D.Count == 0 || sheets.Count == 0)
                {
                    TaskDialog.Show("Fout", "Geen 3D views of Sheets gevonden in dit project.");
                    return Result.Failed;
                }

                // 2. Show Selection UI
                ElementId exportViewId = null;
                ElementId targetSheetId = null;

                using (var form = new SelectionForm(views3D, sheets))
                {
                    if (form.ShowDialog() != System.Windows.Forms.DialogResult.OK)
                    {
                        return Result.Cancelled;
                    }
                    exportViewId = form.Selected3DViewId;
                    targetSheetId = form.SelectedSheetId;
                }

                View3D exportView = doc.GetElement(exportViewId) as View3D;
                ViewSheet targetSheet = doc.GetElement(targetSheetId) as ViewSheet;

                // 3. Selection handling (Optional - for highlighting)
                var selection = uidoc.Selection.GetElementIds();
                string ifcGuid = null;
                
                if (selection.Count == 1)
                {
                    ElementId elementId = selection.First();
                    Element element = doc.GetElement(elementId);
                    ifcGuid = GetIfcGuid(element.UniqueId);
                }

                // 4. Export Selected 3D View to IFC
                string tempIfcPath = Path.Combine(Path.GetTempPath(), $"{doc.Title}-{Guid.NewGuid()}.ifc");
                bool exportSuccess = false;

                using (Transaction t = new Transaction(doc, "Export IFC"))
                {
                    t.Start();
                    exportSuccess = ExportToIfc(doc, exportView, tempIfcPath);
                    t.Commit();
                }

                if (!exportSuccess)
                {
                    TaskDialog.Show("Error", "Export to IFC failed.");
                    return Result.Failed;
                }

                // 3. Upload IFC and Get QR
                string qrImagePath = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid()}.png");
                
                // Show a dialog to let the user know we are working (prevents "freeze" panic)
                // Use a non-modal message if possible or just be fast.
                // We'll use a simple Wait cursor
                System.Windows.Forms.Cursor.Current = System.Windows.Forms.Cursors.WaitCursor;


                bool success = false;
                string errorDetails = "";
                try 
                {
                    success = Task.Run(async () => await ProcessUploadAndQr(backendUrl, doc.Title, tempIfcPath, ifcGuid, qrImagePath)).GetAwaiter().GetResult();
                }
                catch (Exception uploadEx)
                {
                    errorDetails = $"FOUT: {uploadEx.Message}\n\nType: {uploadEx.GetType().Name}\n\nStack:\n{uploadEx.StackTrace?.Substring(0, Math.Min(300, uploadEx.StackTrace?.Length ?? 0))}";
                    if (uploadEx.InnerException != null)
                    {
                        errorDetails += $"\n\nInner Exception: {uploadEx.InnerException.Message}";
                    }
                }
                finally
                {
                    System.Windows.Forms.Cursor.Current = System.Windows.Forms.Cursors.Default;
                }

                if (!success)
                {
                     if (!string.IsNullOrEmpty(errorDetails))
                     {
                         TaskDialog.Show("Error Details", errorDetails);
                     }
                     else
                     {
                         TaskDialog.Show("Error", "Upload failed maar geen exception details beschikbaar.");
                     }
                     return Result.Failed;
                }

                // 6. Place QR in Revit on Target Sheet
                using (Transaction t = new Transaction(doc, "Place QR Code"))
                {
                    t.Start();
                    PlaceQrImageOnView(doc, targetSheet, qrImagePath);
                    t.Commit();
                }

                string target = string.IsNullOrEmpty(ifcGuid) ? "the active View" : "the selected Element";
                TaskDialog.Show("Success", $"QR Code generated for {target} and placed in Revit!");
                return Result.Succeeded;
            }
            catch (Exception ex)
            {
                message = ex.Message + "\n" + ex.StackTrace;
                return Result.Failed;
            }
        }

        private string GetConfiguredUrl()
        {
            try
            {
                // Look for config.txt in the same folder as the assembly
                string assemblyPath = System.Reflection.Assembly.GetExecutingAssembly().Location;
                string folder = Path.GetDirectoryName(assemblyPath);
                string configPath = Path.Combine(folder, "config.txt");

                if (File.Exists(configPath))
                {
                    string url = File.ReadAllText(configPath).Trim();
                    if (Uri.IsWellFormedUriString(url, UriKind.Absolute))
                    {
                        return url;
                    }
                }
            }
            catch { /* Ignore read errors, use default */ }
            return DefaultBackendUrl;
        }

        private bool ExportToIfc(Document doc, View activeView, string outputPath)
        {
            try
            {
                IFCExportOptions options = new IFCExportOptions();
                options.FileVersion = IFCVersion.IFC2x3; // Standard compatibility
                options.FilterViewId = activeView.Id; // Export only this view
                options.ExportBaseQuantities = true;
                
                // Split path into directory and filename
                string dir = Path.GetDirectoryName(outputPath);
                string filename = Path.GetFileName(outputPath);

                return doc.Export(dir, filename, options);
            }
            catch (Exception ex)
            {
                TaskDialog.Show("Export Error", ex.Message);
                return false;
            }
        }

        private async Task<bool> ProcessUploadAndQr(string backendUrl, string modelName, string ifcPath, string elementGuid, string qrSavePath)
        {
            var cookieContainer = new System.Net.CookieContainer();
            using (var handler = new HttpClientHandler { CookieContainer = cookieContainer, UseCookies = true })
            using (var client = new HttpClient(handler))
            {
                client.Timeout = TimeSpan.FromSeconds(120); // Extended for Render cold start (60s wake + 60s processing)
                
                try
                {
                    // A. Create/Get Project
                    string projectId = await GetOrCreateProject(client, backendUrl, "Revit Exports").ConfigureAwait(false);
                    if (string.IsNullOrEmpty(projectId))
                    {
                        TaskDialog.Show("Debug", "STAP 1 GEFAALD: GetOrCreateProject returned null");
                        return false;
                    }
                    TaskDialog.Show("Debug", $"STAP 1 OK: Project ID = {projectId}");

                    // B. Upload File
                    string fileId = await UploadFile(client, backendUrl, projectId, ifcPath).ConfigureAwait(false);
                    if (string.IsNullOrEmpty(fileId))
                    {
                        TaskDialog.Show("Debug", "STAP 2 GEFAALD: UploadFile returned null");
                        return false;
                    }
                    TaskDialog.Show("Debug", $"STAP 2 OK: File ID = {fileId}");

                    // C. Generate QR
                    bool qrSuccess = await GenerateAndDownloadQr(client, backendUrl, projectId, fileId, elementGuid, qrSavePath).ConfigureAwait(false);
                    if (!qrSuccess)
                    {
                        TaskDialog.Show("Debug", "STAP 3 GEFAALD: GenerateAndDownloadQr returned false");
                        return false;
                    }
                    TaskDialog.Show("Debug", "STAP 3 OK: QR Generated");
                    
                    return true;
                }
                catch (Exception ex)
                {
                    TaskDialog.Show("ProcessUploadAndQr Exception", $"Error: {ex.Message}\n\nType: {ex.GetType().Name}");
                    return false;
                }
            }
        }

        private async Task<string> GetOrCreateProject(HttpClient client, string backendUrl, string projectName)
        {
            try {
                // Login first
                await Login(client, backendUrl).ConfigureAwait(false); 
                
                // List projects
                var response = await client.GetAsync($"{backendUrl}/api/projects").ConfigureAwait(false);
                if (!response.IsSuccessStatusCode) return null;

                var content = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                using (var doc = JsonDocument.Parse(content))
                {
                    if (doc.RootElement.GetArrayLength() > 0)
                    {
                        return doc.RootElement[0].GetProperty("id").GetString();
                    }
                }

                // If no project, create one
                var createContent = new StringContent(
                    JsonSerializer.Serialize(new { name = projectName }), 
                    System.Text.Encoding.UTF8, "application/json");
                
                var createData = await client.PostAsync($"{backendUrl}/api/projects", createContent).ConfigureAwait(false);
                if (createData.IsSuccessStatusCode)
                {
                    var created = await createData.Content.ReadAsStringAsync().ConfigureAwait(false);
                     using (var doc = JsonDocument.Parse(created))
                    {
                        return doc.RootElement.GetProperty("id").GetString();
                    }
                }
                return null;
            } catch { return null; }
        }

        private async Task Login(HttpClient client, string backendUrl)
        {
            var loginData = new { username = "admin", password = "admin123" };
            var content = new StringContent(
                JsonSerializer.Serialize(loginData), 
                System.Text.Encoding.UTF8, "application/json");
            
            var response = await client.PostAsync($"{backendUrl}/api/auth/login", content);
            
            if (!response.IsSuccessStatusCode)
            {
                var errorBody = await response.Content.ReadAsStringAsync();
                throw new Exception($"Login failed: {response.StatusCode} - {errorBody}");
            }
        }

        private async Task<string> UploadFile(HttpClient client, string backendUrl, string projectId, string filePath)
        {
            try
            {
                using (var content = new MultipartFormDataContent())
                {
                    var fileStream = File.OpenRead(filePath);
                    var fileContent = new StreamContent(fileStream);
                    fileContent.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
                    content.Add(fileContent, "file", Path.GetFileName(filePath));

                    var response = await client.PostAsync($"{backendUrl}/api/projects/{projectId}/upload", content).ConfigureAwait(false);
                    if (response.IsSuccessStatusCode)
                    {
                        var resString = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                        using (var doc = JsonDocument.Parse(resString))
                        {
                            return doc.RootElement.GetProperty("id").GetString();
                        }
                    }
                    return null;
                }
            }
            catch { return null; }
        }

        private async Task<bool> GenerateAndDownloadQr(HttpClient client, string backendUrl, string projectId, string fileId, string elementId, string savePath)
        {
            try
            {
                var reqData = new { project_id = projectId, file_id = fileId, element_id = elementId };
                var content = new StringContent(
                     JsonSerializer.Serialize(reqData),
                     System.Text.Encoding.UTF8, "application/json");

                var response = await client.PostAsync($"{backendUrl}/api/qr/generate", content).ConfigureAwait(false);
                if (!response.IsSuccessStatusCode) return false;

                var jsonStr = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                string qrImageUrlRelative;
                using (var doc = JsonDocument.Parse(jsonStr))
                {
                    qrImageUrlRelative = doc.RootElement.GetProperty("qr_image_url").GetString();
                }

                // Download image
                var imgBytes = await client.GetByteArrayAsync($"{backendUrl}{qrImageUrlRelative}").ConfigureAwait(false);
                File.WriteAllBytes(savePath, imgBytes);
                return true;
            }
            catch { return false; }
        }

        private void PlaceQrImageOnView(Document doc, View targetView, string imagePath)
        {
            ImageTypeOptions options = new ImageTypeOptions(imagePath, false, ImageTypeSource.Import);
            ImageType imageType = ImageType.Create(doc, options);

            BoundingBoxUV box = targetView.Outline;
            XYZ center = new XYZ((box.Min.U + box.Max.U) / 2, (box.Min.V + box.Max.V) / 2, 0);
            
            ImageInstance.Create(doc, targetView, imageType.Id, new ImagePlacementOptions(center, BoxPlacement.Center));
        }

        private string GetIfcGuid(string uniqueId)
        {
            if (uniqueId.Length < 36) return uniqueId;
            if (Guid.TryParse(uniqueId.Substring(0, 36), out Guid guid))
            {
                return CreateIfcGuid(guid);
            }
            return uniqueId;
        }

        // Standard IFC GUID Implementation (matches previous)
        private static string CreateIfcGuid(Guid guid)
        {
             byte[] b = guid.ToByteArray();
             uint d1 = BitConverter.ToUInt32(b, 0);
             ushort d2 = BitConverter.ToUInt16(b, 4);
             ushort d3 = BitConverter.ToUInt16(b, 6);
             return InternalToIfcGuid(d1, d2, d3, b[8], b[9], b[10], b[11], b[12], b[13], b[14], b[15]);
        }

        private static string InternalToIfcGuid(uint d1, ushort d2, ushort d3, byte b0, byte b1, byte b2, byte b3, byte b4, byte b5, byte b6, byte b7)
        {
            char[] base64Chars = new char[] { '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 
                'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 
                'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', 
                '_', '$' };
            char[] str = new char[22];
            uint[] num = new uint[6];
            uint n = 2, pos = 0;
            num[0] = (uint)(d1 / 16777216); num[1] = (uint)(d1 % 16777216);
            num[2] = (uint)(d2 * 256 + d3 / 256); num[3] = (uint)((d3 % 256) * 65536 + b0 * 256 + b1);
            num[4] = (uint)(b2 * 65536 + b3 * 256 + b4); num[5] = (uint)(b5 * 65536 + b6 * 256 + b7);
            for (int i = 0; i < 6; i++) { InternalToString(num[i], str, n, ref pos, base64Chars); n = 4; }
            return new string(str);
        }
        private static void InternalToString(uint num, char[] str, uint n, ref uint pos, char[] chars) {
            uint act = num; for (uint i = 0; i < n; i++) { str[pos++] = chars[(int)(act % 64)]; act /= 64; }
        }
    }
}
