using System;
using System.Reflection;
using Autodesk.Revit.UI;
using System.Windows.Media.Imaging;

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
            
            // 2. Admin Button
            PushButtonData adminData = new PushButtonData("cmdAdmin",
                "Admin Dashboard", thisAssemblyPath, "VH_IFC_QR.AdminCommand");
            adminData.ToolTip = "Open backend admin dashboard.";

            // 3. Settings Button
            PushButtonData settingsData = new PushButtonData("cmdSettings",
                "IFC Settings", thisAssemblyPath, "VH_IFC_QR.IfcSettingsCommand");
            settingsData.ToolTip = "Configureer IFC export en QR code instellingen.";

            panel.AddItem(buttonData);
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
