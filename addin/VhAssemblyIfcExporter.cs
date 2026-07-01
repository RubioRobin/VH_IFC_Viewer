using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.Versioning;
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

    [SupportedOSPlatform("windows")]
    public static class VhAssemblyIfcExporter
    {
        public static VhAssemblyIfcExportResult Export(
            ExternalCommandData commandData,
            ref string message,
            ElementSet elements)
        {
            DateTime startedAtUtc = DateTime.UtcNow.AddSeconds(-5);

            try
            {
                string exportFolderBefore = TryReadOriginalExporterFolder();
                Dictionary<string, IfcFileSnapshot> filesBefore = TrySnapshotIfcFiles(exportFolderBefore);

                Result originalResult = ExecuteOriginalExporter(commandData, ref message, elements);
                if (originalResult == Result.Cancelled)
                {
                    message = string.Empty;
                    return Cancelled("IFC export geannuleerd.");
                }

                if (originalResult == Result.Failed)
                {
                    string exportMessage = string.IsNullOrWhiteSpace(message)
                        ? "De originele IFC exporter is mislukt."
                        : message;
                    message = string.Empty;
                    return Failed(exportMessage);
                }

                string exportFolder = TryReadOriginalExporterFolder();
                if (string.IsNullOrWhiteSpace(exportFolder) || !Directory.Exists(exportFolder))
                {
                    return Succeeded(null, new List<VhExportedIfcFile>());
                }

                IReadOnlyDictionary<string, IfcFileSnapshot> comparisonSnapshot =
                    SameFolder(exportFolderBefore, exportFolder) ? filesBefore : null;

                List<VhExportedIfcFile> exportedItems = FindExportedIfcFiles(
                        exportFolder,
                        comparisonSnapshot,
                        startedAtUtc)
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

        [SupportedOSPlatform("windows")]
        private static Result ExecuteOriginalExporter(
            ExternalCommandData commandData,
            ref string message,
            ElementSet elements)
        {
            IExternalCommand externalCommand = new IFCExportSingleAssembly.ExecuteAddin();
            return externalCommand.Execute(commandData, ref message, elements);
        }

        private static string NormalizeFolderPath(string folderPath)
        {
            if (string.IsNullOrWhiteSpace(folderPath))
                return null;

            try
            {
                return TrimTrailingDirectorySeparators(Path.GetFullPath(folderPath.Trim()));
            }
            catch
            {
                return TrimTrailingDirectorySeparators(folderPath.Trim());
            }
        }

        private static string TrimTrailingDirectorySeparators(string folderPath)
        {
            string root = null;
            try
            {
                root = Path.GetPathRoot(folderPath);
            }
            catch
            {
            }

            if (!string.IsNullOrEmpty(root) &&
                string.Equals(folderPath, root, StringComparison.OrdinalIgnoreCase))
            {
                return folderPath;
            }

            return folderPath.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        }

        private static bool SameFolder(string left, string right)
        {
            if (string.IsNullOrWhiteSpace(left) || string.IsNullOrWhiteSpace(right))
                return false;

            return string.Equals(
                NormalizeFolderPath(left),
                NormalizeFolderPath(right),
                StringComparison.OrdinalIgnoreCase);
        }

        private static string TryReadOriginalExporterFolder()
        {
            try
            {
                return NormalizeFolderPath(ReadOriginalExporterFolder());
            }
            catch
            {
                return null;
            }
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

        private sealed class IfcFileSnapshot
        {
            public long Length { get; set; }
            public DateTime LastWriteTimeUtc { get; set; }
        }

        private static Dictionary<string, IfcFileSnapshot> SnapshotIfcFiles(string exportFolder)
        {
            if (string.IsNullOrWhiteSpace(exportFolder) || !Directory.Exists(exportFolder))
                return new Dictionary<string, IfcFileSnapshot>(StringComparer.OrdinalIgnoreCase);

            return Directory
                .GetFiles(exportFolder, "*.ifc", SearchOption.TopDirectoryOnly)
                .Select(path => new FileInfo(path))
                .Where(file => file.Exists)
                .ToDictionary(
                    file => file.FullName,
                    file => new IfcFileSnapshot
                    {
                        Length = file.Length,
                        LastWriteTimeUtc = file.LastWriteTimeUtc
                    },
                    StringComparer.OrdinalIgnoreCase);
        }

        private static Dictionary<string, IfcFileSnapshot> TrySnapshotIfcFiles(string exportFolder)
        {
            try
            {
                return SnapshotIfcFiles(exportFolder);
            }
            catch
            {
                return null;
            }
        }

        private static IEnumerable<string> FindExportedIfcFiles(
            string exportFolder,
            IReadOnlyDictionary<string, IfcFileSnapshot> filesBefore,
            DateTime startedAtUtc)
        {
            Dictionary<string, IfcFileSnapshot> filesAfter = SnapshotIfcFiles(exportFolder);

            if (filesBefore != null)
            {
                List<string> changedFiles = filesAfter
                    .Where(pair =>
                        !filesBefore.TryGetValue(pair.Key, out IfcFileSnapshot before) ||
                        before.Length != pair.Value.Length ||
                        before.LastWriteTimeUtc != pair.Value.LastWriteTimeUtc)
                    .Select(pair => pair.Key)
                    .OrderBy(Path.GetFileName, StringComparer.OrdinalIgnoreCase)
                    .ToList();

                if (changedFiles.Count > 0)
                    return changedFiles;
            }

            return filesAfter
                .Where(pair => pair.Value.LastWriteTimeUtc >= startedAtUtc)
                .Select(pair => pair.Key)
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
