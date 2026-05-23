using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Runtime.Versioning;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Threading;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;

namespace VH_IFC_QR
{
    [Transaction(TransactionMode.Manual)]
    [SupportedOSPlatform("windows")]
    public class UploadExportCommand : IExternalCommand
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
                VhAssemblyIfcExportResult exportResult = VhAssemblyIfcExporter.Export(
                    commandData,
                    ref message,
                    elements);

                if (exportResult.Status == ResultStatus.Cancelled)
                    return Result.Cancelled;

                if (exportResult.Status == ResultStatus.Failed)
                {
                    NotificationWindow.ShowError($"IFC export mislukt.\n\n{exportResult.Message}");
                    return Result.Failed;
                }

                var client = new PluginClient(BaseUrl);

                try
                {
                    Task.Run(() => client.LoginPluginAsync(ClientId, ClientSecret)).GetAwaiter().GetResult();
                }
                catch (Exception ex)
                {
                    NotificationWindow.ShowError($"Kon niet verbinden met VH Server.\n\nDetails: {ex.Message}");
                    return Result.Failed;
                }

                if (!client.LoadToken())
                {
                    LoginWindow loginWin = new LoginWindow(client);
                    if (loginWin.ShowDialog() != true) return Result.Cancelled;
                }

                ProjectInfo defaultProject = null;
                var projectIdentity = RevitProjectIdentity.FromDocument(doc);
                if (projectIdentity.HasValue)
                {
                    try
                    {
                        defaultProject = Task.Run(() => client.EnsureProjectAsync(
                            projectIdentity.ProjectNumber,
                            projectIdentity.ProjectName)).GetAwaiter().GetResult();
                    }
                    catch
                    {
                        defaultProject = null;
                    }
                }

                var sheets = new FilteredElementCollector(doc)
                    .OfClass(typeof(ViewSheet))
                    .Cast<ViewSheet>()
                    .Where(s => !s.IsPlaceholder)
                    .ToList();

                if (defaultProject == null)
                {
                    NotificationWindow.ShowError("Kan geen project bepalen uit Revit Project Information.\n\nVul Project Number en/of Project Name in en probeer opnieuw.");
                    return Result.Failed;
                }

                try
                {
                    List<LocalIfcUploadItem> exportedItems = BuildUploadItems(exportResult, sheets);
                    if (exportedItems.Count > 0)
                    {
                        SettingsManager.Instance.LastProjectId = defaultProject.id;
                        SettingsManager.Instance.LastExportFolder = exportResult.ExportFolder ?? Path.GetDirectoryName(exportedItems[0].FilePath);
                        SettingsManager.Save();

                        return UploadItems(doc, client, defaultProject.id, exportedItems);
                    }

                    var projects = Task.Run(() => client.GetProjectsAsync()).GetAwaiter().GetResult();
                    if (defaultProject != null && projects.All(p => p.id != defaultProject.id))
                        projects.Insert(0, defaultProject);

                    UploadExportWindow uploadWin = new UploadExportWindow(
                        projects,
                        sheets,
                        client.CurrentUsername,
                        defaultProject?.id,
                        exportResult.ExportFolder);
                    uploadWin.OnLogout += () => { client.Logout(); NotificationWindow.ShowInfo("Je bent uitgelogd."); };

                    NotificationWindow.ShowInfo("De IFC exporter is afgerond, maar ik kon geen nieuwe IFC-bestanden automatisch vinden.\n\nControleer de exportmap en upload daarna de bestanden.");

                    if (uploadWin.ShowDialog() != true) return Result.Cancelled;
                    return UploadItems(doc, client, uploadWin.SelectedProject.id, uploadWin.ValidItems);
                }
                catch (Exception ex)
                {
                    NotificationWindow.ShowError($"Er is een fout opgetreden bij exporteren of uploaden:\n{ex.Message}");
                    return Result.Failed;
                }
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

        private List<LocalIfcUploadItem> BuildUploadItems(VhAssemblyIfcExportResult exportResult, List<ViewSheet> sheets)
        {
            if (exportResult?.ExportedItems != null && exportResult.ExportedItems.Count > 0)
            {
                return exportResult.ExportedItems
                    .Where(item => item != null && File.Exists(item.FilePath))
                    .OrderBy(item => Path.GetFileName(item.FilePath), StringComparer.OrdinalIgnoreCase)
                    .Select(item =>
                    {
                        string assemblyCode = string.IsNullOrWhiteSpace(item.AssemblyCode)
                            ? AssemblyUploadNaming.ExtractAssemblyCode(item.FilePath)
                            : item.AssemblyCode.Trim();

                        return new LocalIfcUploadItem
                        {
                            IsSelected = true,
                            FilePath = item.FilePath,
                            AssemblyCode = assemblyCode,
                            AllSheets = sheets,
                            SelectedSheet = FindSheetForExportItem(sheets, item, assemblyCode)
                        };
                    })
                    .ToList();
            }

            return BuildUploadItems(exportResult?.ExportedFiles, sheets);
        }

        private List<LocalIfcUploadItem> BuildUploadItems(IEnumerable<string> filePaths, List<ViewSheet> sheets)
        {
            return (filePaths ?? Enumerable.Empty<string>())
                .Where(File.Exists)
                .OrderBy(Path.GetFileName, StringComparer.OrdinalIgnoreCase)
                .Select(path =>
                {
                    string assemblyCode = AssemblyUploadNaming.ExtractAssemblyCode(path);
                    return new LocalIfcUploadItem
                    {
                        IsSelected = true,
                        FilePath = path,
                        AssemblyCode = assemblyCode,
                        AllSheets = sheets,
                        SelectedSheet = FindSheetForAssemblyCode(sheets, assemblyCode)
                    };
                })
                .ToList();
        }

        private ViewSheet FindSheetForExportItem(List<ViewSheet> sheets, VhExportedIfcFile exportedItem, string assemblyCode)
        {
            if (sheets == null || exportedItem == null)
                return FindSheetForAssemblyCode(sheets, assemblyCode);

            foreach (string candidate in GetSheetMatchCandidates(exportedItem, assemblyCode))
            {
                ViewSheet match = FindSheetForAssemblyCode(sheets, candidate);
                if (match != null)
                    return match;
            }

            return null;
        }

        private static IEnumerable<string> GetSheetMatchCandidates(VhExportedIfcFile exportedItem, string assemblyCode)
        {
            string fileName = string.IsNullOrWhiteSpace(exportedItem?.FilePath)
                ? null
                : Path.GetFileNameWithoutExtension(exportedItem.FilePath);

            return new[]
                {
                    exportedItem?.SheetNumber,
                    exportedItem?.SheetName,
                    exportedItem?.AssemblyCode,
                    assemblyCode,
                    fileName
                }
                .Where(value => !string.IsNullOrWhiteSpace(value))
                .Select(value => value.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase);
        }

        private ViewSheet FindSheetForAssemblyCode(List<ViewSheet> sheets, string assemblyCode)
        {
            if (sheets == null || string.IsNullOrWhiteSpace(assemblyCode)) return null;

            return sheets.FirstOrDefault(sheet => SheetMatchesAssemblyCode(sheet, assemblyCode));
        }

        private static bool SheetMatchesAssemblyCode(ViewSheet sheet, string assemblyCode)
        {
            if (sheet == null || string.IsNullOrWhiteSpace(assemblyCode))
                return false;

            string search = assemblyCode.Trim();
            string sheetNumber = sheet.SheetNumber?.Trim();
            string sheetName = sheet.Name?.Trim();

            if (EqualsIgnoreCase(sheetNumber, search) || EqualsIgnoreCase(sheetName, search))
                return true;

            string normalizedSearch = NormalizeMatchText(search);
            string normalizedSheetNumber = NormalizeMatchText(sheetNumber);
            string normalizedSheetName = NormalizeMatchText(sheetName);

            if (EqualsIgnoreCase(normalizedSheetNumber, normalizedSearch) ||
                EqualsIgnoreCase(normalizedSheetName, normalizedSearch))
                return true;

            return ContainsMatch(normalizedSheetNumber, normalizedSearch) ||
                   ContainsMatch(normalizedSheetName, normalizedSearch);
        }

        private static bool ContainsMatch(string value, string search)
        {
            if (string.IsNullOrEmpty(value) || string.IsNullOrEmpty(search))
                return false;

            if (value.Length < 3 || search.Length < 3)
                return false;

            return value.IndexOf(search, StringComparison.OrdinalIgnoreCase) >= 0 ||
                   search.IndexOf(value, StringComparison.OrdinalIgnoreCase) >= 0;
        }

        private static bool EqualsIgnoreCase(string value, string search)
        {
            return !string.IsNullOrWhiteSpace(value) &&
                   !string.IsNullOrWhiteSpace(search) &&
                   string.Equals(value.Trim(), search.Trim(), StringComparison.OrdinalIgnoreCase);
        }

        private static string NormalizeMatchText(string value)
        {
            if (string.IsNullOrWhiteSpace(value))
                return string.Empty;

            return new string(value
                .Where(char.IsLetterOrDigit)
                .Select(char.ToUpperInvariant)
                .ToArray());
        }

        private Result UploadItems(Document doc, PluginClient client, string projectId, List<LocalIfcUploadItem> items)
        {
            if (items == null || items.Count == 0)
            {
                NotificationWindow.ShowError("Er zijn geen IFC-bestanden om te uploaden.");
                return Result.Cancelled;
            }

            ProgressWindow progress = new ProgressWindow();
            progress.Show();

            List<string> results = new List<string>();
            int completed = 0;

            try
            {
                foreach (var item in items)
                {
                    int startPercent = (int)((double)completed / items.Count * 100);
                    progress.Update($"Uploaden: {item.FileName}...", startPercent);

                    UploadQrPlacement uploadResult = UploadAndCreateQr(
                        client,
                        projectId,
                        item,
                        progress,
                        startPercent,
                        items.Count).GetAwaiter().GetResult();

                    if (!string.IsNullOrEmpty(uploadResult.Error))
                    {
                        results.Add($"Mislukt: {item.FileName} - {uploadResult.Error}");
                        completed++;
                        continue;
                    }

                    bool qrPlaced = false;
                    string qrPlacementError = null;

                    if (item.SelectedSheet != null && !string.IsNullOrEmpty(uploadResult.QrTempPath))
                    {
                        try
                        {
                            using (Transaction t = new Transaction(doc, "Plaats QR code"))
                            {
                                t.Start();
                                qrPlaced = PlaceQrOnSheet(doc, item.SelectedSheet.Id, uploadResult.QrTempPath, item.AssemblyCode);
                                t.Commit();
                            }
                        }
                        catch (Exception ex)
                        {
                            qrPlacementError = ex.Message;
                        }
                    }

                    TryDeleteTempFile(uploadResult.QrTempPath);

                    if (qrPlaced)
                        results.Add($"OK: {item.FileName} geupload en QR geplaatst op sheet {item.SelectedSheet.SheetNumber}");
                    else if (item.SelectedSheet == null)
                        results.Add($"OK: {item.FileName} geupload, QR niet geplaatst: geen sheet gekoppeld");
                    else if (!string.IsNullOrWhiteSpace(qrPlacementError))
                        results.Add($"OK: {item.FileName} geupload, QR niet geplaatst op sheet {item.SelectedSheet.SheetNumber}: {qrPlacementError}");
                    else
                        results.Add($"OK: {item.FileName} geupload, QR niet geplaatst op sheet {item.SelectedSheet.SheetNumber}");

                    completed++;
                }

                if (!string.IsNullOrEmpty(doc.PathName))
                {
                    progress.Update("Opslaan...", 98);
                    DoEvents();
                    doc.Save();
                }

                progress.Update("Klaar!", 100);
                progress.Close();

                ResultWindow resultWindow = new ResultWindow(results);
                resultWindow.ShowDialog();
                return Result.Succeeded;
            }
            catch (Exception ex)
            {
                progress.Close();
                NotificationWindow.ShowError($"Er is een fout opgetreden bij uploaden:\n{ex.Message}");
                return Result.Failed;
            }
            finally
            {
                if (progress != null && progress.IsVisible) progress.Close();
            }
        }

        private async Task<UploadQrPlacement> UploadAndCreateQr(
            PluginClient client,
            string projectId,
            LocalIfcUploadItem item,
            ProgressWindow progress,
            int startPercent,
            int totalCount)
        {
            var task = Task.Run(async () =>
            {
                try
                {
                    string modelName = AssemblyUploadNaming.BuildModelName(item.FilePath);
                    string checksum = GetSha256(item.FilePath);
                    long fileSize = new FileInfo(item.FilePath).Length;

                    string modelId = await client.CreateModelAsync(projectId, modelName, client.CurrentUsername);
                    var session = await client.CreateUploadSessionAsync(modelId, item.FileName, fileSize, checksum, client.CurrentUsername);

                    progress.Update($"Bestand versturen: {item.FileName}...", Math.Min(startPercent + 10, 95));
                    await client.UploadFileAsync(session.uploadUrl, item.FilePath);
                    await client.CompleteVersionAsync(modelId, session.versionId);

                    progress.Update($"QR maken: {item.AssemblyCode}...", Math.Min(startPercent + 20, 95));
                    var share = await client.CreateShareAsync(modelId, session.versionId);
                    string qrUrl = await client.GenerateQRAsync(modelId, session.versionId, share.viewerUrl, projectId);
                    byte[] qrBytes = await client.DownloadQRAsync(qrUrl);

                    string qrTempPath = Path.Combine(
                        Path.GetTempPath(),
                        $"upload_{AssemblyUploadNaming.SafeToken(item.AssemblyCode)}_{DateTime.Now.Ticks}_qr.png");
                    File.WriteAllBytes(qrTempPath, qrBytes);

                    return new UploadQrPlacement { QrTempPath = qrTempPath };
                }
                catch (Exception ex)
                {
                    return new UploadQrPlacement { Error = ex.Message };
                }
            });

            while (!task.IsCompleted)
            {
                DoEvents();
                Thread.Sleep(50);
            }

            return await task.ConfigureAwait(false);
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
                // Tijdelijke QR-bestanden mogen de upload-flow niet alsnog laten mislukken.
            }
        }

        private string GetSha256(string filePath)
        {
            using (var sha256 = SHA256.Create())
            using (var stream = File.OpenRead(filePath))
            {
                var hash = sha256.ComputeHash(stream);
                return BitConverter.ToString(hash).Replace("-", "").ToLowerInvariant();
            }
        }

        private bool PlaceQrOnSheet(Document doc, ElementId sheetId, string imagePath, string label)
        {
            ViewSheet sheet = doc.GetElement(sheetId) as ViewSheet;
            if (sheet == null) return false;

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
                    if (imgType != null && imgType.Name.Contains($"upload_{AssemblyUploadNaming.SafeToken(label)}_"))
                        doc.Delete(img.Id);
                }
            }
            catch { }

            ImageTypeOptions options = new ImageTypeOptions(imagePath, false, ImageTypeSource.Import);
            ImageType type = ImageType.Create(doc, options);

            double sizeInMm = 20.6;
            double targetSizeInFeet = sizeInMm / 304.8;

            try
            {
                Parameter typeWidth = type.get_Parameter(BuiltInParameter.RASTER_SYMBOL_WIDTH) ?? type.LookupParameter("Width");
                Parameter typeHeight = type.get_Parameter(BuiltInParameter.RASTER_SYMBOL_HEIGHT) ?? type.LookupParameter("Height");
                if (typeWidth != null && !typeWidth.IsReadOnly) typeWidth.Set(targetSizeInFeet);
                if (typeHeight != null && !typeHeight.IsReadOnly) typeHeight.Set(targetSizeInFeet);
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
                        double cornerRightOffsetMm = 249.4;
                        double cornerDownOffsetMm = 245.0;
                        double halfSizeMm = sizeInMm / 2.0;

                        double rightOffsetFeet = (cornerRightOffsetMm + halfSizeMm) / 304.8;
                        double downOffsetFeet = (cornerDownOffsetMm + halfSizeMm) / 304.8;

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
                Parameter instanceWidth = instance.get_Parameter(BuiltInParameter.RASTER_SYMBOL_WIDTH) ?? instance.LookupParameter("Width");
                Parameter instanceHeight = instance.get_Parameter(BuiltInParameter.RASTER_SYMBOL_HEIGHT) ?? instance.LookupParameter("Height");
                if (instanceWidth != null && !instanceWidth.IsReadOnly)
                {
                    instanceWidth.Set(targetSizeInFeet);
                    if (instanceHeight != null && !instanceHeight.IsReadOnly) instanceHeight.Set(targetSizeInFeet);
                }

                double currentWidth = (instanceWidth != null) ? instanceWidth.AsDouble() : 0;
                if (currentWidth <= 0)
                {
                    Parameter typeWidth = type.get_Parameter(BuiltInParameter.RASTER_SYMBOL_WIDTH) ?? type.LookupParameter("Width");
                    if (typeWidth != null) currentWidth = typeWidth.AsDouble();
                }

                if (currentWidth > 0 && Math.Abs(currentWidth - targetSizeInFeet) > 0.0001)
                {
                    double scaleFactor = targetSizeInFeet / currentWidth;
                    Parameter horizontalScale = instance.LookupParameter("Horizontal Scale");
                    Parameter verticalScale = instance.LookupParameter("Vertical Scale");
                    if (horizontalScale != null && !horizontalScale.IsReadOnly) horizontalScale.Set(scaleFactor);
                    if (verticalScale != null && !verticalScale.IsReadOnly) verticalScale.Set(scaleFactor);
                }
            }
            catch { }

            return true;
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

        private class UploadQrPlacement
        {
            public string QrTempPath { get; set; }
            public string Error { get; set; }
        }
    }
}
