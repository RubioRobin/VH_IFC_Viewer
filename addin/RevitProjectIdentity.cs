using System;
using Autodesk.Revit.DB;

namespace VH_IFC_QR
{
    public class RevitProjectIdentity
    {
        public string ProjectNumber { get; set; }
        public string ProjectName { get; set; }

        public bool HasValue =>
            !string.IsNullOrWhiteSpace(ProjectNumber) ||
            !string.IsNullOrWhiteSpace(ProjectName);

        public static RevitProjectIdentity FromDocument(Document doc)
        {
            var info = doc?.ProjectInformation;
            if (info == null) return new RevitProjectIdentity();

            return new RevitProjectIdentity
            {
                ProjectNumber = GetParameterValue(info, BuiltInParameter.PROJECT_NUMBER, "Project Number"),
                ProjectName = GetParameterValue(info, BuiltInParameter.PROJECT_NAME, "Project Name")
            };
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
