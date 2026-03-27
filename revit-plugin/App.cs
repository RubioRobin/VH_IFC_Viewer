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
            
            // 1. Export Button
            PushButtonData buttonData = new PushButtonData("cmdExportIFC",
                "Export IFC", thisAssemblyPath, "VH_IFC_QR.ExportIFCCommand");
            buttonData.ToolTip = "Export current view to IFC locally and link with VH Viewer.";
            
            // 1b. Link QR Button (Assembly Code Matching)
            PushButtonData linkData = new PushButtonData("cmdLinkQR",
                "Link QR", thisAssemblyPath, "VH_IFC_QR.LinkQRCommand");
            linkData.ToolTip = "Koppel QR codes aan bestaande IFC bestanden via assembly codes.";

            // 2. Admin Button
            PushButtonData adminData = new PushButtonData("cmdAdmin",
                "Admin Dashboard", thisAssemblyPath, "VH_IFC_QR.AdminCommand");
            adminData.ToolTip = "Open backend admin dashboard.";

            // 3. Settings Button
            PushButtonData settingsData = new PushButtonData("cmdSettings",
                "IFC Settings", thisAssemblyPath, "VH_IFC_QR.IfcSettingsCommand");
            settingsData.ToolTip = "Configureer IFC export en QR code instellingen.";

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

            var exportIcon = LoadIcon("icon_export.png");
            var linkIcon = LoadIcon("icon_export.png"); // Hergebruik export icon; vervang later door eigen icoon
            var adminIcon = LoadIcon("icon_admin.png");
            var settingsIcon = LoadIcon("icon_settings.png");

            if (exportIcon != null) buttonData.LargeImage = exportIcon;
            if (linkIcon != null) linkData.LargeImage = linkIcon;
            if (adminIcon != null) adminData.LargeImage = adminIcon;
            if (settingsIcon != null) settingsData.LargeImage = settingsIcon;

            panel.AddItem(buttonData);
            panel.AddItem(linkData);
            panel.AddItem(adminData);
            panel.AddItem(settingsData);

            return Result.Succeeded;
        }

        public Result OnShutdown(UIControlledApplication application)
        {
            return Result.Succeeded;
        }
    }
}
