using Autodesk.Revit.DB;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using RevitDb = Autodesk.Revit.DB;


namespace IFCExportSingleAssembly.Classes
{
    public static class GetAssemblies
    {
        public static IEnumerable<AssemblyInstance> GetAllAssemliesInCurrentView(RevitDb.Document doc)
        {
            if (doc == null || doc.ActiveView == null)
                return Enumerable.Empty<AssemblyInstance>();

            return new FilteredElementCollector(doc, doc.ActiveView.Id)
                .OfClass(typeof(AssemblyInstance))
                .WhereElementIsNotElementType()
                .Cast<AssemblyInstance>();
        }

        public static IEnumerable<AssemblyInstance> GetAllAssembliesInView(View view)
        {
            IEnumerable<AssemblyInstance> AllAssembliesInView;

            // if no assemblies are open in the current view -> an error will occur
            try
            {
                AllAssembliesInView = new FilteredElementCollector(view.Document, view.Id)
                .OfClass(typeof(AssemblyInstance))
                .WhereElementIsNotElementType()
                .ToElements()
                .Cast<AssemblyInstance>();
            }
            catch
            {
                AllAssembliesInView = null;
            }

            return AllAssembliesInView;
        }

        public static Dictionary<ViewSheet, AssemblyInstance> GetAssembliesBySheets(
            Document doc,
            IList<ViewSheet> sheets)
        {
            var result = new Dictionary<ViewSheet, AssemblyInstance>();

            if (doc == null || sheets == null || sheets.Count == 0)
                return result;

            var assemblyLookup = GetAssemblyLookupByAssemblyCode(doc);

            foreach (var sheet in sheets)
            {
                if (sheet == null || string.IsNullOrWhiteSpace(sheet.SheetNumber))
                    continue;

                if (assemblyLookup.TryGetValue(sheet.SheetNumber, out var assembly))
                {
                    result.Add(sheet, assembly);
                }
                // else: sheet zonder assembly → bewust negeren
            }

            return result;
        }

        public static Dictionary<string, AssemblyInstance> GetAssemblyLookupByAssemblyCode(
            Document doc)
        {
            return new FilteredElementCollector(doc)
                .OfClass(typeof(AssemblyInstance))
                .Cast<AssemblyInstance>()
                .Where(a =>
                {
                    var p = a.LookupParameter("VH Assembly Code");
                    return p != null
                        && p.HasValue
                        && !string.IsNullOrWhiteSpace(p.AsString());
                })
                .GroupBy(
                    a => a.LookupParameter("VH Assembly Code").AsString(),
                    System.StringComparer.OrdinalIgnoreCase)
                // mocht er ooit meer dan één zijn → eerste nemen
                .ToDictionary(
                    g => g.Key,
                    g => g.First(),
                    System.StringComparer.OrdinalIgnoreCase);
        }
    }
}
