using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;

namespace VH_IFC_QR
{
    /// <summary>
    /// Finds the intended sheet for an IFC/assembly code without allowing a
    /// shorter code to steal a more specific sheet (for example BP9-01 vs BP9-01A).
    /// </summary>
    internal static class SheetMatcher
    {
        public static ViewSheet FindSheet(IEnumerable<ViewSheet> sheets, string searchValue)
        {
            if (sheets == null || string.IsNullOrWhiteSpace(searchValue))
                return null;

            List<ViewSheet> candidates = sheets
                .Where(sheet => sheet != null && !sheet.IsPlaceholder)
                .ToList();

            string search = searchValue.Trim();
            string normalizedSearch = Normalize(search);

            // A sheet number is the authoritative identifier and is unique in Revit.
            ViewSheet exactSheetNumber = candidates.FirstOrDefault(sheet =>
                EqualsIgnoreCase(sheet.SheetNumber, search));
            if (exactSheetNumber != null)
                return exactSheetNumber;

            ViewSheet normalizedSheetNumber = FindSingle(candidates.Where(sheet =>
                EqualsIgnoreCase(Normalize(sheet.SheetNumber), normalizedSearch)));
            if (normalizedSheetNumber != null)
                return normalizedSheetNumber;

            ViewSheet exactSheetName = FindSingle(candidates.Where(sheet =>
                EqualsIgnoreCase(sheet.Name, search)));
            if (exactSheetName != null)
                return exactSheetName;

            ViewSheet normalizedSheetName = FindSingle(candidates.Where(sheet =>
                EqualsIgnoreCase(Normalize(sheet.Name), normalizedSearch)));
            if (normalizedSheetName != null)
                return normalizedSheetName;

            // Partial matching is only a convenience fallback. If it produces more
            // than one candidate, leave the field empty for an explicit user choice.
            return FindSingle(candidates.Where(sheet =>
                ContainsMatch(Normalize(sheet.SheetNumber), normalizedSearch) ||
                ContainsMatch(Normalize(sheet.Name), normalizedSearch)));
        }

        private static ViewSheet FindSingle(IEnumerable<ViewSheet> sheets)
        {
            List<ViewSheet> matches = sheets.Take(2).ToList();
            return matches.Count == 1 ? matches[0] : null;
        }

        private static bool EqualsIgnoreCase(string value, string search)
        {
            return !string.IsNullOrWhiteSpace(value) &&
                   !string.IsNullOrWhiteSpace(search) &&
                   string.Equals(value.Trim(), search.Trim(), StringComparison.OrdinalIgnoreCase);
        }

        private static bool ContainsMatch(string value, string search)
        {
            return !string.IsNullOrEmpty(value) &&
                   !string.IsNullOrEmpty(search) &&
                   value.Length >= 3 &&
                   search.Length >= 3 &&
                   (value.IndexOf(search, StringComparison.OrdinalIgnoreCase) >= 0 ||
                    search.IndexOf(value, StringComparison.OrdinalIgnoreCase) >= 0);
        }

        private static string Normalize(string value)
        {
            if (string.IsNullOrWhiteSpace(value))
                return string.Empty;

            return new string(value
                .Where(char.IsLetterOrDigit)
                .Select(char.ToUpperInvariant)
                .ToArray());
        }
    }
}
