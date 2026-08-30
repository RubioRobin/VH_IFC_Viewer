using System;
using System.IO;
using System.Text.Json;

namespace VH_IFC_QR
{
    /// <summary>
    /// Persists only non-sensitive user preferences. Connection details belong to
    /// the deployed add-in and are never read from or written to settings.json.
    /// </summary>
    public sealed class AppSettings
    {
        public double QrSizeMm { get; set; } = 20.6;
        public double QrOffsetMm { get; set; } = 10;
        public string QrLocation { get; set; } = "BottomRight";
        public string IfcVersion { get; set; } = "IFC4";
        public bool ExportOnlyVisible { get; set; } = true;
        public string LastProjectId { get; set; } = "";
        public string LastExportFolder { get; set; } = "";
        public string LastPrefix { get; set; } = "";
    }

    public static class SettingsManager
    {
        private static readonly string SettingsFile = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "VH_IFC_Viewer",
            "settings.json");

        public static AppSettings Instance { get; private set; } = new AppSettings();

        static SettingsManager()
        {
            Load();
        }

        public static void Load()
        {
            try
            {
                if (!File.Exists(SettingsFile))
                    return;

                string json = File.ReadAllText(SettingsFile);
                var settings = JsonSerializer.Deserialize<AppSettings>(json);
                if (settings != null)
                {
                    Instance = settings;

                    // Earlier settings schemas stored connection fields in this
                    // file. Preserve user preferences, but erase those obsolete
                    // values on the next add-in start.
                    if (ContainsLegacyConnectionFields(json))
                        Save();
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[SettingsManager] Laden mislukt, standaardwaarden gebruikt: {ex.Message}");
            }
        }

        public static void Save()
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(SettingsFile)!);
                File.WriteAllText(
                    SettingsFile,
                    JsonSerializer.Serialize(Instance, new JsonSerializerOptions { WriteIndented = true }));
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException("Instellingen konden niet worden opgeslagen.", ex);
            }
        }

        private static bool ContainsLegacyConnectionFields(string json)
        {
            return json.IndexOf("\"BackendUrl\"", StringComparison.OrdinalIgnoreCase) >= 0 ||
                   json.IndexOf("\"ClientId\"", StringComparison.OrdinalIgnoreCase) >= 0 ||
                   json.IndexOf("\"ClientSecret\"", StringComparison.OrdinalIgnoreCase) >= 0 ||
                   json.IndexOf("\"SupabaseUrl\"", StringComparison.OrdinalIgnoreCase) >= 0 ||
                   json.IndexOf("\"SupabasePublishableKey\"", StringComparison.OrdinalIgnoreCase) >= 0 ||
                   json.IndexOf("\"PluginAccessKey\"", StringComparison.OrdinalIgnoreCase) >= 0;
        }
    }
}
