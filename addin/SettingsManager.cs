using System;
using System.IO;
using System.Text.Json;

namespace VH_IFC_QR
{
    public class AppSettings
    {
        public string LastProjectId { get; set; }
        public string LastPrefix { get; set; }

        // Server Settings
        public string BackendUrl { get; set; } = "https://vh-ifc-backend.onrender.com";
        public string AdminUrl { get; set; } = "https://vh-ifc-viewer.vercel.app/admin.html#/login";

        // QR Settings
        public double QrSizeMm { get; set; } = 50.0;
        public double QrOffsetMm { get; set; } = 10.0;
        public string QrLocation { get; set; } = "BottomRight"; // BottomRight, BottomLeft, TopRight, TopLeft

        // IFC Settings
        public string IfcVersion { get; set; } = "IFC4"; // IFC2x3, IFC4, etc.
        public bool ExportOnlyVisible { get; set; } = true;
    }

    public static class SettingsManager
    {
        private static readonly string SettingsFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "VH_IFC_Viewer");
        private static readonly string SettingsFile = Path.Combine(SettingsFolder, "settings.json");

        public static AppSettings Instance { get; private set; } = new AppSettings();

        static SettingsManager()
        {
            Load();
        }

        public static void Load()
        {
            try
            {
                if (File.Exists(SettingsFile))
                {
                    string json = File.ReadAllText(SettingsFile);
                    var settings = JsonSerializer.Deserialize<AppSettings>(json);
                    if (settings != null)
                    {
                        Instance = settings;
                    }
                }
            }
            catch { /* Fallback to defaults */ }
        }

        public static void Save()
        {
            try
            {
                Directory.CreateDirectory(SettingsFolder);
                string json = JsonSerializer.Serialize(Instance, new JsonSerializerOptions { WriteIndented = true });
                File.WriteAllText(SettingsFile, json);
            }
            catch { /* Ignore */ }
        }
    }
}
