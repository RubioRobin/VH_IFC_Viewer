using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.Loader;
using System.Xml.Linq;

namespace VH_IFC_QR
{
    public class VhAssemblyIfcExportResult
    {
        public ResultStatus Status { get; set; }
        public string Message { get; set; }
        public string ExportFolder { get; set; }
        public List<string> ExportedFiles { get; set; } = new List<string>();
        public List<VhExportedIfcFile> ExportedItems { get; set; } = new List<VhExportedIfcFile>();
    }

    public class VhExportedIfcFile
    {
        public string FilePath { get; set; }
        public string AssemblyCode { get; set; }
        public string SheetNumber { get; set; }
        public string SheetName { get; set; }
    }

    public enum ResultStatus
    {
        Succeeded,
        Cancelled,
        Failed
    }

    public static class VhAssemblyIfcExporter
    {
        private const string OriginalExporterAssemblyName = "IFCExportSingleAssembly.dll";
        private const string OriginalExporterCommandType = "IFCExportSingleAssembly.ExecuteAddin";
        private static readonly object ResolverLock = new object();
        private static string _originalExporterFolder;
        private static bool _resolverRegistered;

        public static VhAssemblyIfcExportResult Export(
            ExternalCommandData commandData,
            ref string message,
            ElementSet elements)
        {
            DateTime startedAt = DateTime.Now.AddSeconds(-3);

            try
            {
                Result originalResult = ExecuteOriginalExporter(commandData, ref message, elements);
                if (originalResult == Result.Cancelled)
                    return Cancelled("IFC export geannuleerd.");

                if (originalResult == Result.Failed)
                    return Failed(string.IsNullOrWhiteSpace(message) ? "De originele IFC exporter is mislukt." : message);

                string exportFolder = ReadOriginalExporterFolder();
                if (string.IsNullOrWhiteSpace(exportFolder) || !Directory.Exists(exportFolder))
                {
                    return Succeeded(null, new List<VhExportedIfcFile>());
                }

                List<VhExportedIfcFile> exportedItems = FindExportedIfcFiles(exportFolder, startedAt)
                    .Select(path =>
                    {
                        string assemblyCode = AssemblyUploadNaming.ExtractAssemblyCode(path);
                        return new VhExportedIfcFile
                        {
                            FilePath = path,
                            AssemblyCode = assemblyCode,
                            SheetNumber = assemblyCode
                        };
                    })
                    .ToList();

                return Succeeded(exportFolder, exportedItems);
            }
            catch (Exception ex)
            {
                return Failed(ex.Message);
            }
        }

        private static Result ExecuteOriginalExporter(
            ExternalCommandData commandData,
            ref string message,
            ElementSet elements)
        {
            string exporterFolder = ResolveOriginalExporterFolder();
            EnsureAssemblyResolver(exporterFolder);

            string assemblyPath = Path.Combine(exporterFolder, OriginalExporterAssemblyName);
            Assembly assembly = AssemblyLoadContext.Default.LoadFromAssemblyPath(assemblyPath);
            Type commandType = assembly.GetType(OriginalExporterCommandType, throwOnError: true);
            object command = Activator.CreateInstance(commandType);

            if (command is not IExternalCommand externalCommand)
                throw new InvalidOperationException("De originele IFC exporter command kon niet worden gestart.");

            return externalCommand.Execute(commandData, ref message, elements);
        }

        private static string ResolveOriginalExporterFolder()
        {
            string addinFolder = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
            List<string> candidates = new List<string>
            {
                Path.Combine(addinFolder ?? "", "OriginalExporter")
            };

            candidates.AddRange(FindVendoredExporterRuntimeFolders(addinFolder));

            foreach (string candidate in candidates)
            {
                string fullPath = Path.GetFullPath(candidate);
                if (File.Exists(Path.Combine(fullPath, OriginalExporterAssemblyName)))
                    return fullPath;
            }

            throw new FileNotFoundException(
                "De originele IFC exporter bestanden zijn niet gevonden.",
                OriginalExporterAssemblyName);
        }

        private static IEnumerable<string> FindVendoredExporterRuntimeFolders(string startFolder)
        {
            string current = startFolder;
            while (!string.IsNullOrWhiteSpace(current))
            {
                yield return Path.Combine(
                    current,
                    "OriginalExporter",
                    "VHExportAssemblies",
                    "IFCExportSingleAssembly",
                    "bin",
                    "Debug",
                    "net8.0-windows7.0");

                yield return Path.Combine(
                    current,
                    "OriginalExporter",
                    "VHExportAssemblies",
                    "IFCExportSingleAssembly",
                    "bin",
                    "Release",
                    "net8.0-windows7.0");

                DirectoryInfo parent = Directory.GetParent(current);
                current = parent?.FullName;
            }
        }

        private static void EnsureAssemblyResolver(string exporterFolder)
        {
            lock (ResolverLock)
            {
                _originalExporterFolder = exporterFolder;
                if (_resolverRegistered)
                    return;

                AssemblyLoadContext.Default.Resolving += ResolveOriginalExporterDependency;
                _resolverRegistered = true;
            }
        }

        private static Assembly ResolveOriginalExporterDependency(AssemblyLoadContext context, AssemblyName assemblyName)
        {
            string candidate = Path.Combine(_originalExporterFolder ?? "", assemblyName.Name + ".dll");
            if (File.Exists(candidate))
                return context.LoadFromAssemblyPath(candidate);

            return null;
        }

        private static string ReadOriginalExporterFolder()
        {
            string configPath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "Autodesk",
                "Revit",
                "Addins",
                "IFCExportSingleAssembly",
                "config.xml");

            if (!File.Exists(configPath))
                return null;

            XDocument document = XDocument.Load(configPath);

            string fileExportPath = document
                .Descendants()
                .FirstOrDefault(element =>
                    string.Equals(element.Name.LocalName, "FileExportPath", StringComparison.OrdinalIgnoreCase) &&
                    Directory.Exists((element.Value ?? "").Trim()))
                ?.Value
                ?.Trim();

            if (!string.IsNullOrWhiteSpace(fileExportPath))
                return fileExportPath;

            return document
                .Descendants()
                .Select(element => (element.Value ?? "").Trim())
                .FirstOrDefault(value => !string.IsNullOrWhiteSpace(value) && Directory.Exists(value));
        }

        private static IEnumerable<string> FindExportedIfcFiles(string exportFolder, DateTime startedAt)
        {
            return Directory
                .GetFiles(exportFolder, "*.ifc", SearchOption.TopDirectoryOnly)
                .Where(path => File.GetLastWriteTime(path) >= startedAt)
                .OrderBy(Path.GetFileName, StringComparer.OrdinalIgnoreCase)
                .ToList();
        }

        private static VhAssemblyIfcExportResult Failed(string message)
        {
            return new VhAssemblyIfcExportResult
            {
                Status = ResultStatus.Failed,
                Message = message
            };
        }

        private static VhAssemblyIfcExportResult Succeeded(string exportFolder, List<VhExportedIfcFile> exportedItems)
        {
            return new VhAssemblyIfcExportResult
            {
                Status = ResultStatus.Succeeded,
                ExportFolder = exportFolder,
                ExportedItems = exportedItems ?? new List<VhExportedIfcFile>(),
                ExportedFiles = (exportedItems ?? new List<VhExportedIfcFile>())
                    .Select(item => item.FilePath)
                    .ToList()
            };
        }

        private static VhAssemblyIfcExportResult Cancelled(string message)
        {
            return new VhAssemblyIfcExportResult
            {
                Status = ResultStatus.Cancelled,
                Message = message
            };
        }
    }
}
