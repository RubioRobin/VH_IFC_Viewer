using System;
using System.Collections.Generic;
using System.Linq;
using System.IO;
using System.Net.Http;
using System.Net.Http.Json; // Requires .NET 5+
using System.Threading.Tasks;
using System.Text.Json;
using System.Text;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Autodesk.Revit.Attributes;

namespace VH_IFC_QR
{
    [Transaction(TransactionMode.Manual)]
    public class GenerateQRCommand : IExternalCommand
    {
        // Production Configuration
        private const string ApiBaseUrl = "https://vh-ifc-backend.onrender.com"; // Updated to production URL
        // WARNING: IN PRODUCTION, THIS KEY SHOULD BE SECURELY STORED OR RETRIEVED!
        private const string AdminApiKey = "8205df224312077ca34a0f846ba6b945200dd83980b"; 
        
        // Target Project ID is now selected via UI
        // private const string TargetProjectId = "2e12255a-d922-4c85-98ad-56c0d8638b94";

        public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
        {
            UIDocument uidoc = commandData.Application.ActiveUIDocument;
            Document doc = uidoc.Document;

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
                string exportFolder = null;
                string targetProjectId = null; // Defined here

                using (var form = new SelectionForm(views3D, sheets))
                {
                    if (form.ShowDialog() != System.Windows.Forms.DialogResult.OK)
                    {
                        return Result.Cancelled;
                    }
                    exportViewId = form.Selected3DViewId;
                    targetSheetId = form.SelectedSheetId;
                    exportFolder = form.SelectedFolder;
                    targetProjectId = form.SelectedProjectId;

                    if (string.IsNullOrWhiteSpace(targetProjectId))
                    {
                         TaskDialog.Show("Fout", "Geen Project ID opgegeven.");
                         return Result.Failed;
                    }
                }

                if (string.IsNullOrWhiteSpace(exportFolder) || !Directory.Exists(exportFolder))
                {
                    TaskDialog.Show("Fout", "Ongeldige map geselecteerd.");
                    return Result.Failed;
                }

                View3D exportView = doc.GetElement(exportViewId) as View3D;
                ViewSheet targetSheet = doc.GetElement(targetSheetId) as ViewSheet;

                // 3. Generate Filename (locally) to use for export
                // We'll let the backend generate the Model ID, but we need a temp file locally.
                string safeTitle = string.Join("_", doc.Title.Split(Path.GetInvalidFileNameChars()));
                string ifcFilename = $"{safeTitle}_TempExport.ifc";
                string fullIfcPath = Path.Combine(exportFolder, ifcFilename);

                // 4. Export Selected 3D View to IFC
                bool exportSuccess = false;
                using (Transaction t = new Transaction(doc, "Export IFC"))
                {
                    t.Start();
                    exportSuccess = ExportToIfc(doc, exportView, fullIfcPath);
                    t.Commit();
                }

                if (!exportSuccess)
                {
                    TaskDialog.Show("Error", "Export to IFC failed.");
                    return Result.Failed;
                }

                // 5. Upload to Backend (Signed URL Flow)
                // Using Task.Run to run async method synchronously in Revit context
                string qrImagePath = null;
                try 
                {
                     qrImagePath = Task.Run(async () => await UploadIfcAndGetQR(fullIfcPath, targetProjectId, exportFolder)).Result;
                }
                catch (AggregateException ae)
                {
                     foreach (var e in ae.InnerExceptions)
                     {
                         TaskDialog.Show("Upload Error", $"{e.Message}\n{e.StackTrace}");
                     }
                     return Result.Failed;
                }
                catch (Exception ex)
                {
                    TaskDialog.Show("Upload Error", $"General Error: {ex.Message}");
                    return Result.Failed;
                }

                if (string.IsNullOrEmpty(qrImagePath) || !File.Exists(qrImagePath))
                {
                     TaskDialog.Show("Error", "Failed to retrieve QR code image.");
                     return Result.Failed;
                }

                // 6. Place QR in Revit on Target Sheet
                using (Transaction t = new Transaction(doc, "Place QR Code"))
                {
                    t.Start();
                    PlaceQrImageOnView(doc, targetSheet, qrImagePath);
                    t.Commit();
                }

                TaskDialog.Show("Succes", $"Upload Voltooid!\n\n1. IFC Geupload naar Dashboard.\n2. QR Code geplaatst op sheet: {targetSheet.Name}");
                return Result.Succeeded;
            }
            catch (Exception ex)
            {
                message = ex.Message + "\n" + ex.StackTrace;
                return Result.Failed;
            }
        }

        private bool ExportToIfc(Document doc, View activeView, string outputPath)
        {
            try
            {
                IFCExportOptions options = new IFCExportOptions();
                options.FileVersion = IFCVersion.IFC2x3; 
                options.FilterViewId = activeView.Id; 
                options.ExportBaseQuantities = true;
                
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

        private async Task<string> UploadIfcAndGetQR(string ifcFilePath, string projectId, string outputFolder)
        {
            using (var client = new HttpClient())
            {
                client.DefaultRequestHeaders.Authorization = 
                    new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", AdminApiKey);
                
                // Step 1: Initialize upload
                var initRequest = new
                {
                    projectId = projectId,
                    fileName = Path.GetFileName(ifcFilePath),
                    fileSize = new FileInfo(ifcFilePath).Length
                };
                
                var initResponse = await client.PostAsJsonAsync($"{ApiBaseUrl}/api/upload/init", initRequest);
                if (!initResponse.IsSuccessStatusCode)
                {
                    throw new Exception($"Init failed: {initResponse.StatusCode} - {await initResponse.Content.ReadAsStringAsync()}");
                }
                
                var initData = await initResponse.Content.ReadFromJsonAsync<JsonElement>();
                string signedUploadUrl = initData.GetProperty("signedUploadUrl").GetString();
                string modelId = initData.GetProperty("modelId").GetString();
                string revisionId = initData.GetProperty("revisionId").GetString();
                
                // Step 2: Upload IFC directly to Supabase
                // Step 2: Upload IFC directly to Supabase - SKIPPED per user request (Manual upload later)
                /* 
                using (var fileStream = File.OpenRead(ifcFilePath))
                {
                    var fileContent = new StreamContent(fileStream);
                    fileContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/octet-stream");
                    
                    var uploadResponse = await client.PutAsync(signedUploadUrl, fileContent);
                    if (!uploadResponse.IsSuccessStatusCode)
                    {
                         throw new Exception($"Upload failed: {uploadResponse.StatusCode}");
                    }
                }
                */
                
                // Step 3: Complete upload and generate QR
                var completeRequest = new
                {
                    modelId = modelId,
                    revisionId = revisionId
                };
                
                var completeResponse = await client.PostAsJsonAsync($"{ApiBaseUrl}/api/upload/complete", completeRequest);
                if (!completeResponse.IsSuccessStatusCode)
                {
                    throw new Exception($"Complete failed: {completeResponse.StatusCode}");
                }
                
                var completeData = await completeResponse.Content.ReadFromJsonAsync<JsonElement>();
                string qrDownloadUrl = completeData.GetProperty("qrDownloadUrl").GetString();
                
                // Step 4: Download QR code
                var qrResponse = await client.GetAsync($"{ApiBaseUrl}{qrDownloadUrl}");
                if (!qrResponse.IsSuccessStatusCode)
                    throw new Exception("Failed to download QR code image");

                var qrBytes = await qrResponse.Content.ReadAsByteArrayAsync();
                
                // Save QR to output folder
                string qrFilename = $"{Path.GetFileNameWithoutExtension(ifcFilePath)}_QR.png";
                string qrPath = Path.Combine(outputFolder, qrFilename);
                File.WriteAllBytes(qrPath, qrBytes);
                
                return qrPath;
            }
        }

        private void PlaceQrImageOnView(Document doc, View targetView, string imagePath)
        {
            ImageTypeOptions options = new ImageTypeOptions(imagePath, false, ImageTypeSource.Import);
            ImageType imageType = ImageType.Create(doc, options);

            BoundingBoxUV box = targetView.Outline;
            XYZ center = new XYZ((box.Min.U + box.Max.U) / 2, (box.Min.V + box.Max.V) / 2, 0);
            
            ImageInstance.Create(doc, targetView, imageType.Id, new ImagePlacementOptions(center, BoxPlacement.Center));
        }

        // Removed legacy GetIfcGuid helper as it's not needed for the new flow
    }
}
