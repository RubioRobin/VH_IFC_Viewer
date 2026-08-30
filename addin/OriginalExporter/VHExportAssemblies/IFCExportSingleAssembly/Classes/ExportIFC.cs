using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using BIM.IFC.Export.UI;
using Revit.IFC.Common.Enums;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.Versioning;
using System.Text;
using System.Threading.Tasks;

namespace IFCExportSingleAssembly.Classes
{
    [SupportedOSPlatform("windows")]
    public class ExportIFC
    {
        public ExportIFC()
        {

        }

        public static void Export(
            string exportFolder,
            View exportView,
            IFCVersion ifcVersion,
            SiteTransformBasis coordinateBaseOption
            )
        {
            // Gebruik ongewijzigd de standaardconfiguratie van de officiële
            // Revit IFC-exporter. Zo blijven alle brondefaults, waaronder
            // Export IFC Common Property Sets, leidend voor deze export.
            var config = IFCExportConfiguration.CreateDefaultConfiguration();

            // Deze waarden zijn alleen nodig voor de bestaande VH-workflow:
            // één IFC per gefilterde assemblageview.
            config.Name = "VH Assembly IFC Export";
            config.IFCVersion = ifcVersion;
            config.UseActiveViewGeometry = true;
            config.VisibleElementsOfCurrentView = true;
            config.ActiveViewId = exportView.Id;
            config.SitePlacement = coordinateBaseOption;

            // Zorg dat de map bestaat
            exportFolder = exportFolder?.Trim() ?? "";
            if (string.IsNullOrWhiteSpace(exportFolder))
                throw new ArgumentException("Exportmap is leeg.");

            System.IO.Directory.CreateDirectory(exportFolder);

            // ⬇️ NIEUW: bepaal veilige bestandsnaam (projectnaam als view == "{3D}")
            string fileName = ComputeExportFileName(exportView);

            IFCExportOptions options = new IFCExportOptions();
            config.UpdateOptions(options, exportView.Id);

            exportView.Document.Export(exportFolder, fileName, options);
        }

        private static string MakeSafeFileName(string name)
        {
            var invalid = System.IO.Path.GetInvalidFileNameChars();
            var sb = new System.Text.StringBuilder(name.Length);
            foreach (var ch in name)
                sb.Append(invalid.Contains(ch) ? '_' : ch);
            // optioneel: extra trimming/verkorten
            return sb.ToString().Trim();
        }
        private static string ComputeExportFileName(View exportView)
        {
            string name = exportView?.Name ?? "export";

            // Als de actieve view de default 3D-view is ("{3D}"), gebruik projectnaam
            if (string.Equals(name, "{3D}", StringComparison.OrdinalIgnoreCase))
            {
                string projectName = GetProjectName(exportView.Document);
                name = string.IsNullOrWhiteSpace(projectName) ? "Project" : projectName;
            }

            return MakeSafeFileName(name);
        }

        private static string GetProjectName(Document doc)
        {
            // Probeer eerst Project Information > Name, val terug op documenttitel
            string projName = null;

            // Sommige Revit-versies hebben ProjectInformation.Name als property,
            // in andere pak je de parameter PROJECT_NAME.
            //try { projName = doc.ProjectInformation?.Name; } catch { /* ignore */ }

            try { projName = doc.Title; } catch { /* ignore */ }

            //if (string.IsNullOrWhiteSpace(projName))
            //    projName = doc.ProjectInformation?
            //        .get_Parameter(BuiltInParameter.PROJECT_NAME)?.AsString();

            if (string.IsNullOrWhiteSpace(projName))
                projName = "Project";

            //if (string.IsNullOrWhiteSpace(projName))
            //    projName = doc.Title; // RVT-bestandsnaam zonder extensie

            return projName ?? "Project";
        }
    }
}
