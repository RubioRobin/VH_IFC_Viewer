using System;
using System.Collections.Generic;
using System.Linq;
using System.IO;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Autodesk.Revit.Attributes;

namespace VH_IFC_QR
{
    [Transaction(TransactionMode.Manual)]
    public class ExportIFCCommand : IExternalCommand
    {
        // Local Export Configuration

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
                string exportFolder = null;

                using (var form = new SelectionForm(views3D, sheets))
                {
                    if (form.ShowDialog() != System.Windows.Forms.DialogResult.OK)
                    {
                        return Result.Cancelled;
                    }
                    exportViewId = form.Selected3DViewId;
                    exportFolder = form.SelectedFolder;
                }

                if (string.IsNullOrWhiteSpace(exportFolder) || !Directory.Exists(exportFolder))
                {
                    TaskDialog.Show("Fout", "Ongeldige map geselecteerd.");
                    return Result.Failed;
                }

                View3D exportView = doc.GetElement(exportViewId) as View3D;

                // 3. Generate Filename (locally) to use for export
                string safeTitle = string.Join("_", doc.Title.Split(Path.GetInvalidFileNameChars()));
                string ifcFilename = $"{safeTitle}_Export.ifc";
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

                TaskDialog.Show("Succes", $"Export Voltooid!\n\nBestand opgeslagen in:\n{fullIfcPath}");
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
    }
}        // Removed legacy GetIfcGuid helper as it's not needed for the new flow
    }
}
