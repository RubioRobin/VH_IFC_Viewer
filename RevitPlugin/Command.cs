using System;
using System.Collections.Generic;
using System.Linq;
using System.IO;
using System.Net.Http;
using System.Net.Http;
using System.Threading.Tasks;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Autodesk.Revit.Attributes;

namespace VH_IFC_QR
{
    [Transaction(TransactionMode.Manual)]
    public class GenerateQRCommand : IExternalCommand
    {
        // Base URL for the Viewer (Frontend)
        private const string ViewerBaseUrl = "https://vh-ifc-viewer.vercel.app/";

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

                using (var form = new SelectionForm(views3D, sheets))
                {
                    if (form.ShowDialog() != System.Windows.Forms.DialogResult.OK)
                    {
                        return Result.Cancelled;
                    }
                    exportViewId = form.Selected3DViewId;
                    targetSheetId = form.SelectedSheetId;
                    exportFolder = form.SelectedFolder;
                }

                if (string.IsNullOrWhiteSpace(exportFolder) || !Directory.Exists(exportFolder))
                {
                    TaskDialog.Show("Fout", "Ongeldige map geselecteerd.");
                    return Result.Failed;
                }

                View3D exportView = doc.GetElement(exportViewId) as View3D;
                ViewSheet targetSheet = doc.GetElement(targetSheetId) as ViewSheet;

                // 3. Generate File ID and Paths
                Guid fileId = Guid.NewGuid();
                // IMPORTANT: Filename format MUST include the GUID for the dashboard to recognize it!
                string safeTitle = string.Join("_", doc.Title.Split(Path.GetInvalidFileNameChars()));
                string ifcFilename = $"{safeTitle}_{fileId}.ifc";
                string fullIfcPath = Path.Combine(exportFolder, ifcFilename);
                string qrFilename = $"{safeTitle}_{fileId}_QR.png";
                string fullQrPath = Path.Combine(exportFolder, qrFilename);

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

                // 5. Generate and Download QR Code (Locally)
                string viewerUrl = $"{ViewerBaseUrl}?fileId={fileId}";
                // Optional: selection handling
                var selection = uidoc.Selection.GetElementIds();
                if (selection.Count == 1)
                {
                    ElementId elementId = selection.First();
                    Element element = doc.GetElement(elementId);
                    string ifcGuid = GetIfcGuid(element.UniqueId);
                    viewerUrl += $"&id={ifcGuid}";
                }

                bool qrSuccess = DownloadQrImage(viewerUrl, fullQrPath);

                if (!qrSuccess)
                {
                    TaskDialog.Show("Warning", "IFC Exported, but QR Code generation failed (Check Internet Connection).");
                }
                else
                {
                    // 6. Place QR in Revit on Target Sheet
                    using (Transaction t = new Transaction(doc, "Place QR Code"))
                    {
                        t.Start();
                        PlaceQrImageOnView(doc, targetSheet, fullQrPath);
                        t.Commit();
                    }
                }

                TaskDialog.Show("Succes", $"Export Voltooid!\n\n1. IFC Bestand: {ifcFilename}\n2. QR Code geplaatst op sheet.\n\nBELANGRIJK: Upload dit specifieke bestand naar het Dashboard om de QR code te laten werken!");
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

        private bool DownloadQrImage(string url, string savePath)
        {
            try
            {
                string encodedUrl = System.Net.WebUtility.UrlEncode(url);
                string qrApiUrl = $"https://api.qrserver.com/v1/create-qr-code/?size=300x300&data={encodedUrl}";

                using (var client = new HttpClient())
                {
                    var response = client.GetAsync(qrApiUrl).Result;
                    if (response.IsSuccessStatusCode)
                    {
                        var bytes = response.Content.ReadAsByteArrayAsync().Result;
                        File.WriteAllBytes(savePath, bytes);
                        return true;
                    }
                }
                return false;
            }
            catch
            {
                return false;
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
