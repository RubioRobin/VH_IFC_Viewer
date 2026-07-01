using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Autodesk.Revit.DB;

namespace IFCExportSingleAssembly.Classes
{
    public static class Assembly3DViewCreator
    {
        //public static Dictionary<AssemblyInstance, View3D> CreateAssembly3DViewsFromBase3D(
        //    Document doc,
        //    IDictionary<ViewSheet, AssemblyInstance> assembliesBySheet,
        //    string base3DViewName = "3D")
        //{
        //    var created = new Dictionary<AssemblyInstance, View3D>();
        //    if (doc == null) return created;
        //    if (assembliesBySheet == null || assembliesBySheet.Count == 0) return created;

        //    // 1) Basis 3D view check
        //    View3D base3D = Find3DViewByName(doc, base3DViewName);
        //    if (base3D == null)
        //        throw new InvalidOperationException($"Basis 3D view '{base3DViewName}' bestaat niet in dit project.");

        //    // Unieke assemblies
        //    var assemblies = assembliesBySheet.Values
        //        .Where(a => a != null)
        //        .Distinct(new ElementIdEqualityComparer<AssemblyInstance>())
        //        .ToList();

        //    if (assemblies.Count == 0) return created;

        //    // 2) Bestaande 3D view namen (snel skippen)
        //    var existing3DNames = new HashSet<string>(
        //        new FilteredElementCollector(doc)
        //            .OfClass(typeof(View3D))
        //            .Cast<View3D>()
        //            .Where(v => !v.IsTemplate)
        //            .Select(v => v.Name),
        //        StringComparer.InvariantCultureIgnoreCase);

        //    // 3) Alle bestaande filters één keer ophalen (lookup op naam)
        //    var filterByName = new FilteredElementCollector(doc)
        //        .OfClass(typeof(ParameterFilterElement))
        //        .Cast<ParameterFilterElement>()
        //        .GroupBy(f => f.Name, StringComparer.InvariantCultureIgnoreCase)
        //        .ToDictionary(g => g.Key, g => g.First(), StringComparer.InvariantCultureIgnoreCase);

        //    using (var t = new Transaction(doc, "Create Assembly 3D Views"))
        //    {
        //        t.Start();

        //        foreach (var assembly in assemblies)
        //        {
        //            string targetViewName = $"{assembly.Name} 3D";

        //            // view bestaat al -> skip
        //            if (existing3DNames.Contains(targetViewName))
        //                continue;

        //            // duplicate basisview
        //            ElementId newViewId = base3D.Duplicate(ViewDuplicateOption.Duplicate);
        //            var newView = doc.GetElement(newViewId) as View3D;
        //            if (newView == null)
        //                continue;

        //            // naam zetten (anders opruimen)
        //            try
        //            {
        //                newView.Name = targetViewName;
        //            }
        //            catch
        //            {
        //                try { doc.Delete(newViewId); } catch { }
        //                continue;
        //            }

        //            existing3DNames.Add(targetViewName);

        //            // === NIEUW: bestaand filter toevoegen + visibility uit ===
        //            // filternaam: "VH Assembly Code = WA004" (dus = assembly.Name)
        //            string filterName = $"VH Assembly Code = {assembly.Name}";
        //            if (filterByName.TryGetValue(filterName, out ParameterFilterElement filter))
        //            {
        //                var filterId = filter.Id;

        //                // alleen toevoegen als hij nog niet op de view zit
        //                var currentFilterIds = newView.GetFilters();
        //                if (!currentFilterIds.Contains(filterId))
        //                    newView.AddFilter(filterId);

        //                // visibility uit
        //                newView.SetFilterVisibility(filterId, false);
        //            }
        //            // else: filter bestaat niet -> niets doen

        //            created[assembly] = newView;
        //        }

        //        t.Commit();
        //    }

        //    return created;
        //}

        public static Dictionary<AssemblyInstance, View3D> CreateAssembly3DViewsFromBase3D(
            Document doc,
            IDictionary<ViewSheet, AssemblyInstance> assembliesBySheet,
            string base3DViewName = "3D")
        {
            var created = new Dictionary<AssemblyInstance, View3D>();
            if (doc == null) return created;
            if (assembliesBySheet == null || assembliesBySheet.Count == 0) return created;

            // 1) Basis 3D view check
            View3D base3D = Find3DViewByName(doc, base3DViewName);
            if (base3D == null)
                throw new InvalidOperationException($"Basis 3D view '{base3DViewName}' bestaat niet in dit project.");

            // Unieke assemblies
            var assemblies = assembliesBySheet.Values
                .Where(a => a != null)
                .Distinct(new ElementIdEqualityComparer<AssemblyInstance>())
                .ToList();

            if (assemblies.Count == 0) return created;

            // 2) Alle bestaande 3D views direct in dictionary zetten
            var existing3DViews = new FilteredElementCollector(doc)
                .OfClass(typeof(View3D))
                .Cast<View3D>()
                .Where(v => !v.IsTemplate)
                .ToDictionary(v => v.Name, v => v, StringComparer.InvariantCultureIgnoreCase);

            // 3) Alle bestaande filters één keer ophalen
            var filterByName = new FilteredElementCollector(doc)
                .OfClass(typeof(ParameterFilterElement))
                .Cast<ParameterFilterElement>()
                .GroupBy(f => f.Name, StringComparer.InvariantCultureIgnoreCase)
                .ToDictionary(g => g.Key, g => g.First(), StringComparer.InvariantCultureIgnoreCase);

            using (var t = new Transaction(doc, "Create Assembly 3D Views"))
            {
                t.Start();

                foreach (var assembly in assemblies)
                {
                    // new view name
                    string targetViewName = $"{assembly.Name}";

                    // =========================
                    // BESTAAT VIEW AL? -> output vullen, NIET aanpassen, next
                    // =========================
                    if (existing3DViews.TryGetValue(targetViewName, out View3D existingView))
                    {
                        created[assembly] = existingView;
                        continue; // niets aanpassen
                    }

                    // =========================
                    // Nieuwe view maken
                    // =========================
                    ElementId newViewId = base3D.Duplicate(ViewDuplicateOption.Duplicate);
                    var newView = doc.GetElement(newViewId) as View3D;
                    if (newView == null)
                        continue;

                    try
                    {
                        newView.Name = targetViewName;
                    }
                    catch
                    {
                        try { doc.Delete(newViewId); } catch { }
                        continue;
                    }

                    existing3DViews[targetViewName] = newView;
                    created[assembly] = newView;

                    // =========================
                    // Alleen bij NIEUWE view: FILTER KEUZE (CB of VH)
                    // =========================
                    string cbValue = GetStringParam(assembly, "CB Assembly Code");

                    bool useCbFilter = !string.IsNullOrWhiteSpace(cbValue) &&
                                       string.Equals(cbValue.Trim(), assembly.Name?.Trim(),
                                           StringComparison.InvariantCultureIgnoreCase);

                    string filterName = useCbFilter
                        ? $"CB Assembly Code = {assembly.Name}"
                        : $"VH Assembly Code = {assembly.Name}";

                    // Filter moet bestaan, anders niets doen
                    if (filterByName.TryGetValue(filterName, out ParameterFilterElement filter))
                    {
                        var filterId = filter.Id;

                        // alleen toevoegen als hij nog niet op de view zit
                        var currentFilterIds = newView.GetFilters();
                        if (!currentFilterIds.Contains(filterId))
                            newView.AddFilter(filterId);

                        // visibility uit
                        newView.SetFilterVisibility(filterId, false);
                    }
                }

                t.Commit();
            }

            return created;
        }

        private static string GetStringParam(Element e, string paramName)
        {
            if (e == null || string.IsNullOrWhiteSpace(paramName)) return null;

            var p = e.LookupParameter(paramName);
            if (p == null) return null;

            // Voor tekstparameters: AsString(), anders fallback AsValueString()
            return p.StorageType == StorageType.String ? p.AsString() : p.AsValueString();
        }

        private static View3D Find3DViewByName(Document doc, string name)
        {
            return new FilteredElementCollector(doc)
                .OfClass(typeof(View3D))
                .Cast<View3D>()
                .FirstOrDefault(v => !v.IsTemplate &&
                                     string.Equals(v.Name, name, StringComparison.InvariantCultureIgnoreCase));
        }

        private class ElementIdEqualityComparer<T> : IEqualityComparer<T> where T : Element
        {
            public bool Equals(T x, T y)
            {
                if (ReferenceEquals(x, y)) return true;
                if (x is null || y is null) return false;
                return x.Id.Value == y.Id.Value;
            }
            public int GetHashCode(T obj) => obj?.Id.Value.GetHashCode() ?? 0;
        }
    }
}
