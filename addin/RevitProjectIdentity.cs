using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using Autodesk.Revit.DB;

namespace VH_IFC_QR
{
    public class RevitProjectIdentity
    {
        private static readonly Regex ProjectCodePattern = new Regex(
            @"P\d+[A-Z0-9]*",
            RegexOptions.Compiled | RegexOptions.IgnoreCase);

        private static readonly string[] TitleBlockProjectNumberParameters =
        {
            "Projectnr. VH",
            "Projectnummer VH",
            "Project Number",
            "Projectnr."
        };

        private static readonly string[] TitleBlockProjectNameParameters =
        {
            "Project",
            "Projectnaam",
            "Project Name"
        };

        public string ProjectNumber { get; set; }
        public string ProjectName { get; set; }

        public bool HasValue =>
            !string.IsNullOrWhiteSpace(ProjectNumber) ||
            !string.IsNullOrWhiteSpace(ProjectName);

        public static RevitProjectIdentity FromDocument(Document doc)
        {
            var info = doc?.ProjectInformation;
            var identity = new RevitProjectIdentity();

            if (info != null)
            {
                // Project Information is the canonical project identity. The
                // documented API properties work independently of Revit's UI
                // language; named lookups remain a compatibility fallback.
                identity.ProjectNumber = NormalizeProjectNumber(FirstNonEmpty(
                    info.Number,
                    GetParameterValue(info, BuiltInParameter.PROJECT_NUMBER, "Project Number")));
                identity.ProjectName = FirstNonEmpty(
                    info.Name,
                    GetParameterValue(info, BuiltInParameter.PROJECT_NAME, "Project Name"));
            }

            // Some legacy assembly models only contain the project identity on
            // their title blocks. Use that data solely to fill missing fields.
            RevitProjectIdentity titleBlockIdentity = FromTitleBlocks(doc);
            identity.ProjectNumber = FirstNonEmpty(
                identity.ProjectNumber,
                titleBlockIdentity.ProjectNumber);
            identity.ProjectName = FirstNonEmpty(
                identity.ProjectName,
                titleBlockIdentity.ProjectName);

            // Project Information is often intentionally left empty in assembly
            // models. The document title is a stable, read-only fallback and lets
            // the upload flow create/select a Supabase project without changing
            // the Revit model.
            if (!identity.HasValue)
                identity.ProjectName = GetDocumentTitle(doc);

            return identity;
        }

        private static RevitProjectIdentity FromTitleBlocks(Document doc)
        {
            var identities = new List<RevitProjectIdentity>();
            if (doc == null)
                return new RevitProjectIdentity();

            try
            {
                var titleBlocks = new FilteredElementCollector(doc)
                    .OfCategory(BuiltInCategory.OST_TitleBlocks)
                    .WhereElementIsNotElementType()
                    .OfType<FamilyInstance>();

                foreach (FamilyInstance titleBlock in titleBlocks)
                {
                    Element titleBlockType = doc.GetElement(titleBlock.GetTypeId());
                    string number = NormalizeProjectNumber(FirstNonEmpty(
                        GetNamedParameterValue(titleBlock, TitleBlockProjectNumberParameters),
                        GetNamedParameterValue(titleBlockType, TitleBlockProjectNumberParameters)),
                        extractLegacyTitleBlockCode: true);
                    string name = FirstNonEmpty(
                        GetNamedParameterValue(titleBlock, TitleBlockProjectNameParameters),
                        GetNamedParameterValue(titleBlockType, TitleBlockProjectNameParameters));

                    if (!string.IsNullOrWhiteSpace(number) || !string.IsNullOrWhiteSpace(name))
                    {
                        identities.Add(new RevitProjectIdentity
                        {
                            ProjectNumber = number,
                            ProjectName = name
                        });
                    }
                }
            }
            catch
            {
                // Title blocks are optional. Continue with Project Information or
                // the document-title fallback when they cannot be inspected.
            }

            return new RevitProjectIdentity
            {
                ProjectNumber = MostFrequent(identities.Select(value => value.ProjectNumber)),
                ProjectName = MostFrequent(identities.Select(value => value.ProjectName))
            };
        }

        private static string GetNamedParameterValue(Element element, IEnumerable<string> parameterNames)
        {
            if (element == null || parameterNames == null)
                return null;

            foreach (string parameterName in parameterNames)
            {
                try
                {
                    string value = ReadParameter(element.LookupParameter(parameterName));
                    if (!string.IsNullOrWhiteSpace(value))
                        return value.Trim();
                }
                catch
                {
                    // Try the next candidate name.
                }
            }

            return null;
        }

        private static string NormalizeProjectNumber(
            string value,
            bool extractLegacyTitleBlockCode = false)
        {
            if (string.IsNullOrWhiteSpace(value))
                return null;

            string normalized = value.Trim().ToUpperInvariant();
            if (!extractLegacyTitleBlockCode)
                return normalized;

            Match match = ProjectCodePattern.Match(normalized);
            return match.Success ? match.Value.ToUpperInvariant() : normalized;
        }

        private static string MostFrequent(IEnumerable<string> values)
        {
            return values
                .Where(value => !string.IsNullOrWhiteSpace(value))
                .GroupBy(value => value.Trim(), StringComparer.OrdinalIgnoreCase)
                .OrderByDescending(group => group.Count())
                .ThenBy(group => group.Key, StringComparer.OrdinalIgnoreCase)
                .Select(group => group.First().Trim())
                .FirstOrDefault();
        }

        private static string FirstNonEmpty(params string[] values)
        {
            foreach (string value in values)
            {
                if (!string.IsNullOrWhiteSpace(value))
                    return value.Trim();
            }

            return null;
        }

        private static string GetDocumentTitle(Document doc)
        {
            string title = doc?.Title?.Trim();
            if (!string.IsNullOrWhiteSpace(title))
                return title;

            string path = doc?.PathName;
            return string.IsNullOrWhiteSpace(path)
                ? null
                : Path.GetFileNameWithoutExtension(path)?.Trim();
        }

        private static string GetParameterValue(Element element, BuiltInParameter builtInParameter, string fallbackName)
        {
            try
            {
                var parameter = element.get_Parameter(builtInParameter);
                string value = ReadParameter(parameter);
                if (!string.IsNullOrWhiteSpace(value)) return value.Trim();
            }
            catch { }

            try
            {
                var parameter = element.LookupParameter(fallbackName);
                string value = ReadParameter(parameter);
                if (!string.IsNullOrWhiteSpace(value)) return value.Trim();
            }
            catch { }

            return null;
        }

        private static string ReadParameter(Parameter parameter)
        {
            if (parameter == null || !parameter.HasValue) return null;
            return parameter.StorageType == StorageType.String
                ? parameter.AsString()
                : parameter.AsValueString();
        }
    }
}
