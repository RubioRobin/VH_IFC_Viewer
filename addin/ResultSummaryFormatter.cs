using System;
using System.Collections.Generic;

#nullable enable

namespace VH_IFC_QR
{
    internal sealed class ResultSummary
    {
        public ResultSummary(string subtitle, IReadOnlyList<string> sheetLines)
        {
            Subtitle = subtitle;
            SheetLines = sheetLines;
        }

        public string Subtitle { get; }
        public IReadOnlyList<string> SheetLines { get; }
    }

    internal static class ResultSummaryFormatter
    {
        public static ResultSummary ForQrSheets(IEnumerable<string?>? sheetLabels)
        {
            List<string> uniqueSheetLabels = new List<string>();
            HashSet<string> seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            if (sheetLabels != null)
            {
                foreach (string? sheetLabel in sheetLabels)
                {
                    string? label = sheetLabel?.Trim();
                    if (string.IsNullOrWhiteSpace(label))
                        continue;

                    if (seen.Add(label))
                        uniqueSheetLabels.Add(label);
                }
            }

            if (uniqueSheetLabels.Count == 0)
            {
                return new ResultSummary(
                    "Er is geen QR-code op een sheet geplaatst.",
                    new[] { "Geen sheets met QR-code." });
            }

            string subtitle = uniqueSheetLabels.Count == 1
                ? "Deze sheet heeft nu een QR-code."
                : "Deze sheets hebben nu een QR-code.";

            return new ResultSummary(subtitle, uniqueSheetLabels);
        }

        public static string FormatSheetLabel(string? sheetNumber, string? sheetName)
        {
            string? number = sheetNumber?.Trim();
            string? name = sheetName?.Trim();

            if (string.IsNullOrWhiteSpace(number))
                return string.IsNullOrWhiteSpace(name) ? "Onbekende sheet" : name;

            if (string.IsNullOrWhiteSpace(name) ||
                string.Equals(number, name, StringComparison.OrdinalIgnoreCase))
                return number;

            return $"{number} - {name}";
        }
    }
}
