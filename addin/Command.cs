using System;
using System.Windows.Threading;
using System.Threading;
using System.Threading.Tasks;
using System.Collections.Generic;
using System.Linq;
using System.IO;
using System.Security.Cryptography;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Autodesk.Revit.Attributes;

namespace VH_IFC_QR
{
    [Transaction(TransactionMode.Manual)]
    public class ExportIFCCommand : IExternalCommand
    {
        private static string BaseUrl => SettingsManager.Instance.BackendUrl;
        private static string ClientId => SettingsManager.Instance.ClientId;
        private static string ClientSecret => SettingsManager.Instance.ClientSecret;

        public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
        {
            UIApplication uiapp = commandData.Application;
            UIDocument uidoc = uiapp.ActiveUIDocument;
            Document doc = uidoc.Document;

            try
            {
                string revitUsername = uiapp.Application.Username;
                // 1. Revit data verzamelen
                var views3D = new FilteredElementCollector(doc).OfClass(typeof(View3D)).Cast<View3D>().Where(v => !v.IsTemplate).ToList();
                var sheets = new FilteredElementCollector(doc).OfClass(typeof(ViewSheet)).Cast<ViewSheet>().ToList();

                // 2. API Client initialiseren
                var client = new PluginClient(BaseUrl);
                
                // Plugin Niveau Authenticatie
                try 
                {
                    Task.Run(() => client.LoginPluginAsync(ClientId, ClientSecret)).GetAwaiter().GetResult();
                }
                catch (Exception ex)
                {
                    NotificationWindow.ShowError($"Kon niet verbinden met VH Server.\n\nDetails: {ex.Message}");
                    return Result.Failed;
                }

                // Gebruiker Niveau Authenticatie (optioneel als token al bestaat)
                if (!client.LoadToken())
                {
                    LoginWindow loginWin = new LoginWindow(client);
                    if (loginWin.ShowDialog() != true) return Result.Cancelled;
                }

                // 3. Projecten ophalen
                var projects = Task.Run(() => client.GetProjectsAsync()).GetAwaiter().GetResult();

                // 4. Selectie UI tonen
                string defaultPrefix = $"{doc.Title}";
                
                SelectionWindow selWin = new SelectionWindow(projects, views3D, sheets, defaultPrefix, client.CurrentUsername);
                selWin.OnLogout += () => { client.Logout(); NotificationWindow.ShowInfo("Je bent uitgelogd."); };

                if (selWin.ShowDialog() != true) return Result.Cancelled;

                // --- BATCH WORKFLOW ---
                ProgressWindow progress = new ProgressWindow();
                progress.Show();

                // 6. Loop over MAPPINGS (1 mapping = 1 view + 1 sheet)
                var mappings = selWin.ValidMappings;
                List<string> results = new List<string>();
                int totalSteps = mappings.Count * 7; 
                int currentStep = 0;

                    try
                    {
                        foreach (var mapping in mappings)
                        {
                            View3D view = mapping.View;
                            ViewSheet sheet = mapping.SelectedSheet;

                            string cleanViewName = view.Name.Replace("{", "").Replace("}", "").Trim();
                            string modelName = $"{selWin.ModelNamePrefix} {cleanViewName} {DateTime.Now:dd-MM-yyyy}".Trim();
                            progress.Update($"Verwerken: {modelName}...", (int)((double)currentStep / totalSteps * 100));

                            // 1. IFC Exporteren
                            string tempPath = Path.Combine(Path.GetTempPath(), modelName + ".ifc");
                            
                            using (Transaction t = new Transaction(doc, "Export IFC"))
                            {
                                t.Start();
                                if (!ExportToIfc(doc, view, tempPath)) throw new Exception($"Export mislukt voor {view.Name}");
                                t.Commit();
                            }
                            currentStep++; // 1

                            // Backend Tasks
                            ShareInfo share = null;
                            string qrUrl = null;
                            string modelId = null;

                            var bgTask = Task.Run(async () => {
                                // Hash
                                progress.Update($"Model voorbereiden...", (int)((double)currentStep / totalSteps * 100)); // Was Hashing
                                string checksum = GetSha256(tempPath);
                                long fileSize = new FileInfo(tempPath).Length;
                                currentStep++; // 2

                                // Registreren in backend
                                modelId = await client.CreateModelAsync(selWin.SelectedProject.id, modelName, client.CurrentUsername);
                                var session = await client.CreateUploadSessionAsync(modelId, modelName, fileSize, checksum, client.CurrentUsername);
                                currentStep++; // 3

                                // Bestand uploaden
                                progress.Update($"Uploaden naar server...", (int)((double)currentStep / totalSteps * 100));
                                await client.UploadFileAsync(session.uploadUrl, tempPath);
                                await client.CompleteVersionAsync(modelId, session.versionId);
                                currentStep++; // 4/5

                                // Link delen & QR genereren
                                share = await client.CreateShareAsync(modelId, session.versionId);
                                qrUrl = await client.GenerateQRAsync(modelId, session.versionId, share.viewerUrl, selWin.SelectedProject.id);
                                currentStep++; // 6
                            });

                            // Wait for background task while keeping UI alive
                            while (!bgTask.IsCompleted)
                            {
                                DoEvents();
                                Thread.Sleep(10);
                            }
                            bgTask.GetAwaiter().GetResult(); // Check for exceptions

                            // QR Code op Sheet plaatsen
                            progress.Update($"QR code genereren...", (int)((double)currentStep / totalSteps * 100));
                            byte[] qrBytes = Task.Run(() => client.DownloadQRAsync(qrUrl)).GetAwaiter().GetResult();
                            string qrTempPath = Path.Combine(Path.GetTempPath(), $"{modelId}_{DateTime.Now.Ticks}_qr.png");
                            File.WriteAllBytes(qrTempPath, qrBytes);

                            using (Transaction t = new Transaction(doc, "Place QR"))
                            {
                                t.Start();
                                PlaceQrOnSheet(doc, sheet.Id, qrTempPath, view.Name);
                                t.Commit();
                            }
                            
                            if (File.Exists(tempPath)) File.Delete(tempPath);
                            if (File.Exists(qrTempPath)) File.Delete(qrTempPath);
                            
                            results.Add($"{modelName}");
                            currentStep++; // 7
                        }

                    progress.Update("Klaar!", 100);
                    progress.Close();

                    ResultWindow resWin = new ResultWindow(results);
                    resWin.ShowDialog();
                }
                catch (Exception ex)
                {
                    progress.Close();
                    string userMsg = ex.Message.Contains("502") || ex.Message.Contains("503") || ex.Message.Contains("connect")
                        ? "De server is tijdelijk niet bereikbaar.\n\nProbeer het over enkele minuten opnieuw."
                        : "Er is een fout opgetreden bij het exporteren.\n\nProbeer het opnieuw of neem contact op met de beheerder.";
                    NotificationWindow.ShowError(userMsg);
                    return Result.Failed;
                }

                return Result.Succeeded;
            }
            catch (Exception ex)
            {
                string userMsg = ex.Message.Contains("502") || ex.Message.Contains("503") || ex.Message.Contains("connect")
                    ? "De server is tijdelijk niet bereikbaar.\n\nControleer je internetverbinding en probeer het opnieuw."
                    : "Er is een onverwachte fout opgetreden.\n\nProbeer het opnieuw of neem contact op met de beheerder.";
                NotificationWindow.ShowError(userMsg);
                return Result.Failed;
            }
        }

        private bool ExportToIfc(Document doc, View activeView, string outputPath)
        {
            IFCExportOptions options = new IFCExportOptions();
            
            // Use settings
            string settingsVersion = SettingsManager.Instance.IfcVersion;
            if (settingsVersion == "IFC2x3") options.FileVersion = IFCVersion.IFC2x3;
            else if (settingsVersion == "IFC4") options.FileVersion = IFCVersion.IFC4;
            else options.FileVersion = IFCVersion.IFC4; // Default
            
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

        private void PlaceQrOnSheet(Document doc, ElementId sheetId, string imagePath, string viewName)
        {
            ViewSheet sheet = doc.GetElement(sheetId) as ViewSheet;

            // Verwijder bestaande QR code(s) voor deze view op deze sheet
            try
            {
                var existingImages = new FilteredElementCollector(doc, sheet.Id)
                    .OfCategory(BuiltInCategory.OST_RasterImages)
                    .WhereElementIsNotElementType()
                    .Cast<ImageInstance>()
                    .ToList();

                foreach (var img in existingImages)
                {
                    var imgType = doc.GetElement(img.GetTypeId()) as ImageType;
                    // In Command.cs wordt de naam gevormd met de modelId van de nieuwe export
                    // Maar we kunnen ook checken op de viewName in de metadata als we die hadden.
                    // Voor nu checken we of de type naam "qr" bevat en op deze sheet staat.
                    // Beter: we checken of de naam begint met het modelId patroon of viewName.
                    // De oude QR types hebben namen als "{modelId}_{ticks}_qr.png"
                    if (imgType != null && (imgType.Name.Contains("_qr") || imgType.Name.Contains(viewName)))
                    {
                        doc.Delete(img.Id);
                    }
                }
            }
            catch { }

            ImageTypeOptions options = new ImageTypeOptions(imagePath, false, ImageTypeSource.Import);
            ImageType type = ImageType.Create(doc, options);
            
            // Determine size
            double sizeInMm = SettingsManager.Instance.QrSizeMm;
            if (sizeInMm <= 0) sizeInMm = 50; 
            double targetSizeInFeet = sizeInMm / 304.8;
            
            // 1. Resize the TYPE before placing instance (Robust lookup)
            try
            {
                // Robust lookup: Built-in parameters are language-neutral
                Parameter tWidth = type.get_Parameter(BuiltInParameter.RASTER_SYMBOL_WIDTH) ?? type.LookupParameter("Width");
                Parameter tHeight = type.get_Parameter(BuiltInParameter.RASTER_SYMBOL_HEIGHT) ?? type.LookupParameter("Height");
                
                if (tWidth != null && !tWidth.IsReadOnly) tWidth.Set(targetSizeInFeet);
                if (tHeight != null && !tHeight.IsReadOnly) tHeight.Set(targetSizeInFeet);
            }
            catch { }

            // Exacte plaatsing logica
            XYZ placementPoint = XYZ.Zero;
            bool manualPlacement = false;
            double offsetMm = SettingsManager.Instance.QrOffsetMm;
            if (offsetMm <= 0) offsetMm = 10.0;
            double marginFeet = offsetMm / 304.8; 
            double halfSize = targetSizeInFeet / 2.0;

            try
            {
                Element titleBlock = new FilteredElementCollector(doc, sheet.Id)
                    .OfCategory(BuiltInCategory.OST_TitleBlocks)
                    .WhereElementIsNotElementType()
                    .FirstOrDefault();

                if (titleBlock != null)
                {
                    BoundingBoxXYZ bbox = titleBlock.get_BoundingBox(sheet);
                    if (bbox != null)
                    {
                        string loc = SettingsManager.Instance.QrLocation;

                        // Insert point = Corner + Margin + HalfSize (center of QR)
                        if (loc == "BottomLeft")
                            placementPoint = new XYZ(bbox.Min.X + marginFeet + halfSize, bbox.Min.Y + marginFeet + halfSize, 0);
                        else if (loc == "TopRight")
                            placementPoint = new XYZ(bbox.Max.X - marginFeet - halfSize, bbox.Max.Y - marginFeet - halfSize, 0);
                        else if (loc == "TopLeft")
                            placementPoint = new XYZ(bbox.Min.X + marginFeet + halfSize, bbox.Max.Y - marginFeet - halfSize, 0);
                        else // BottomRight
                            placementPoint = new XYZ(bbox.Max.X - marginFeet - halfSize, bbox.Min.Y + marginFeet + halfSize, 0);
                        
                        manualPlacement = true;
                    }
                }
            }
            catch { }

            ImageInstance instance;
            if (manualPlacement)
            {
                ImagePlacementOptions placementOptions = new ImagePlacementOptions();
                placementOptions.Location = placementPoint;
                instance = ImageInstance.Create(doc, sheet, type.Id, placementOptions);
            }
            else
            {
                // Fallback if no titleblock found
                ImagePlacementOptions placement = new ImagePlacementOptions();
                string loc = SettingsManager.Instance.QrLocation;
                if (loc == "BottomLeft") placement.PlacementPoint = BoxPlacement.BottomLeft;
                else if (loc == "TopRight") placement.PlacementPoint = BoxPlacement.TopRight;
                else if (loc == "TopLeft") placement.PlacementPoint = BoxPlacement.TopLeft;
                else placement.PlacementPoint = BoxPlacement.BottomRight;
                instance = ImageInstance.Create(doc, sheet, type.Id, placement);
            }
            
            try 
            {
                doc.Regenerate();

                // 2. Resize the INSTANCE (Ensure sync)
                Parameter pWidth = instance.get_Parameter(BuiltInParameter.RASTER_SYMBOL_WIDTH) ?? instance.LookupParameter("Width");
                Parameter pHeight = instance.get_Parameter(BuiltInParameter.RASTER_SYMBOL_HEIGHT) ?? instance.LookupParameter("Height");
                
                if (pWidth != null && !pWidth.IsReadOnly) 
                {
                    pWidth.Set(targetSizeInFeet);
                    if (pHeight != null && !pHeight.IsReadOnly) pHeight.Set(targetSizeInFeet);
                }

                // 3. SCALE FALLBACK (For older Revit versions or specific image behaviors)
                double currentWidth = (pWidth != null) ? pWidth.AsDouble() : 0;
                if (currentWidth <= 0) {
                   Parameter tWidth = type.get_Parameter(BuiltInParameter.RASTER_SYMBOL_WIDTH) ?? type.LookupParameter("Width");
                   if (tWidth != null) currentWidth = tWidth.AsDouble();
                }

                if (currentWidth > 0 && Math.Abs(currentWidth - targetSizeInFeet) > 0.0001)
                {
                    double scaleFactor = targetSizeInFeet / currentWidth;
                    Parameter pScaleH = instance.LookupParameter("Horizontal Scale");
                    Parameter pScaleV = instance.LookupParameter("Vertical Scale");
                    
                    if (pScaleH != null && !pScaleH.IsReadOnly) pScaleH.Set(scaleFactor);
                    if (pScaleV != null && !pScaleV.IsReadOnly) pScaleV.Set(scaleFactor);
                }
            }
            catch (Exception) { }
        }
        public void DoEvents()
        {
            DispatcherFrame frame = new DispatcherFrame();
            Dispatcher.CurrentDispatcher.BeginInvoke(DispatcherPriority.Background, new DispatcherOperationCallback(ExitFrame), frame);
            Dispatcher.PushFrame(frame);
        }

        public object ExitFrame(object frame)
        {
            ((DispatcherFrame)frame).Continue = false;
            return null;
        }
    }
}
