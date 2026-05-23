using Autodesk.Revit.DB;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace IFCExportSingleAssembly.Classes
{
    public class GetSheets
    {
        public static IList<ViewSheet> GetAllSheets(Document doc)
        {
            if (doc == null) return new List<ViewSheet>();

            return new FilteredElementCollector(doc)
                .OfClass(typeof(ViewSheet))
                .Cast<ViewSheet>()
                .Where(s => !s.IsPlaceholder) // optioneel: geen placeholder sheets
                .ToList();
        }

        public static IList<ViewSheet> GetSheetsByDesignPhases(
            Document doc,
            IList<string> selectedDesignPhases)
        {
            if (doc == null || selectedDesignPhases == null || !selectedDesignPhases.Any())
                return new List<ViewSheet>();

            // Case-insensitive lookup voor phases
            var phaseSet = new HashSet<string>(
                selectedDesignPhases.Where(p => !string.IsNullOrWhiteSpace(p)),
                System.StringComparer.OrdinalIgnoreCase);

            return new FilteredElementCollector(doc)
                .OfClass(typeof(ViewSheet))
                .Cast<ViewSheet>()
                .Where(s => !s.IsPlaceholder)
                // ❗ nieuw: sheetnummer mag niet beginnen met een cijfer
                .Where(s => !string.IsNullOrWhiteSpace(s.SheetNumber)
                            && !char.IsDigit(s.SheetNumber[0]))
                .Where(s =>
                {
                    var p = s.LookupParameter("VH Designphase");
                    if (p == null || !p.HasValue) return false;

                    var value = p.AsString();
                    return !string.IsNullOrWhiteSpace(value) && phaseSet.Contains(value);
                })
                .OrderBy(s => s.SheetNumber)
                .ToList();
        }
    }
}
