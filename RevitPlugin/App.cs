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
            string tabName = "VH";
            try
            {
                application.CreateRibbonTab(tabName);
            }
            catch { } // Tab might already exist

            RibbonPanel panel = application.CreateRibbonPanel(tabName, "Tools");

            string thisAssemblyPath = Assembly.GetExecutingAssembly().Location;
            PushButtonData buttonData = new PushButtonData("cmdExportIFC",
                "Export IFC", thisAssemblyPath, "VH_IFC_QR.ExportIFCCommand");
            
            PushButtonData diagData = new PushButtonData("cmdDiagnostics",
                "Test Verbinding", thisAssemblyPath, "VH_IFC_QR.DiagnosticCommand");

            buttonData.ToolTip = "Export current view to IFC locally.";
            diagData.ToolTip = "Test de verbinding met de backend server.";

            panel.AddItem(buttonData);
            panel.AddItem(diagData);

            return Result.Succeeded;
        }

        public Result OnShutdown(UIControlledApplication application)
        {
            return Result.Succeeded;
        }
    }
}
