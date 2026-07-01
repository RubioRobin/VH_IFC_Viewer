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
                List<string> qrSheetLabels = new List<string>();
                int totalSteps = validMatches.Count;
                int completedDownloads = 0;

                try
                {
                    // FASE 1: Download QRs in parallel (max 5 tegelijk om backend belasting te spreiden)
                    // Partial success: elke download heeft een eigen resultaat (succes of fout)
                    var semaphore = new SemaphoreSlim(5);
                    var downloadTasks = validMatches.Select(async match =>
                    {
                        await semaphore.WaitAsync();
                        try
                        {
                            if (string.IsNullOrEmpty(match.MatchedFileId))
                                return new { Match = match, TempPath = (string)null, Error = $"Geen FileId voor {match.AssemblyCode}" };

                            var qrResult = await client.CreateShareAndQRAsync(
                                match.MatchedFileId,
                                linkWin.SelectedProject.id);

                            byte[] qrBytes = await client.DownloadQRAsync(qrResult.qrUrl);
                            string qrTempPath = Path.Combine(Path.GetTempPath(), $"link_{match.AssemblyCode}_{DateTime.Now.Ticks}_qr.png");
                            File.WriteAllBytes(qrTempPath, qrBytes);

                            int current = Interlocked.Increment(ref completedDownloads);
                            progress.Update(
                                $"({current}/{totalSteps}) QR downloaden: {match.AssemblyCode}...",
                                (int)((double)current / totalSteps * 50));

                            return new { Match = match, TempPath = qrTempPath, Error = (string)null };
                        }
                        catch (Exception ex)
                        {
                            Interlocked.Increment(ref completedDownloads);
                            return new { Match = match, TempPath = (string)null, Error = ex.Message };
                        }
                        finally
                        {
                            semaphore.Release();
                        }
                    }).ToList();

                    var allDownloadsTask = Task.WhenAll(downloadTasks);

                    while (!allDownloadsTask.IsCompleted)
                    {
                        DoEvents();
                        Thread.Sleep(50);
                    }

                    var downloadedItems = allDownloadsTask.GetAwaiter().GetResult();

                    // Splits geslaagde en mislukte downloads
                    var succeeded = downloadedItems.Where(x => x.TempPath != null).ToList();

                    // FASE 2: Plaatsen — alleen geslaagde items, in 1 transactie
                    int placedCount = 0;
                    if (succeeded.Any())
                    {
                        using (Transaction t = new Transaction(doc, "Lijmen van QR codes"))
                        {
                            t.Start();

                            foreach (var item in succeeded)
                            {
                                placedCount++;
                                progress.Update(
                                    $"({placedCount}/{succeeded.Count}) QR code plaatsen: {item.Match.AssemblyCode}...",
                                    50 + (int)((double)placedCount / succeeded.Count * 45));

                                DoEvents();

                                if (item.Match.SelectedSheet != null)
                                {
                                    PlaceQrOnSheet(doc, item.Match.SelectedSheet.Id, item.TempPath, item.Match.AssemblyCode);
                                    qrSheetLabels.Add(ResultSummaryFormatter.FormatSheetLabel(
                                        item.Match.SelectedSheet.SheetNumber,
                                        item.Match.SelectedSheet.Name));
                                }

                                TryDeleteTempFile(item.TempPath);
                            }

                            t.Commit();
                        }

                        // Opslaan — alleen als het document al een bestandspad heeft
                        if (!string.IsNullOrEmpty(doc.PathName))
                        {
                            progress.Update("Opslaan...", 98);
                            DoEvents();
                            doc.Save();
                        }
                    }

                    progress.Update("Klaar!", 100);
                    progress.Close();

                    ResultWindow resWin = new ResultWindow(qrSheetLabels, SettingsManager.Instance.AdminUrl);
                    resWin.ShowDialog();
                }
                catch (Exception ex)
                {
                    progress.Close();
                    string userMsg = ex.Message.Contains("502") || ex.Message.Contains("503") || ex.Message.Contains("connect")
                        ? "De server is tijdelijk niet bereikbaar.\n\nProbeer het over enkele minuten opnieuw."
                        : $"Er is een fout opgetreden bij het linken:\n{ex.Message}\n\nProbeer het opnieuw of neem contact op met de beheerder.";
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

        private static void TryDeleteTempFile(string path)
        {
            if (string.IsNullOrWhiteSpace(path) || !File.Exists(path))
                return;

            try
            {
                File.Delete(path);
            }
            catch
            {
                // Tijdelijke QR-bestanden mogen een geslaagde link-flow niet alsnog laten mislukken.
            }
        }

        private void PlaceQrOnSheet(Document doc, ElementId sheetId, string imagePath, string label)
        {
            ViewSheet sheet = doc.GetElement(sheetId) as ViewSheet;

            // Verwijder bestaande QR code(s) voor deze assembly code op deze sheet
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
                    if (imgType != null && imgType.Name.Contains($"link_{label}_"))
                    {
                        doc.Delete(img.Id);
                    }
                }
            }
            catch { }

            ImageTypeOptions options = new ImageTypeOptions(imagePath, false, ImageTypeSource.Import);
            ImageType type = ImageType.Create(doc, options);

            // Vaste afmeting: 20.6x20.6 mm (altijd, ongeacht instellingen)
            double sizeInMm = 20.6;
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
                        // Vaste positie: linkerbovenhoek van het QR-vakje in de titelblok
                        double cornerRightOffsetMm = 249.5 - 0.1; // 249.4 mm
                        double cornerDownOffsetMm  = 245.5 - 0.5; // 245.0 mm

                        double halfSizeMm = sizeInMm / 2.0;
                        double rightOffsetFeet = (cornerRightOffsetMm + halfSizeMm) / 304.8;
                        double downOffsetFeet  = (cornerDownOffsetMm  + halfSizeMm) / 304.8;

                        placementPoint = new XYZ(bbox.Min.X + rightOffsetFeet, bbox.Max.Y - downOffsetFeet, 0);
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
                placement.PlacementPoint = BoxPlacement.TopLeft;
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
