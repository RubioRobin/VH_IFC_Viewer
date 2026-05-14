using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;

namespace VH_IFC_QR
{
    public class ExternalIfcExportResult
    {
        public Result Result { get; set; }
        public string Message { get; set; }
        public string ExportFolder { get; set; }
        public List<string> ExportedFiles { get; set; } = new List<string>();
    }

    public static class ExternalIfcExporterBridge
    {
        private const string ExporterAssemblyName = "IFCExportSingleAssembly.dll";
        private const string ExporterCommandType = "IFCExportSingleAssembly.ExecuteAddin";
        private const string ExporterUiAssemblyName = "IFCExportSingleAssemblyUI";
        private const string ExporterConfigType = "IFCExportSingleAssemblyUI.Services.AddinConfigSettings";

        public static ExternalIfcExportResult Run(
            ExternalCommandData commandData,
            ElementSet elements,
            Document doc,
            string fallbackFolder)
        {
            DateTime startedAt = DateTime.Now.AddSeconds(-3);
            string exporterDir = GetExporterDirectory();
            if (string.IsNullOrWhiteSpace(exporterDir))
            {
                return new ExternalIfcExportResult
                {
                    Result = Result.Failed,
                    Message = "De IFC exporter is niet gevonden naast de VH add-in."
                };
            }

            ResolveEventHandler resolver = CreateResolver(exporterDir);
            AppDomain.CurrentDomain.AssemblyResolve += resolver;

            try
            {
                string exporterPath = Path.Combine(exporterDir, ExporterAssemblyName);
                Assembly exporterAssembly = Assembly.LoadFrom(exporterPath);
                Type commandType = exporterAssembly.GetType(ExporterCommandType, true);
                var exporterCommand = Activator.CreateInstance(commandType) as IExternalCommand;
                if (exporterCommand == null)
                {
                    return new ExternalIfcExportResult
                    {
                        Result = Result.Failed,
                        Message = "De IFC exporter kon niet worden gestart."
                    };
                }

                string exporterMessage = null;
                Result result = exporterCommand.Execute(commandData, ref exporterMessage, elements);
                string exportFolder = TryReadExporterFolder(exporterDir);
                List<string> exportedFiles = FindExportedFiles(startedAt, exportFolder, fallbackFolder, doc);

                return new ExternalIfcExportResult
                {
                    Result = result,
                    Message = exporterMessage,
                    ExportFolder = exportFolder,
                    ExportedFiles = exportedFiles
                };
            }
            catch (Exception ex)
            {
                return new ExternalIfcExportResult
                {
                    Result = Result.Failed,
                    Message = ex.Message
                };
            }
            finally
            {
                AppDomain.CurrentDomain.AssemblyResolve -= resolver;
            }
        }

        private static string GetExporterDirectory()
        {
            string addinDir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
            if (string.IsNullOrWhiteSpace(addinDir)) return null;

            string exporterDir = Path.Combine(addinDir, "Exporter");
            string exporterPath = Path.Combine(exporterDir, ExporterAssemblyName);
            return File.Exists(exporterPath) ? exporterDir : null;
        }

        private static ResolveEventHandler CreateResolver(string exporterDir)
        {
            return (sender, args) =>
            {
                string assemblyName = new AssemblyName(args.Name).Name;
                Assembly loaded = AppDomain.CurrentDomain.GetAssemblies()
                    .FirstOrDefault(a => string.Equals(a.GetName().Name, assemblyName, StringComparison.OrdinalIgnoreCase));
                if (loaded != null) return loaded;

                string candidate = Path.Combine(exporterDir, assemblyName + ".dll");
                return File.Exists(candidate) ? Assembly.LoadFrom(candidate) : null;
            };
        }

        private static string TryReadExporterFolder(string exporterDir)
        {
            try
            {
                Assembly uiAssembly = AppDomain.CurrentDomain.GetAssemblies()
                    .FirstOrDefault(a => string.Equals(a.GetName().Name, ExporterUiAssemblyName, StringComparison.OrdinalIgnoreCase));

                if (uiAssembly == null)
                {
                    string uiPath = Path.Combine(exporterDir, ExporterUiAssemblyName + ".dll");
                    if (File.Exists(uiPath)) uiAssembly = Assembly.LoadFrom(uiPath);
                }

                Type configType = uiAssembly?.GetType(ExporterConfigType, false);
                if (configType == null) return null;

                object config = Activator.CreateInstance(configType);
                MethodInfo readMethod = configType.GetMethod("ReadExportPath", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance);
                object value = readMethod?.Invoke(config, null);
                string folder = value as string;

                if (string.IsNullOrWhiteSpace(folder))
                {
                    PropertyInfo property = configType.GetProperty("FileExportPath", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance);
                    folder = property?.GetValue(config) as string;
                }

                folder = folder?.Trim();
                return Directory.Exists(folder) ? folder : null;
            }
            catch
            {
                return null;
            }
        }

        private static List<string> FindExportedFiles(DateTime startedAt, string exportFolder, string fallbackFolder, Document doc)
        {
            var folders = new List<string>();
            AddFolder(folders, exportFolder);
            AddFolder(folders, fallbackFolder);
            AddFolder(folders, SettingsManager.Instance.LastExportFolder);
            AddFolder(folders, KnownFolder(Environment.SpecialFolder.UserProfile, "Downloads"));
            AddFolder(folders, Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory));
            AddFolder(folders, Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments));

            if (!string.IsNullOrWhiteSpace(doc?.PathName))
                AddFolder(folders, Path.GetDirectoryName(doc.PathName));

            return folders
                .Where(Directory.Exists)
                .SelectMany(folder => SafeGetIfcFiles(folder, startedAt))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(Path.GetFileName, StringComparer.OrdinalIgnoreCase)
                .ToList();
        }

        private static IEnumerable<string> SafeGetIfcFiles(string folder, DateTime startedAt)
        {
            try
            {
                return Directory
                    .GetFiles(folder, "*.ifc", SearchOption.TopDirectoryOnly)
                    .Where(path => File.GetLastWriteTime(path) >= startedAt);
            }
            catch
            {
                return Enumerable.Empty<string>();
            }
        }

        private static string KnownFolder(Environment.SpecialFolder root, string child)
        {
            string rootPath = Environment.GetFolderPath(root);
            return string.IsNullOrWhiteSpace(rootPath) ? null : Path.Combine(rootPath, child);
        }

        private static void AddFolder(List<string> folders, string folder)
        {
            if (string.IsNullOrWhiteSpace(folder)) return;
            if (folders.Any(f => string.Equals(f, folder, StringComparison.OrdinalIgnoreCase))) return;
            folders.Add(folder);
        }
    }
}
