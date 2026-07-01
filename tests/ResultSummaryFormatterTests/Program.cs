using VH_IFC_QR;

static void Equal<T>(T expected, T actual, string name)
{
    if (!EqualityComparer<T>.Default.Equals(expected, actual))
        throw new InvalidOperationException($"{name}: expected '{expected}', got '{actual}'.");
}

static void SequenceEqual(IReadOnlyList<string> expected, IReadOnlyList<string> actual, string name)
{
    if (expected.Count != actual.Count)
        throw new InvalidOperationException($"{name}: expected {expected.Count} items, got {actual.Count}.");

    for (int i = 0; i < expected.Count; i++)
        Equal(expected[i], actual[i], $"{name}[{i}]");
}

ResultSummary summary = ResultSummaryFormatter.ForQrSheets(new[]
{
    "KL13-01",
    "KL13-01",
    "KL14-02 - Gevel noord",
    " ",
    null
});

Equal("Deze sheets hebben nu een QR-code.", summary.Subtitle, "subtitle plural");
SequenceEqual(
    new[] { "KL13-01", "KL14-02 - Gevel noord" },
    summary.SheetLines,
    "sheet lines");

ResultSummary emptySummary = ResultSummaryFormatter.ForQrSheets(Array.Empty<string>());

Equal("Er is geen QR-code op een sheet geplaatst.", emptySummary.Subtitle, "subtitle empty");
SequenceEqual(
    new[] { "Geen sheets met QR-code." },
    emptySummary.SheetLines,
    "empty sheet lines");

Equal(
    "KL13-01 - Plattegrond",
    ResultSummaryFormatter.FormatSheetLabel(" KL13-01 ", " Plattegrond "),
    "sheet label number and name");

Equal(
    "KL13-01",
    ResultSummaryFormatter.FormatSheetLabel("KL13-01", "KL13-01"),
    "sheet label duplicate name");
