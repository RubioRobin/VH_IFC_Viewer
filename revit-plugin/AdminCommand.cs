using System;
using System.Diagnostics;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Autodesk.Revit.Attributes;

namespace VH_IFC_QR
{
    [Transaction(TransactionMode.Manual)]
    public class AdminCommand : IExternalCommand
    {
        public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
        {
            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = "https://vh-ifc-viewer.vercel.app/admin.html#/login",
                    UseShellExecute = true
                });
                return Result.Succeeded;
            }
            catch (Exception ex)
            {
                message = ex.Message;
                return Result.Failed;
            }
        }
    }
}
