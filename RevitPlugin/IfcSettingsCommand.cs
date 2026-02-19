using System;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Autodesk.Revit.Attributes;

namespace VH_IFC_QR
{
    [Transaction(TransactionMode.Manual)]
    public class IfcSettingsCommand : IExternalCommand
    {
        public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
        {
            try
            {
                IfcSettingsWindow settingsWin = new IfcSettingsWindow();
                settingsWin.ShowDialog();
                return Result.Succeeded;
            }
            catch (Exception)
            {
                NotificationWindow.ShowError("Er is een fout opgetreden bij het openen van de instellingen.\n\nProbeer het opnieuw.");
                return Result.Failed;
            }
        }
    }
}
