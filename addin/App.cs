using System;
using System.Reflection;
using System.IO;
using System.Windows.Media.Imaging;
using Autodesk.Revit.UI;

namespace VH_IFC_QR
{
    public class App : IExternalApplication
    {
        public Result OnStartup(UIControlledApplication application)
        {
// Removed startup message as requested
            string tabName = "VH";
            try
            {
                application.CreateRibbonTab(tabName);
            }
            catch { } // Tab might already exist

            RibbonPanel panel = application.CreateRibbonPanel(tabName, "Tools");

            string thisAssemblyPath = Assembly.GetExecutingAssembly().Location;

            // 1. Main IFC workflow
            PushButtonData uploadData = new PushButtonData("cmdUploadExport",
                "IFC Exporteren", thisAssemblyPath, "VH_IFC_QR.UploadExportCommand");
            uploadData.ToolTip = "Upload geexporteerde IFC bestanden naar de VH Viewer en plaats QR codes op sheets.";

            // Laad iconen vanuit dezelfde map als de DLL
            string dllDir = Path.GetDirectoryName(thisAssemblyPath);
            BitmapImage LoadIcon(string name) {
                string iconPath = Path.Combine(dllDir, name);
                if (!File.Exists(iconPath)) return null;
                var img = new BitmapImage();
                img.BeginInit();
                img.UriSource = new Uri(iconPath);
                img.CacheOption = BitmapCacheOption.OnLoad;
                img.EndInit();
                return img;
            }

            var uploadIcon = LoadIcon("icon_export.png");

            if (uploadIcon != null) uploadData.LargeImage = uploadIcon;

            panel.AddItem(uploadData);

            return Result.Succeeded;
        }

        public Result OnShutdown(UIControlledApplication application)
        {
            return Result.Succeeded;
        }
    }
}
