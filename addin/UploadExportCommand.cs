using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
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
                    return HandledFailure(ref message);
                }

                var client = DirectSupabaseConnection.CreateClient();

                try
                {
                    Task.Run(() => client.CheckConnectionAsync()).GetAwaiter().GetResult();
                }
                catch (Exception ex)
                {
                    NotificationWindow.ShowError($"Kon niet verbinden met VH Server.\n\nDetails: {ex.Message}");
                    return HandledFailure(ref message);
                }

                if (!client.LoadToken())
                {
                    LoginWindow loginWin = new LoginWindow(client);
                    if (loginWin.ShowDialog() != true) return Result.Cancelled;
                }

                ProjectInfo defaultProject = null;
                string projectResolutionError = null;
                var projectIdentity = RevitProjectIdentity.FromDocument(doc);
                if (projectIdentity.HasValue)
                {
                    try
                    {
                        defaultProject = Task.Run(() => client.EnsureProjectAsync(
                            projectIdentity.ProjectNumber,
                            projectIdentity.ProjectName)).GetAwaiter().GetResult();
                    }
                    catch (Exception ex)
                    {
                        defaultProject = null;
                        projectResolutionError = ex.Message;
                    }
                }

                var sheets = new FilteredElementCollector(doc)
                    .OfClass(typeof(ViewSheet))
                    .Cast<ViewSheet>()
                    .Where(s => !s.IsPlaceholder)
                    .ToList();

                if (defaultProject == null)
                {
                    string error = string.IsNullOrWhiteSpace(projectResolutionError)
                        ? "Kan geen projectnaam bepalen uit dit Revit-model.\n\nSla het model op met een naam en probeer opnieuw."
                        : $"Project synchroniseren met Supabase mislukt.\n\n{projectResolutionError}";
                    NotificationWindow.ShowError(error);
                    return HandledFailure(ref message);
                }

                try
                {
                    List<LocalIfcUploadItem> exportedItems = BuildUploadItems(exportResult, sheets);
                    if (exportedItems.Count == 0)
                    {
                        NotificationWindow.ShowWarning("Er zijn geen nieuwe IFC-bestanden gevonden om te uploaden.");
                        return Result.Cancelled;
                    }

                    return UploadItems(doc, client, defaultProject.id, exportedItems);
                }
                catch (Exception ex)
                {
                    NotificationWindow.ShowError($"Er is een fout opgetreden bij exporteren of uploaden:\n{ex.Message}");
                    return HandledFailure(ref message);
                }
            }
            catch (Exception ex)
            {
                string userMsg = ex.Message.Contains("502") || ex.Message.Contains("503") || ex.Message.Contains("connect")
                    ? "De server is tijdelijk niet bereikbaar.\n\nControleer je internetverbinding en probeer het opnieuw."
                    : "Er is een onverwachte fout opgetreden.\n\nProbeer het opnieuw of neem contact op met de beheerder.";
                NotificationWindow.ShowError(userMsg);
                return HandledFailure(ref message);
            }
        }

        private static Result HandledFailure(ref string message)
        {
            message = string.Empty;
            return Result.Cancelled;
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
            return SheetMatcher.FindSheet(sheets, assemblyCode);
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

            List<string> qrSheetLabels = new List<string>();
            List<string> uploadErrors = new List<string>();
            List<string> qrWarnings = new List<string>();
            int completed = 0;
            int successfulUploads = 0;

            try
            {
                foreach (var item in items)
                {
                    progress.Update(
                        $"Bestand {completed + 1}/{items.Count}: {item.FileName}",
                        PercentForItem(completed, items.Count, 0.02));

                    UploadQrPlacement uploadResult = UploadAndCreateQr(
                        client,
                        projectId,
                        item,
                        progress,
                        completed,
                        items.Count).GetAwaiter().GetResult();

                    if (!string.IsNullOrEmpty(uploadResult.Error))
                    {
                        uploadErrors.Add($"{item.FileName}: {uploadResult.Error}{FormatDiagnostics(uploadResult.Diagnostics)}");
                        completed++;
                        continue;
                    }

                    successfulUploads++;
                    bool qrPlaced = false;

                    if (item.SelectedSheet != null && !string.IsNullOrEmpty(uploadResult.QrTempPath))
                    {
                        progress.Update(
                            $"Bestand {completed + 1}/{items.Count}: QR plaatsen op sheet...",
                            PercentForItem(completed, items.Count, 0.94));

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
                            Debug.WriteLine($"QR plaatsen mislukt voor {item.FileName}: {ex.Message}");
                            qrWarnings.Add($"{item.FileName}: QR niet geplaatst op sheet {item.SelectedSheet.SheetNumber} - {ex.Message}");
                        }
                    }

                    TryDeleteTempFile(uploadResult.QrTempPath);

                    if (qrPlaced)
                        qrSheetLabels.Add(ResultSummaryFormatter.FormatSheetLabel(
                            item.SelectedSheet?.SheetNumber,
                            item.SelectedSheet?.Name));

                    completed++;
                }

                progress.Update("Klaar!", 100);
                progress.Close();

                ShowUploadWarnings(uploadErrors, qrWarnings);

                if (successfulUploads == 0 && uploadErrors.Count > 0)
                    return Result.Cancelled;

                ResultWindow resultWindow = new ResultWindow(qrSheetLabels, DirectSupabaseConnection.AdminUrl);
                resultWindow.ShowDialog();
                return Result.Succeeded;
            }
            catch (Exception ex)
            {
                progress.Close();
                NotificationWindow.ShowError($"Er is een fout opgetreden bij uploaden:\n{ex.Message}");
                return Result.Cancelled;
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
            int completedItems,
            int totalCount)
        {
            var task = Task.Run(async () =>
            {
                var timings = new UploadTiming();

                try
                {
                    Stopwatch stepTimer = Stopwatch.StartNew();
                    string modelName = AssemblyUploadNaming.BuildModelName(item.FilePath);
                    long fileSize = new FileInfo(item.FilePath).Length;
                    timings.Add("voorbereiden", stepTimer.Elapsed);

                    progress.Update(
                        $"Bestand {completedItems + 1}/{totalCount}: upload voorbereiden...",
                        PercentForItem(completedItems, totalCount, 0.08));

                    stepTimer.Restart();
                    string modelId = await client.CreateModelAsync(projectId, modelName, client.CurrentUsername);
                    var session = await client.CreateUploadSessionAsync(modelId, item.FileName, fileSize, null, client.CurrentUsername);
                    timings.Add("metadata", stepTimer.Elapsed);

                    stepTimer.Restart();
                    await client.UploadFileAsync(
                        session,
                        item.FilePath,
                        (uploaded, total) =>
                        {
                            double uploadRatio = total > 0
                                ? Math.Min(1.0, Math.Max(0.0, (double)uploaded / total))
                                : 0.0;

                            progress.Update(
                                $"Bestand {completedItems + 1}/{totalCount}: uploaden {FormatBytes(uploaded)} / {FormatBytes(total)}",
                                PercentForItem(completedItems, totalCount, 0.18 + (0.58 * uploadRatio)));
                        });
                    timings.Add("upload", stepTimer.Elapsed);

                    stepTimer.Restart();
                    await client.CompleteVersionAsync(modelId, session.versionId);
                    timings.Add("afronden", stepTimer.Elapsed);

                    progress.Update(
                        $"Bestand {completedItems + 1}/{totalCount}: QR-link maken...",
                        PercentForItem(completedItems, totalCount, 0.80));

                    stepTimer.Restart();
                    var share = await client.CreateShareAsync(modelId, session.versionId);
                    string qrUrl = await client.GenerateQRAsync(modelId, session.versionId, share.viewerUrl, projectId);
                    timings.Add("qr maken", stepTimer.Elapsed);

                    progress.Update(
                        $"Bestand {completedItems + 1}/{totalCount}: QR ophalen...",
                        PercentForItem(completedItems, totalCount, 0.88));

                    stepTimer.Restart();
                    byte[] qrBytes = await client.DownloadQRAsync(qrUrl);
                    timings.Add("qr downloaden", stepTimer.Elapsed);

                    stepTimer.Restart();
                    string qrTempPath = Path.Combine(
                        Path.GetTempPath(),
                        $"upload_{AssemblyUploadNaming.SafeToken(item.AssemblyCode)}_{DateTime.Now.Ticks}_qr.png");
                    File.WriteAllBytes(qrTempPath, qrBytes);
                    timings.Add("qr schrijven", stepTimer.Elapsed);

                    return new UploadQrPlacement { QrTempPath = qrTempPath, Diagnostics = timings };
                }
                catch (Exception ex)
                {
                    return new UploadQrPlacement { Error = ex.Message, Diagnostics = timings };
                }
            });

            while (!task.IsCompleted)
            {
                DoEvents();
                Thread.Sleep(50);
            }

            return await task.ConfigureAwait(false);
        }

        private static int PercentForItem(int completedItems, int totalItems, double itemProgress)
        {
            if (totalItems <= 0)
                return 0;

            double clamped = Math.Min(1.0, Math.Max(0.0, itemProgress));
            return (int)Math.Min(99, Math.Round(((completedItems + clamped) / totalItems) * 100.0));
        }

        private static string FormatBytes(long bytes)
        {
            if (bytes < 0)
                return "?";

            string[] units = { "B", "KB", "MB", "GB" };
            double value = bytes;
            int unit = 0;

            while (value >= 1024 && unit < units.Length - 1)
            {
                value /= 1024;
                unit++;
            }

            return unit == 0
                ? $"{bytes} {units[unit]}"
                : $"{value:0.0} {units[unit]}";
        }

        private static string FormatDuration(TimeSpan duration)
        {
            if (duration.TotalMinutes >= 1)
                return $"{(int)duration.TotalMinutes}m {duration.Seconds}s";

            return $"{duration.TotalSeconds:0.0}s";
        }

        private static string FormatDiagnostics(UploadTiming diagnostics, TimeSpan? qrPlacement = null)
        {
            if (diagnostics == null && qrPlacement == null)
                return string.Empty;

            List<string> parts = diagnostics?.FormatParts() ?? new List<string>();
            if (qrPlacement.HasValue)
                parts.Add($"QR plaatsen {FormatDuration(qrPlacement.Value)}");

            return parts.Count == 0
                ? string.Empty
                : $" ({string.Join(", ", parts)})";
        }

        private static void ShowUploadWarnings(List<string> uploadErrors, List<string> qrWarnings)
        {
            if ((uploadErrors == null || uploadErrors.Count == 0) &&
                (qrWarnings == null || qrWarnings.Count == 0))
                return;

            List<string> parts = new List<string>();

            if (uploadErrors != null && uploadErrors.Count > 0)
            {
                parts.Add("Niet alle IFC-bestanden zijn geupload:");
                parts.AddRange(uploadErrors.Take(6));
                if (uploadErrors.Count > 6)
                    parts.Add($"+ {uploadErrors.Count - 6} extra fout(en)");
            }

            if (qrWarnings != null && qrWarnings.Count > 0)
            {
                if (parts.Count > 0) parts.Add(string.Empty);
                parts.Add("Upload gelukt, maar QR plaatsen gaf waarschuwingen:");
                parts.AddRange(qrWarnings.Take(4));
                if (qrWarnings.Count > 4)
                    parts.Add($"+ {qrWarnings.Count - 4} extra waarschuwing(en)");
            }

            NotificationWindow.ShowWarning(string.Join(Environment.NewLine, parts));
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
                    if (IsVhQrImage(imgType, label))
                        doc.Delete(img.Id);
                }
            }
            catch { }

            ImageTypeOptions options = new ImageTypeOptions(imagePath, false, ImageTypeSource.Import);
            ImageType type = ImageType.Create(doc, options);

            const double sizeInMm = 20.6;
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
                        // Vaste positie op het VH-titleblock, gelijk aan de
                        // productieversie op de Z-schijf.
                        const double cornerRightOffsetMm = 249.4;
                        const double cornerDownOffsetMm = 245.0;
                        double halfSizeMm = sizeInMm / 2.0;

                        double rightOffsetFeet = (cornerRightOffsetMm + halfSizeMm) / 304.8;
                        double downOffsetFeet = (cornerDownOffsetMm + halfSizeMm) / 304.8;

                        placementPoint = new XYZ(
                            bbox.Min.X + rightOffsetFeet,
                            bbox.Max.Y - downOffsetFeet,
                            0);
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

        // A sheet has one dedicated QR position. Remove both the current upload
        // format and the older Link QR format before placing the replacement.
        // This prevents a re-upload from leaving two QR codes on the same sheet.
        private static bool IsVhQrImage(ImageType imageType, string label)
        {
            if (imageType == null || string.IsNullOrWhiteSpace(imageType.Name))
                return false;

            string name = imageType.Name;
            string safeLabel = AssemblyUploadNaming.SafeToken(label);
            return name.IndexOf($"upload_{safeLabel}_", StringComparison.OrdinalIgnoreCase) >= 0 ||
                   name.IndexOf($"link_{label}_", StringComparison.OrdinalIgnoreCase) >= 0 ||
                   name.StartsWith("upload_", StringComparison.OrdinalIgnoreCase) ||
                   name.StartsWith("link_", StringComparison.OrdinalIgnoreCase);
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
            public UploadTiming Diagnostics { get; set; }
        }

        private class UploadTiming
        {
            private readonly List<Tuple<string, TimeSpan>> _steps = new List<Tuple<string, TimeSpan>>();

            public void Add(string label, TimeSpan duration)
            {
                _steps.Add(Tuple.Create(label, duration));
            }

            public List<string> FormatParts()
            {
                return _steps
                    .Where(step => step.Item2.TotalMilliseconds >= 250)
                    .Select(step => $"{step.Item1} {FormatDuration(step.Item2)}")
                    .ToList();
            }
        }
    }
}
