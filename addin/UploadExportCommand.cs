using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Threading;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;

namespace VH_IFC_QR
{
    [Transaction(TransactionMode.Manual)]
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

                var projects = Task.Run(() => client.GetProjectsAsync()).GetAwaiter().GetResult();
                if (defaultProject != null && projects.All(p => p.id != defaultProject.id))
                    projects.Insert(0, defaultProject);

                var sheets = new FilteredElementCollector(doc)
                    .OfClass(typeof(ViewSheet))
                    .Cast<ViewSheet>()
                    .Where(s => !s.IsPlaceholder)
                    .ToList();

                UploadExportWindow uploadWin = new UploadExportWindow(
                    projects,
                    sheets,
                    client.CurrentUsername,
                    defaultProject?.id);
                uploadWin.OnLogout += () => { client.Logout(); NotificationWindow.ShowInfo("Je bent uitgelogd."); };

                if (uploadWin.ShowDialog() != true) return Result.Cancelled;

                ProgressWindow progress = new ProgressWindow();
                progress.Show();

                List<string> results = new List<string>();
                var items = uploadWin.ValidItems;
                int completed = 0;

                try
                {
                    foreach (var item in items)
                    {
                        int startPercent = (int)((double)completed / items.Count * 100);
                        progress.Update($"Uploaden: {item.FileName}...", startPercent);

                        UploadQrPlacement uploadResult = UploadAndCreateQr(
                            client,
                            uploadWin.SelectedProject.id,
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

                        if (item.SelectedSheet != null && !string.IsNullOrEmpty(uploadResult.QrTempPath))
                        {
                            using (Transaction t = new Transaction(doc, "Plaats QR code"))
                            {
                                t.Start();
                                PlaceQrOnSheet(doc, item.SelectedSheet.Id, uploadResult.QrTempPath, item.AssemblyCode);
                                t.Commit();
                            }
                        }

                        if (!string.IsNullOrEmpty(uploadResult.QrTempPath) && File.Exists(uploadResult.QrTempPath))
                            File.Delete(uploadResult.QrTempPath);

                        results.Add(item.SelectedSheet == null
                            ? $"OK: {item.FileName} geupload, geen sheet gekoppeld"
                            : $"OK: {item.FileName} geupload en QR geplaatst");

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
                }
                catch (Exception ex)
                {
                    progress.Close();
                    NotificationWindow.ShowError($"Er is een fout opgetreden bij uploaden:\n{ex.Message}");
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

        private string GetSha256(string filePath)
        {
            using (var sha256 = SHA256.Create())
            using (var stream = File.OpenRead(filePath))
            {
                var hash = sha256.ComputeHash(stream);
                return BitConverter.ToString(hash).Replace("-", "").ToLowerInvariant();
            }
        }

        private void PlaceQrOnSheet(Document doc, ElementId sheetId, string imagePath, string label)
        {
            ViewSheet sheet = doc.GetElement(sheetId) as ViewSheet;
            if (sheet == null) return;

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

        private class UploadQrPlacement
        {
            public string QrTempPath { get; set; }
            public string Error { get; set; }
        }
    }
}
