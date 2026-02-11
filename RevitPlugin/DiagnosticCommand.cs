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
                // We use a manual check here to get more details
                try {
                    var payload = new { client_id = ClientId, client_secret = ClientSecret };
                    var content = new System.Net.Http.StringContent(Newtonsoft.Json.JsonConvert.SerializeObject(payload), System.Text.Encoding.UTF8, "application/json");
                    
                    using (var httpClient = new System.Net.Http.HttpClient()) {
                        httpClient.Timeout = TimeSpan.FromSeconds(60); // Lower timeout for diagnostic
                        httpClient.DefaultRequestHeaders.Add("User-Agent", "VH-Revit-Diagnostic/1.0");
                        
                        var response = Task.Run(() => httpClient.PostAsync($"{BaseUrl}/api/plugin/login", content)).GetAwaiter().GetResult();
                        loginSw.Stop();
                        
                        summary += $"- Login: {response.StatusCode} ({(int)response.StatusCode}) in {loginSw.ElapsedMilliseconds}ms\n";
                        
                        if (!response.IsSuccessStatusCode) {
                            var body = Task.Run(() => response.Content.ReadAsStringAsync()).GetAwaiter().GetResult();
                            summary += $"  Fout Details: {body}\n";
                            TaskDialog.Show("Diagnose Fout", summary + "\nDe server weigert de inlog. Controleer de backend logs.");
                            return Result.Failed;
                        }
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
