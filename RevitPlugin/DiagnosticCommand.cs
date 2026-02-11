using System;
using System.Diagnostics;
using System.Threading.Tasks;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Autodesk.Revit.Attributes;

namespace VH_IFC_QR
{
    [Transaction(TransactionMode.Manual)]
    public class DiagnosticCommand : IExternalCommand
    {
        private const string BaseUrl = "https://vh-ifc-backend.onrender.com";
        private const string ClientId = "revit_plugin";
        private const string ClientSecret = "revit_secret_123";

        public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
        {
            var sw = Stopwatch.StartNew();
            try
            {
                var client = new PluginClient(BaseUrl);
                string summary = $"Diagnose gestart naar: {BaseUrl}\nTijd: {DateTime.Now:HH:mm:ss}\n\n";

                // Test 1: Login
                var loginSw = Stopwatch.StartNew();
                try {
                    bool loginOk = Task.Run(() => client.LoginAsync(ClientId, ClientSecret)).GetAwaiter().GetResult();
                    loginSw.Stop();
                    
                    summary += $"- Login: {(loginOk ? "SUCCESS" : "FAILED")} in {loginSw.ElapsedMilliseconds}ms\n";
                    
                    if (!loginOk) {
                        TaskDialog.Show("Diagnose Fout", summary + "\nDe server weigert de inlog. Controleer credentials (ClientId/Secret) of de backend logs.");
                        return Result.Failed;
                    }
                } catch (Exception ex) {
                    summary += $"- Login: EXCEPTION ({ex.Message})\n";
                    TaskDialog.Show("Diagnose Fout", summary + "\nKon geen verbinding maken met de server.");
                    return Result.Failed;
                }

                // Test 2: Projects
                var projSw = Stopwatch.StartNew();
                var projects = Task.Run(() => client.GetProjectsAsync()).GetAwaiter().GetResult();
                projSw.Stop();
                summary += $"- Projecten: {projects.Count} stuks gevonden ({projSw.ElapsedMilliseconds}ms)\n";

                TaskDialog.Show("Diagnose Succes", 
                    summary + 
                    $"\nTotaal tijd: {sw.ElapsedMilliseconds}ms\n\n" +
                    "De verbinding is uitstekend! Je kunt nu de Export IFC knop gebruiken.");

                return Result.Succeeded;
            }
            catch (Exception ex)
            {
                TaskDialog.Show("Diagnose Kritieke Fout", $"Fout: {ex.Message}\n\nTijd verstreken: {sw.ElapsedMilliseconds}ms");
                return Result.Failed;
            }
        }
    }
}
