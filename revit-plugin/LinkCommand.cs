using System;
using System.Windows.Threading;
using System.Threading;
using System.Threading.Tasks;
using System.Collections.Generic;
using System.Linq;
using System.IO;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Autodesk.Revit.Attributes;

namespace VH_IFC_QR
{
    [Transaction(TransactionMode.Manual)]
    public class LinkQRCommand : IExternalCommand
    {
        private const string BaseUrl = "https://vh-ifc-backend.onrender.com";
        private const string ClientId = "revit_plugin";
        private const string ClientSecret = "0dfb4de62d095c839ed086630fef515454d4e2d374c73b3e";

        public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
        {
            UIApplication uiapp = commandData.Application;
            UIDocument uidoc = uiapp.ActiveUIDocument;
            Document doc = uidoc.Document;

            try
            {
                // 1. API Client initialiseren
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

                // Gebruiker Niveau Authenticatie
                if (!client.LoadToken())
                {
                    LoginWindow loginWin = new LoginWindow(client);
                    if (loginWin.ShowDialog() != true) return Result.Cancelled;
                }

                // 2. Projecten ophalen
                var projects = Task.Run(() => client.GetProjectsAsync()).GetAwaiter().GetResult();

                // 3. Sheets verzamelen uit Revit
                var sheets = new FilteredElementCollector(doc)
                    .OfClass(typeof(ViewSheet))
                    .Cast<ViewSheet>()
                    .ToList();

                // 4. Link UI tonen
                LinkWindow linkWin = new LinkWindow(projects, sheets, client, client.CurrentUsername);
                linkWin.OnLogout += () => { client.Logout(); NotificationWindow.ShowInfo("Je bent uitgelogd."); };

                if (linkWin.ShowDialog() != true) return Result.Cancelled;

                // --- LINK WORKFLOW ---
                ProgressWindow progress = new ProgressWindow();
                progress.Show();

                var validMatches = linkWin.ValidMatches;
                List<string> results = new List<string>();
                int totalSteps = validMatches.Count;
                int currentStep = 0;

                try
                {
                    foreach (var match in validMatches)
                    {
                        currentStep++;
                        progress.Update(
                            $"({currentStep}/{totalSteps}) QR genereren: {match.AssemblyCode}...",
                            (int)((double)currentStep / totalSteps * 100));

                        // 1. Share + QR genereren via backend
                        ShareQRResult qrResult = null;
                        var bgTask = Task.Run(async () =>
                        {
                            qrResult = await client.CreateShareAndQRAsync(
                                match.MatchedFileId,
                                linkWin.SelectedProject.id);
                        });

                        while (!bgTask.IsCompleted)
                        {
                            DoEvents();
                            Thread.Sleep(10);
                        }
                        bgTask.GetAwaiter().GetResult();

                        // 2. QR downloaden
                        byte[] qrBytes = Task.Run(() => client.DownloadQRAsync(qrResult.qrUrl)).GetAwaiter().GetResult();
                        string qrTempPath = Path.Combine(Path.GetTempPath(), $"link_{match.AssemblyCode}_{DateTime.Now.Ticks}_qr.png");
                        File.WriteAllBytes(qrTempPath, qrBytes);

                        // 3. QR op Sheet plaatsen (als sheet geselecteerd)
                        if (match.SelectedSheet != null)
                        {
                            using (Transaction t = new Transaction(doc, $"Place QR - {match.AssemblyCode}"))
                            {
                                t.Start();
                                PlaceQrOnSheet(doc, match.SelectedSheet.Id, qrTempPath, match.AssemblyCode);
                                t.Commit();
                            }
                        }

                        if (File.Exists(qrTempPath)) File.Delete(qrTempPath);
                        results.Add($"{match.AssemblyCode} → {match.MatchedFileName}");
                    }

                    progress.Update("Klaar!", 100);
                    progress.Close();

                    ResultWindow resWin = new ResultWindow(results, linkWin.SelectedProject.id);
                    resWin.ShowDialog();
                }
                catch (Exception ex)
                {
                    progress.Close();
                    string userMsg = ex.Message.Contains("502") || ex.Message.Contains("503") || ex.Message.Contains("connect")
                        ? "De server is tijdelijk niet bereikbaar.\n\nProbeer het over enkele minuten opnieuw."
                        : "Er is een fout opgetreden bij het linken.\n\nProbeer het opnieuw of neem contact op met de beheerder.";
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

        private void PlaceQrOnSheet(Document doc, ElementId sheetId, string imagePath, string label)
        {
            ViewSheet sheet = doc.GetElement(sheetId) as ViewSheet;
            ImageTypeOptions options = new ImageTypeOptions(imagePath, false, ImageTypeSource.Import);
            ImageType type = ImageType.Create(doc, options);

            double sizeInMm = SettingsManager.Instance.QrSizeMm;
            if (sizeInMm <= 0) sizeInMm = 50;
            double targetSizeInFeet = sizeInMm / 304.8;

            try
            {
                Parameter tWidth = type.get_Parameter(BuiltInParameter.RASTER_SYMBOL_WIDTH) ?? type.LookupParameter("Width");
                Parameter tHeight = type.get_Parameter(BuiltInParameter.RASTER_SYMBOL_HEIGHT) ?? type.LookupParameter("Height");
                if (tWidth != null && !tWidth.IsReadOnly) tWidth.Set(targetSizeInFeet);
                if (tHeight != null && !tHeight.IsReadOnly) tHeight.Set(targetSizeInFeet);
            }
            catch { }

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
                        if (loc == "BottomLeft")
                            placementPoint = new XYZ(bbox.Min.X + marginFeet + halfSize, bbox.Min.Y + marginFeet + halfSize, 0);
                        else if (loc == "TopRight")
                            placementPoint = new XYZ(bbox.Max.X - marginFeet - halfSize, bbox.Max.Y - marginFeet - halfSize, 0);
                        else if (loc == "TopLeft")
                            placementPoint = new XYZ(bbox.Min.X + marginFeet + halfSize, bbox.Max.Y - marginFeet - halfSize, 0);
                        else
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
                Parameter pWidth = instance.get_Parameter(BuiltInParameter.RASTER_SYMBOL_WIDTH) ?? instance.LookupParameter("Width");
                Parameter pHeight = instance.get_Parameter(BuiltInParameter.RASTER_SYMBOL_HEIGHT) ?? instance.LookupParameter("Height");
                if (pWidth != null && !pWidth.IsReadOnly)
                {
                    pWidth.Set(targetSizeInFeet);
                    if (pHeight != null && !pHeight.IsReadOnly) pHeight.Set(targetSizeInFeet);
                }

                double currentWidth = (pWidth != null) ? pWidth.AsDouble() : 0;
                if (currentWidth <= 0)
                {
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
            catch { }
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
