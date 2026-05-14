using Autodesk.Revit.DB;
using Autodesk.Revit.DB.IFC;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace VH_IFC_QR
{
    public class VhAssemblyIfcExportResult
    {
        public ResultStatus Status { get; set; }
        public string Message { get; set; }
        public string ExportFolder { get; set; }
        public List<string> ExportedFiles { get; set; } = new List<string>();
    }

    public enum ResultStatus
    {
        Succeeded,
        Failed
    }

    public static class VhAssemblyIfcExporter
    {
        private const string AssemblyCodeParameter = "VH Assembly Code";
        private const string CbAssemblyCodeParameter = "CB Assembly Code";
        private const string DesignPhaseParameter = "VH Designphase";
        private const string PreferredBase3DViewName = "3D";
        private const string ExportConfigName = "VH Assembly Export";

        public static VhAssemblyIfcExportResult Export(Document doc, string preferredFolder)
        {
            if (doc == null)
                return Failed("Geen Revit document gevonden.");

            DateTime startedAt = DateTime.Now.AddSeconds(-3);
            string exportFolder = ResolveExportFolder(preferredFolder, doc);
            Directory.CreateDirectory(exportFolder);

            List<AssemblyExportItem> exportItems = ResolveExportItems(doc);
            if (exportItems.Count == 0)
            {
                return Failed(
                    "Geen assemblies gevonden om te exporteren.\n\n" +
                    "Controleer of de sheets een sheetnummer hebben dat overeenkomt met de parameter 'VH Assembly Code' op de assembly.");
            }

            var exportedFiles = new List<string>();
            TransactionGroup group = new TransactionGroup(doc, "VH IFC assembly export");

            try
            {
                group.Start();

                List<PreparedAssemblyView> preparedViews = PrepareAssemblyViews(doc, exportItems);
                if (preparedViews.Count == 0)
                    throw new InvalidOperationException("Er konden geen tijdelijke 3D views worden aangemaakt voor de IFC export.");

                foreach (PreparedAssemblyView prepared in preparedViews)
                {
                    string fileName = MakeSafeFileName(prepared.Item.AssemblyCode);
                    ExportView(doc, prepared.View, exportFolder, fileName);

                    string exportedFile = FindExportedIfc(exportFolder, fileName, startedAt);
                    if (!string.IsNullOrWhiteSpace(exportedFile))
                        exportedFiles.Add(exportedFile);
                }

                return new VhAssemblyIfcExportResult
                {
                    Status = ResultStatus.Succeeded,
                    ExportFolder = exportFolder,
                    ExportedFiles = exportedFiles
                        .Distinct(StringComparer.OrdinalIgnoreCase)
                        .OrderBy(Path.GetFileName, StringComparer.OrdinalIgnoreCase)
                        .ToList()
                };
            }
            catch (Exception ex)
            {
                return Failed(ex.Message, exportFolder);
            }
            finally
            {
                try
                {
                    if (group.HasStarted())
                        group.RollBack();
                }
                catch
                {
                    // Export files are already written; rollback is only for temporary Revit views.
                }
            }
        }

        private static List<PreparedAssemblyView> PrepareAssemblyViews(Document doc, List<AssemblyExportItem> exportItems)
        {
            var prepared = new List<PreparedAssemblyView>();

            using (Transaction transaction = new Transaction(doc, "Tijdelijke IFC views maken"))
            {
                transaction.Start();

                View3D baseView = FindBase3DView(doc) ?? CreateBase3DView(doc);
                if (baseView == null)
                    throw new InvalidOperationException("Geen bruikbare 3D view gevonden of aangemaakt.");

                foreach (AssemblyExportItem item in exportItems)
                {
                    ElementId duplicatedId = baseView.Duplicate(ViewDuplicateOption.Duplicate);
                    View3D view = doc.GetElement(duplicatedId) as View3D;
                    if (view == null)
                        continue;

                    view.Name = BuildTempViewName(doc, item);
                    ConfigureViewForAssembly(doc, view, item.Assembly);
                    prepared.Add(new PreparedAssemblyView(item, view));
                }

                transaction.Commit();
            }

            return prepared;
        }

        private static void ConfigureViewForAssembly(Document doc, View3D view, AssemblyInstance assembly)
        {
            BoundingBoxXYZ sectionBox = BuildSectionBox(doc, assembly);
            if (sectionBox != null)
            {
                view.IsSectionBoxActive = true;
                view.SetSectionBox(sectionBox);
            }

            doc.Regenerate();

            var visibleIds = new FilteredElementCollector(doc, view.Id)
                .WhereElementIsNotElementType()
                .ToElements();

            var memberIds = new HashSet<ElementId>(assembly.GetMemberIds(), new ElementIdComparer())
            {
                assembly.Id
            };

            var hideIds = visibleIds
                .Where(element => element != null)
                .Where(element => !memberIds.Contains(element.Id))
                .Where(element => CanHide(element, view))
                .Select(element => element.Id)
                .Distinct(new ElementIdComparer())
                .ToList();

            HideElementsInChunks(view, hideIds);
        }

        private static List<AssemblyExportItem> ResolveExportItems(Document doc)
        {
            var assemblyLookup = GetAssemblyLookup(doc);
            var sheets = GetSheets(doc);
            var designPhaseSheets = sheets
                .Where(sheet => !StartsWithDigit(sheet.SheetNumber))
                .Where(sheet => GetStringParameter(sheet, DesignPhaseParameter)?.StartsWith("15.", StringComparison.OrdinalIgnoreCase) == true)
                .ToList();

            var candidateSheets = designPhaseSheets.Count > 0
                ? designPhaseSheets
                : sheets.Where(sheet => !StartsWithDigit(sheet.SheetNumber)).ToList();

            var items = new List<AssemblyExportItem>();
            var usedAssemblies = new HashSet<ElementId>(new ElementIdComparer());

            foreach (ViewSheet sheet in candidateSheets)
            {
                string sheetNumber = sheet.SheetNumber?.Trim();
                if (string.IsNullOrWhiteSpace(sheetNumber))
                    continue;

                if (!assemblyLookup.TryGetValue(sheetNumber, out AssemblyInstance assembly))
                    continue;

                if (!usedAssemblies.Add(assembly.Id))
                    continue;

                items.Add(new AssemblyExportItem(assembly, sheet, sheetNumber));
            }

            if (items.Count > 0)
                return items;

            IEnumerable<AssemblyInstance> fallbackAssemblies = GetAssembliesInActiveView(doc);
            if (!fallbackAssemblies.Any())
                fallbackAssemblies = assemblyLookup.Values;

            return fallbackAssemblies
                .Where(assembly => assembly != null)
                .GroupBy(assembly => assembly.Id.Value)
                .Select(group => group.First())
                .Select(assembly =>
                {
                    string code = GetAssemblyCode(assembly);
                    return new AssemblyExportItem(assembly, FindSheetForAssemblyCode(sheets, code), code);
                })
                .Where(item => !string.IsNullOrWhiteSpace(item.AssemblyCode))
                .OrderBy(item => item.AssemblyCode, StringComparer.OrdinalIgnoreCase)
                .ToList();
        }

        private static Dictionary<string, AssemblyInstance> GetAssemblyLookup(Document doc)
        {
            var lookup = new Dictionary<string, AssemblyInstance>(StringComparer.OrdinalIgnoreCase);
            var assemblies = new FilteredElementCollector(doc)
                .OfClass(typeof(AssemblyInstance))
                .WhereElementIsNotElementType()
                .Cast<AssemblyInstance>();

            foreach (AssemblyInstance assembly in assemblies)
            {
                AddLookup(lookup, GetStringParameter(assembly, AssemblyCodeParameter), assembly);
                AddLookup(lookup, GetStringParameter(assembly, CbAssemblyCodeParameter), assembly);
                AddLookup(lookup, assembly.Name, assembly);
            }

            return lookup;
        }

        private static List<ViewSheet> GetSheets(Document doc)
        {
            return new FilteredElementCollector(doc)
                .OfClass(typeof(ViewSheet))
                .Cast<ViewSheet>()
                .Where(sheet => !sheet.IsPlaceholder)
                .OrderBy(sheet => sheet.SheetNumber, StringComparer.OrdinalIgnoreCase)
                .ToList();
        }

        private static IEnumerable<AssemblyInstance> GetAssembliesInActiveView(Document doc)
        {
            if (doc.ActiveView == null)
                return Enumerable.Empty<AssemblyInstance>();

            try
            {
                return new FilteredElementCollector(doc, doc.ActiveView.Id)
                    .OfClass(typeof(AssemblyInstance))
                    .WhereElementIsNotElementType()
                    .Cast<AssemblyInstance>()
                    .ToList();
            }
            catch
            {
                return Enumerable.Empty<AssemblyInstance>();
            }
        }

        private static ViewSheet FindSheetForAssemblyCode(IEnumerable<ViewSheet> sheets, string assemblyCode)
        {
            if (string.IsNullOrWhiteSpace(assemblyCode))
                return null;

            return sheets.FirstOrDefault(sheet =>
                string.Equals(sheet.SheetNumber?.Trim(), assemblyCode, StringComparison.OrdinalIgnoreCase) ||
                (!string.IsNullOrWhiteSpace(sheet.Name) &&
                 sheet.Name.IndexOf(assemblyCode, StringComparison.OrdinalIgnoreCase) >= 0));
        }

        private static View3D FindBase3DView(Document doc)
        {
            var views = new FilteredElementCollector(doc)
                .OfClass(typeof(View3D))
                .Cast<View3D>()
                .Where(view => !view.IsTemplate)
                .Where(view => !view.IsPerspective)
                .ToList();

            return views.FirstOrDefault(view =>
                       string.Equals(view.Name, PreferredBase3DViewName, StringComparison.OrdinalIgnoreCase)) ??
                   views.FirstOrDefault();
        }

        private static View3D CreateBase3DView(Document doc)
        {
            ViewFamilyType type = new FilteredElementCollector(doc)
                .OfClass(typeof(ViewFamilyType))
                .Cast<ViewFamilyType>()
                .FirstOrDefault(viewType => viewType.ViewFamily == ViewFamily.ThreeDimensional);

            return type == null ? null : View3D.CreateIsometric(doc, type.Id);
        }

        private static BoundingBoxXYZ BuildSectionBox(Document doc, AssemblyInstance assembly)
        {
            var boxes = assembly.GetMemberIds()
                .Select(id => doc.GetElement(id))
                .Where(element => element != null)
                .Select(element => element.get_BoundingBox(null))
                .Where(box => box != null)
                .ToList();

            if (boxes.Count == 0)
                return null;

            double minX = boxes.Min(box => box.Min.X);
            double minY = boxes.Min(box => box.Min.Y);
            double minZ = boxes.Min(box => box.Min.Z);
            double maxX = boxes.Max(box => box.Max.X);
            double maxY = boxes.Max(box => box.Max.Y);
            double maxZ = boxes.Max(box => box.Max.Z);
            const double offsetFeet = 1.0;

            return new BoundingBoxXYZ
            {
                Min = new XYZ(minX - offsetFeet, minY - offsetFeet, minZ - offsetFeet),
                Max = new XYZ(maxX + offsetFeet, maxY + offsetFeet, maxZ + offsetFeet)
            };
        }

        private static void ExportView(Document doc, View3D view, string exportFolder, string fileName)
        {
            IFCExportOptions options = BuildExportOptions(view);
            bool exported = doc.Export(exportFolder, fileName, options);
            if (!exported)
                throw new InvalidOperationException($"IFC export mislukt voor {fileName}.");
        }

        private static IFCExportOptions BuildExportOptions(View3D view)
        {
            var options = new IFCExportOptions
            {
                FileVersion = MapIfcVersion(SettingsManager.Instance.IfcVersion),
                FilterViewId = view.Id,
                SpaceBoundaryLevel = 0,
                WallAndColumnSplitting = false,
                ExportBaseQuantities = false
            };

            options.AddOption("ConfigName", ExportConfigName);
            options.AddOption("UseActiveViewGeometry", "true");
            options.AddOption("VisibleElementsOfCurrentView", "true");
            options.AddOption("ExportRoomsInView", "false");
            options.AddOption("Export2DElements", "false");
            options.AddOption("ExportLinkedFiles", "DontExport");
            options.AddOption("IncludeSteelElements", "false");
            options.AddOption("TessellationLevelOfDetail", "0.2");

            string propertySetFile = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "Autodesk",
                "Revit",
                "Addins",
                "IFCExport",
                "PropertySet.txt");

            if (File.Exists(propertySetFile))
            {
                options.AddOption("ExportUserDefinedPsets", "true");
                options.AddOption("ExportUserDefinedPsetsFileName", propertySetFile);
            }
            else
            {
                options.AddOption("ExportUserDefinedPsets", "false");
            }

            return options;
        }

        private static IFCVersion MapIfcVersion(string value)
        {
            if (string.Equals(value, "IFC2x3", StringComparison.OrdinalIgnoreCase))
                return IFCVersion.IFC2x3;

            return IFCVersion.IFC4;
        }

        private static string ResolveExportFolder(string preferredFolder, Document doc)
        {
            if (!string.IsNullOrWhiteSpace(preferredFolder))
                return preferredFolder.Trim();

            string downloads = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                "Downloads");
            if (Directory.Exists(downloads))
                return downloads;

            if (!string.IsNullOrWhiteSpace(doc.PathName))
                return Path.GetDirectoryName(doc.PathName);

            return Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
        }

        private static string FindExportedIfc(string folder, string fileName, DateTime startedAt)
        {
            string directPath = Path.Combine(folder, fileName + ".ifc");
            if (File.Exists(directPath))
                return directPath;

            return Directory.GetFiles(folder, "*.ifc", SearchOption.TopDirectoryOnly)
                .Where(path => File.GetLastWriteTime(path) >= startedAt)
                .Where(path => string.Equals(Path.GetFileNameWithoutExtension(path), fileName, StringComparison.OrdinalIgnoreCase))
                .OrderByDescending(File.GetLastWriteTime)
                .FirstOrDefault();
        }

        private static void HideElementsInChunks(View view, List<ElementId> ids)
        {
            const int chunkSize = 1000;
            for (int i = 0; i < ids.Count; i += chunkSize)
            {
                var chunk = ids.Skip(i).Take(chunkSize).ToList();
                if (chunk.Count == 0)
                    continue;

                try
                {
                    view.HideElements(chunk);
                }
                catch
                {
                    foreach (ElementId id in chunk)
                    {
                        try { view.HideElements(new[] { id }); }
                        catch { }
                    }
                }
            }
        }

        private static bool CanHide(Element element, View view)
        {
            try { return element.CanBeHidden(view); }
            catch { return false; }
        }

        private static void AddLookup(Dictionary<string, AssemblyInstance> lookup, string code, AssemblyInstance assembly)
        {
            code = code?.Trim();
            if (string.IsNullOrWhiteSpace(code) || lookup.ContainsKey(code))
                return;

            lookup.Add(code, assembly);
        }

        private static string GetAssemblyCode(AssemblyInstance assembly)
        {
            return GetStringParameter(assembly, AssemblyCodeParameter)
                   ?? GetStringParameter(assembly, CbAssemblyCodeParameter)
                   ?? assembly.Name;
        }

        private static string GetStringParameter(Element element, string name)
        {
            Parameter parameter = element?.LookupParameter(name);
            if (parameter == null || !parameter.HasValue)
                return null;

            string value = parameter.StorageType == StorageType.String
                ? parameter.AsString()
                : parameter.AsValueString();

            return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
        }

        private static bool StartsWithDigit(string value)
        {
            return !string.IsNullOrWhiteSpace(value) && char.IsDigit(value.Trim()[0]);
        }

        private static string BuildTempViewName(Document doc, AssemblyExportItem item)
        {
            string baseName = MakeSafeViewName($"VH IFC Export - {item.AssemblyCode}");
            if (baseName.Length > 90)
                baseName = baseName.Substring(0, 90).Trim();

            var existingNames = new HashSet<string>(
                new FilteredElementCollector(doc)
                    .OfClass(typeof(View))
                    .Cast<View>()
                    .Select(view => view.Name),
                StringComparer.OrdinalIgnoreCase);

            string candidate = baseName;
            int index = 1;
            while (existingNames.Contains(candidate))
            {
                candidate = $"{baseName} ({index})";
                index++;
            }

            return candidate;
        }

        private static string MakeSafeFileName(string name)
        {
            string safeName = MakeSafeToken(name);
            return string.IsNullOrWhiteSpace(safeName) ? "assembly" : safeName;
        }

        private static string MakeSafeViewName(string name)
        {
            return MakeSafeToken(name);
        }

        private static string MakeSafeToken(string name)
        {
            if (string.IsNullOrWhiteSpace(name))
                return null;

            var invalidChars = new HashSet<char>(Path.GetInvalidFileNameChars())
            {
                '{', '}', '[', ']', '<', '>', '|', ';'
            };

            return new string(name.Trim().Select(ch => invalidChars.Contains(ch) ? '_' : ch).ToArray()).Trim();
        }

        private static VhAssemblyIfcExportResult Failed(string message, string exportFolder = null)
        {
            return new VhAssemblyIfcExportResult
            {
                Status = ResultStatus.Failed,
                Message = message,
                ExportFolder = exportFolder
            };
        }

        private class AssemblyExportItem
        {
            public AssemblyExportItem(AssemblyInstance assembly, ViewSheet sheet, string assemblyCode)
            {
                Assembly = assembly;
                Sheet = sheet;
                AssemblyCode = assemblyCode;
            }

            public AssemblyInstance Assembly { get; }
            public ViewSheet Sheet { get; }
            public string AssemblyCode { get; }
        }

        private class PreparedAssemblyView
        {
            public PreparedAssemblyView(AssemblyExportItem item, View3D view)
            {
                Item = item;
                View = view;
            }

            public AssemblyExportItem Item { get; }
            public View3D View { get; }
        }

        private class ElementIdComparer : IEqualityComparer<ElementId>
        {
            public bool Equals(ElementId x, ElementId y)
            {
                if (ReferenceEquals(x, y)) return true;
                if (x is null || y is null) return false;
                return x.Value == y.Value;
            }

            public int GetHashCode(ElementId obj)
            {
                return obj?.Value.GetHashCode() ?? 0;
            }
        }
    }
}
