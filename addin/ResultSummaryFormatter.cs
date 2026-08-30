using System;
using System.Collections.Generic;
using System.Linq;

namespace VH_IFC_QR
{
    public class ResultSummary
    {
        public ResultSummary(string subtitle, IReadOnlyList<string> sheetLines)
        {
            Subtitle = subtitle;
            SheetLines = sheetLines ?? Array.Empty<string>();
        }

        public string Subtitle { get; }
        public IReadOnlyList<string> SheetLines { get; }
    }

    public static class ResultSummaryFormatter
    {
        public static ResultSummary ForQrSheets(IEnumerable<string> sheetLabels)
        {
            List<string> lines = (sheetLabels ?? Enumerable.Empty<string>())
                .Select(label => (label ?? string.Empty).Trim())
                .Where(label => !string.IsNullOrWhiteSpace(label))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            if (lines.Count == 0)
            {
                return new ResultSummary(
                    "Er is geen QR-code op een sheet geplaatst.",
                    new[] { "Geen sheets met QR-code." });
            }

            string subtitle = lines.Count == 1
                ? "Deze sheet heeft nu een QR-code."
                : "Deze sheets hebben nu een QR-code.";

            return new ResultSummary(subtitle, lines);
        }

        public static string FormatSheetLabel(string sheetNumber, string sheetName)
        {
            string number = (sheetNumber ?? string.Empty).Trim();
            string name = (sheetName ?? string.Empty).Trim();

            if (string.IsNullOrWhiteSpace(number))
                return string.IsNullOrWhiteSpace(name) ? "Onbekende sheet" : name;

            if (string.IsNullOrWhiteSpace(name) ||
                string.Equals(number, name, StringComparison.OrdinalIgnoreCase))
                return number;

            return $"{number} - {name}";
        }
    }
}
