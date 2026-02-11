using System;
using System.Collections.Generic;
using System.Linq;
using System.IO;
using System.Security.Cryptography;
using System.Threading.Tasks;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Autodesk.Revit.Attributes;

namespace VH_IFC_QR
{
    [Transaction(TransactionMode.Manual)]
    public class ExportIFCCommand : IExternalCommand
    {
        private const string BaseUrl = "https://vh-ifc-backend.onrender.com"; // Render backend url
        private const string ClientId = "revit_plugin";
        private const string ClientSecret = "revit_secret_123";

        public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
        {
            UIApplication uiapp = commandData.Application;
            UIDocument uidoc = uiapp.ActiveUIDocument;
            Document doc = uidoc.Document;

            try
            {
                // 1. Gather Revit data
                var views3D = new FilteredElementCollector(doc).OfClass(typeof(View3D)).Cast<View3D>().Where(v => !v.IsTemplate).ToList();
                var sheets = new FilteredElementCollector(doc).OfClass(typeof(ViewSheet)).Cast<ViewSheet>().ToList();

                // 2. Initialize API Client and Auth
                var client = new PluginClient(BaseUrl);
                bool loginOk = Task.Run(() => client.LoginAsync(ClientId, ClientSecret)).GetAwaiter().GetResult();
                
                if (!loginOk)
                {
                    TaskDialog.Show("Auth Fout", "Kon niet inloggen bij VH Backend. Controleer credentials.");
                    return Result.Failed;
                }

                // 3. Get Projects
                var projects = Task.Run(() => client.GetProjectsAsync()).GetAwaiter().GetResult();

                // 4. Show UI
                string defaultName = $"{doc.Title}_{DateTime.Now:yyyyMMdd_HHmm}";
                using (var form = new SelectionForm(projects, views3D, sheets, defaultName))
                {
                    form.OnTestConnection += () => {
                        var sw = System.Diagnostics.Stopwatch.StartNew();
                        try {
                            form.UpdateStatus("Test Login...", 10);
                            var tLogin = Task.Run(() => client.LoginAsync(ClientId, ClientSecret)).GetAwaiter().GetResult();
                            form.UpdateStatus($"Login: OK ({sw.ElapsedMilliseconds}ms)", 50);
                            
                            form.UpdateStatus("Test Projects...", 60);
                            var tProjs = Task.Run(() => client.GetProjectsAsync()).GetAwaiter().GetResult();
                            form.UpdateStatus($"Conn Test: SUCCESS! {tProjs.Count} projecten gevonden in {sw.ElapsedMilliseconds}ms.", 100);
                        } catch (Exception ex) {
                            form.UpdateStatus($"Conn Test: FOUT ({sw.ElapsedMilliseconds}ms): {ex.Message}", 0);
                        }
                    };

                    if (form.ShowDialog() != System.Windows.Forms.DialogResult.OK) return Result.Cancelled;

                    // --- START WORKFLOW ---
                    var totalSw = System.Diagnostics.Stopwatch.StartNew();
                    form.UpdateStatus("Stap 1/7: IFC exporteren uit Revit...", 10);
                    
                    string tempPath = Path.Combine(Path.GetTempPath(), form.ModelName + ".ifc");
                    View3D exportView = doc.GetElement(form.Selected3DViewId) as View3D;

                    bool exportOk = false;
                    using (Transaction t = new Transaction(doc, "Export IFC"))
                    {
                        t.Start();
                        exportOk = ExportToIfc(doc, exportView, tempPath);
                        t.Commit();
                    }

                    if (!exportOk) throw new Exception("IFC Export mislukt door Revit.");
                    form.UpdateStatus($"Stap 1: Gereed ({totalSw.ElapsedMilliseconds}ms)", 15);

                    // 5. Hash & Upload
                    UploadSessionInfo session = null;
                    ShareInfo share = null;
                    string qrUrl = null;

                    Task.Run(async () => {
                        var stepSw = System.Diagnostics.Stopwatch.StartNew();
                        
                        form.UpdateStatus("Stap 2/7: Bestand hashen...", 20);
                        long fileSize = new FileInfo(tempPath).Length;
                        string checksum = GetSha256(tempPath);
                        form.UpdateStatus($"Stap 2: Gereed ({stepSw.ElapsedMilliseconds}ms)", 30);

                        stepSw.Restart();
                        form.UpdateStatus("Stap 3.1/7: Model registreren...", 35);
                        string modelId = await client.CreateModelAsync(form.SelectedProjectId, form.ModelName);
                        form.UpdateStatus($"Stap 3.1: Gereed ({stepSw.ElapsedMilliseconds}ms)", 38);

                        stepSw.Restart();
                        form.UpdateStatus("Stap 3.2/7: Backend sessie aanvragen...", 40);
                        session = await client.CreateUploadSessionAsync(modelId, form.ModelName, fileSize, checksum);
                        form.UpdateStatus($"Stap 3.2: Gereed ({stepSw.ElapsedMilliseconds}ms)", 45);

                        stepSw.Restart();
                        form.UpdateStatus($"Stap 4/7: Upload naar Supabase ({(fileSize/1024.0/1024.0):F2} MB)...", 50);
                        await client.UploadFileAsync(session.uploadUrl, tempPath);
                        form.UpdateStatus($"Stap 4: Gereed ({stepSw.ElapsedMilliseconds}ms)", 65);

                        stepSw.Restart();
                        form.UpdateStatus("Stap 5/7: Registratie in backend...", 70);
                        await client.CompleteVersionAsync(modelId, session.versionId);
                        form.UpdateStatus($"Stap 5: Gereed ({stepSw.ElapsedMilliseconds}ms)", 75);

                        stepSw.Restart();
                        form.UpdateStatus("Stap 6/7: Deep-link genereren...", 80);
                        share = await client.CreateShareAsync(modelId, session.versionId);
                        form.UpdateStatus($"Stap 6: Gereed ({stepSw.ElapsedMilliseconds}ms)", 85);

                        stepSw.Restart();
                        form.UpdateStatus("Stap 7/7: QR asset aanmaken...", 90);
                        qrUrl = await client.GenerateQRAsync(modelId, session.versionId, share.viewerUrl, form.SelectedProjectId);
                        form.UpdateStatus($"Stap 7: Gereed ({stepSw.ElapsedMilliseconds}ms)", 95);
                    }).GetAwaiter().GetResult();

                    // 6. Download & Place QR on Sheet
                    form.UpdateStatus("Afronden: QR op sheet plakken...", 98);
                    byte[] qrBytes = Task.Run(() => client.DownloadQRAsync(qrUrl)).GetAwaiter().GetResult();
                    string qrTempPath = Path.Combine(Path.GetTempPath(), "qr.png");
                    File.WriteAllBytes(qrTempPath, qrBytes);

                    using (Transaction t = new Transaction(doc, "Place QR"))
                    {
                        t.Start();
                        PlaceQrOnSheet(doc, form.SelectedSheetId, qrTempPath);
                        t.Commit();
                    }

                    form.UpdateStatus($"SUCCES! Totaal: {totalSw.ElapsedMilliseconds}ms", 100);
                    TaskDialog.Show("Succes", $"Workflow succesvol afgerond in {totalSw.Elapsed.TotalSeconds:F1}s!\nURL: {share.viewerUrl}");
                    
                    if (File.Exists(tempPath)) File.Delete(tempPath);
                    if (File.Exists(qrTempPath)) File.Delete(qrTempPath);
                }

                return Result.Succeeded;
            }
            catch (Exception ex)
            {
                TaskDialog.Show("Fout", ex.Message);
                return Result.Failed;
            }
        }

        private bool ExportToIfc(Document doc, View activeView, string outputPath)
        {
            IFCExportOptions options = new IFCExportOptions();
            options.FileVersion = IFCVersion.IFC4; // Or 2x3
            options.FilterViewId = activeView.Id;
            string dir = Path.GetDirectoryName(outputPath);
            string filename = Path.GetFileName(outputPath);
            return doc.Export(dir, filename, options);
        }

        private string GetSha256(string filePath)
        {
            using (var sha256 = SHA256.Create())
            {
                using (var stream = File.OpenRead(filePath))
                {
                    var hash = sha256.ComputeHash(stream);
                    return BitConverter.ToString(hash).Replace("-", "").ToLowerInvariant();
                }
            }
        }

        private void PlaceQrOnSheet(Document doc, ElementId sheetId, string imagePath)
        {
            ViewSheet sheet = doc.GetElement(sheetId) as ViewSheet;
            ImageTypeOptions options = new ImageTypeOptions(imagePath, false, ImageTypeSource.Import);
            ImageType type = ImageType.Create(doc, options);
            
            // Place at bottom right
            ImagePlacementOptions placement = new ImagePlacementOptions();
            placement.PlacementPoint = BoxPlacement.BottomRight;
            
            ImageInstance.Create(doc, sheet, type.Id, placement);

            // Optional: Text label
            TextNoteOptions textOptions = new TextNoteOptions();
            textOptions.HorizontalAlignment = HorizontalTextAlignment.Right;
            textOptions.TypeId = doc.GetDefaultElementTypeId(ElementTypeGroup.TextNoteType);
            
            XYZ textPos = new XYZ(0, 0, 0); // Need proper calculation based on sheet size
            TextNote.Create(doc, sheet.Id, textPos, "Scan voor 3D model", textOptions);
        }
    }
}
