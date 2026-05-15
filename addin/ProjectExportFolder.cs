using System;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;

namespace VH_IFC_QR
{
    internal static class ProjectExportFolder
    {
        private static readonly Regex ProjectCodePattern = new Regex(@"P\d+[A-Z0-9]*", RegexOptions.IgnoreCase | RegexOptions.Compiled);
        private static readonly Regex ProjectFolderPattern = new Regex(@"^P\d+[A-Z0-9]*\s+-\s+.+", RegexOptions.IgnoreCase | RegexOptions.Compiled);

        public static string BuildDefaultFolder(ProjectInfo project, RevitProjectIdentity identity, string lastExportFolder)
        {
            string baseFolder = ResolveBaseFolder(lastExportFolder);
            string folderName = BuildFolderName(project?.name, project?.code, identity?.ProjectNumber, identity?.ProjectName);

            return string.IsNullOrWhiteSpace(folderName)
                ? baseFolder
                : Path.Combine(baseFolder, folderName);
        }

        private static string BuildFolderName(string projectTitle, string projectCode, string revitNumber, string revitName)
        {
            string code = ExtractProjectCode(projectCode)
                ?? ExtractProjectCode(revitNumber)
                ?? ExtractProjectCode(projectTitle)
                ?? ExtractProjectCode(revitName);

            string name = ExtractProjectName(projectTitle, code)
                ?? ExtractProjectName(revitName, code);

            if (string.IsNullOrWhiteSpace(code))
                return SanitizeFolderName(name);

            if (string.IsNullOrWhiteSpace(name))
                return SanitizeFolderName(code);

            return SanitizeFolderName($"{code.ToUpperInvariant()} - {name}");
        }

        private static string ResolveBaseFolder(string lastExportFolder)
        {
            string fallback = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads");
            if (!Directory.Exists(fallback))
                fallback = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);

            if (string.IsNullOrWhiteSpace(lastExportFolder))
                return fallback;

            string folder = lastExportFolder.Trim().TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
            if (string.IsNullOrWhiteSpace(folder))
                return fallback;

            string folderName = Path.GetFileName(folder);
            if (ProjectFolderPattern.IsMatch(folderName ?? string.Empty))
            {
                DirectoryInfo parent = Directory.GetParent(folder);
                if (parent != null)
                    return parent.FullName;
            }

            return folder;
        }

        private static string ExtractProjectCode(string value)
        {
            if (string.IsNullOrWhiteSpace(value)) return null;
            Match match = ProjectCodePattern.Match(value);
            return match.Success ? match.Value : null;
        }

        private static string ExtractProjectName(string value, string projectCode)
        {
            if (string.IsNullOrWhiteSpace(value)) return null;

            string name = value.Trim();
            if (!string.IsNullOrWhiteSpace(projectCode))
            {
                int index = name.IndexOf(projectCode, StringComparison.OrdinalIgnoreCase);
                if (index >= 0)
                    name = name.Substring(index + projectCode.Length);
            }

            name = name.Trim();
            name = name.Trim('-', '_', ' ', '.', ':');
            name = Regex.Replace(name, @"\s+", " ").Trim();

            return string.IsNullOrWhiteSpace(name) ? null : name;
        }

        private static string SanitizeFolderName(string value)
        {
            if (string.IsNullOrWhiteSpace(value)) return null;

            char[] invalidChars = Path.GetInvalidFileNameChars();
            string sanitized = new string(value.Select(ch => invalidChars.Contains(ch) ? ' ' : ch).ToArray());
            sanitized = Regex.Replace(sanitized, @"\s+", " ").Trim();
            sanitized = sanitized.Trim('.', ' ');

            return string.IsNullOrWhiteSpace(sanitized) ? null : sanitized;
        }
    }
}
