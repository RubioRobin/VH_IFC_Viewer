using Autodesk.Revit.UI;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Media.Imaging;

namespace IFCExportSingleAssembly
{
    internal class ExternalApplication : IExternalApplication
    {
        public Result OnShutdown(UIControlledApplication application)
        {
            return Result.Succeeded;
        }

        public Result OnStartup(UIControlledApplication application)
        {
            string ribbonTabName = "VHPrefab Tools 2.0";
            string[] tabNames = new string[]
            {
                "Export Tools",
            };

            //
            // Create the ribbon panel
            RibbonPanel panel1 = CreateRibbonPanel(application, ribbonTabName, tabNames[0]);

            //
            // Create Button
            // Assembly is using the System.Reflection namespace
            string path = Assembly.GetExecutingAssembly().Location;
            PushButtonData button01 = new PushButtonData("IFCExportSingleAssembly", "IFCExportSingleAssembly", 
                path, "IFCExportSingleAssembly.ExecuteAddin");

            //
            // Add button image
            string username = Environment.UserName;
            BitmapImage image01;

            try { image01 = new BitmapImage(new Uri(@"C:\Users\" + username + 
                @"\AppData\Roaming\Autodesk\Revit\Addins\AddinIcons\VHIFCExportSingleAssembly.png")); }
            catch { image01 = null; }

            panel1.AddSeparator();

            //
            // Add addin to ribbon
            PushButton pushButton1 = panel1.AddItem(button01) as PushButton;
            pushButton1.LargeImage = image01;

            return Result.Succeeded;
        }

        private RibbonPanel CreateRibbonPanel(UIControlledApplication application, string tabName, string panelName)
        {
            try
            {
                application.CreateRibbonTab(tabName);
            }
            catch { }


            List<RibbonPanel> panelList = application.GetRibbonPanels(tabName);
            RibbonPanel panel = null;
            foreach (RibbonPanel rp in panelList)
            {
                if (rp.Name == panelName)
                {
                    panel = rp;
                    break;
                }
            }
            if (panel == null)
            {
                panel = application.CreateRibbonPanel(tabName, panelName);
            }
            return panel;
        }
    }
}
