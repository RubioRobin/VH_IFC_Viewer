using Autodesk.Revit.DB;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace IFCExportSingleAssembly.Classes
{
    public class GetDesignphases
    {
        public static IList<string> GetUniqueDesignPhasesFromSheets(Document doc)
        {
            if (doc == null) return new List<string>();

            return new FilteredElementCollector(doc)
                .OfClass(typeof(ViewSheet))
                .Cast<ViewSheet>()
                .Where(s => !s.IsPlaceholder)
                .Select(s => s.LookupParameter("VH Designphase"))
                .Where(p => p != null && p.HasValue)
                .Select(p => p.AsString())
                .Where(v => !string.IsNullOrWhiteSpace(v))
                .Where(v => v.StartsWith("15."))
                .Distinct()
                .OrderBy(v => v)
                .ToList();
        }
    }
}
