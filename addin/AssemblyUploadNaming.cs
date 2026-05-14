using System;
using System.IO;

namespace VH_IFC_QR
{
    public static class AssemblyUploadNaming
    {
        public static string ExtractAssemblyCode(string fileName)
        {
            if (string.IsNullOrWhiteSpace(fileName)) return null;

            string name = Path.GetFileNameWithoutExtension(fileName).Trim();
            string[] suffixes =
            {
                " 3D",
                " 2D",
                "_3D",
                "_2D",
                "-3D",
                "-2D"
            };

            foreach (string suffix in suffixes)
            {
                if (name.EndsWith(suffix, StringComparison.OrdinalIgnoreCase))
                {
                    name = name.Substring(0, name.Length - suffix.Length);
                    break;
                }
            }

            return name.Trim();
        }

        public static string BuildModelName(string filePath)
        {
            string name = Path.GetFileNameWithoutExtension(filePath);
            return string.IsNullOrWhiteSpace(name) ? "IFC Export" : name.Trim();
        }

        public static string SafeToken(string value)
        {
            if (string.IsNullOrWhiteSpace(value)) return "ifc";

            foreach (char invalid in Path.GetInvalidFileNameChars())
                value = value.Replace(invalid, '_');

            return value.Replace(' ', '_');
        }
    }
}
