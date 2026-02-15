using System;
using System;
using System.IO;
using System.Collections.Generic;

namespace VH_IFC_Installer
{
    class Program
    {
        static void Main(string[] args)
        {
            Console.WriteLine("--- VH IFC QR Revit Plugin Installer ---");
            Console.WriteLine("Target Revit Version: 2025");
            Console.WriteLine("");

            try
            {
                // 1. Determine Source Path (where the .exe is running from + "Deployment")
                // Assuming the user runs the exe from the root of the extracted folder or we bundle it.
                // For this implementation, we expect a 'Deployment' folder next to the EXE.
                string exePath = AppDomain.CurrentDomain.BaseDirectory;
                string sourceDeploymentPath = Path.Combine(exePath, "Deployment");

                if (!Directory.Exists(sourceDeploymentPath))
                {
                    // Fallback for development if running from within the project structure
                    sourceDeploymentPath = Path.Combine(exePath, "..", "Deployment");
                }

                if (!Directory.Exists(sourceDeploymentPath))
                {
                    Console.ForegroundColor = ConsoleColor.Red;
                    Console.WriteLine("Error: 'Deployment' folder not found.");
                    Console.WriteLine($"Expected at: {sourceDeploymentPath}");
                    Console.ResetColor();
                    Console.WriteLine("Press any key to exit...");
                    Console.ReadKey();
                    return;
                }

                // 2. Determine Destination Paths
                string appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
                string addinDest = Path.Combine(appData, "Autodesk", "Revit", "Addins", "2025");
                string dllDest = Path.Combine(addinDest, "VH_IFC_QR");

                Console.WriteLine($"Installing to: {addinDest}");

                // 3. Create Directories
                if (!Directory.Exists(addinDest)) Directory.CreateDirectory(addinDest);
                if (!Directory.Exists(dllDest)) Directory.CreateDirectory(dllDest);

                // 4. Copy Files
                Console.WriteLine("1/2 Copying plugin files...");
                string sourceDllDir = Path.Combine(sourceDeploymentPath, "VH_IFC_QR");
                if (Directory.Exists(sourceDllDir))
                {
                    CopyDirectory(sourceDllDir, dllDest, true);
                }
                else
                {
                     throw new DirectoryNotFoundException($"Source plugin folder not found: {sourceDllDir}");
                }

                // 5. Copy and Update .addin manifest
                Console.WriteLine("2/2 Deploying manifest...");
                string sourceAddin = Path.Combine(sourceDeploymentPath, "VH_IFC_QR.addin");
                string destAddin = Path.Combine(addinDest, "VH_IFC_QR.addin");

                if (File.Exists(sourceAddin))
                {
                    string content = File.ReadAllText(sourceAddin);
                    // Update the assembly path to point to the user's AppData
                    string targetDllPath = Path.Combine(dllDest, "VH_IFC_QR.dll");
                    
                    // Regex-like replacement for the Assembly tag
                    string updatedContent = System.Text.RegularExpressions.Regex.Replace(
                        content, 
                        @"<Assembly>.*VH_IFC_QR\.dll<\/Assembly>", 
                        $"<Assembly>{targetDllPath}</Assembly>",
                        System.Text.RegularExpressions.RegexOptions.IgnoreCase
                    );

                    File.WriteAllText(destAddin, updatedContent);
                }
                else
                {
                    throw new FileNotFoundException($"Source manifest not found: {sourceAddin}");
                }

                Console.ForegroundColor = ConsoleColor.Green;
                Console.WriteLine("");
                Console.WriteLine("--- INSTALLATION SUCCESSFUL ---");
                Console.WriteLine("The Revit plugin has been installed.");
                Console.WriteLine("Please (re)start Revit 2025 to use the VH IFC QR tool.");
                Console.ResetColor();
            }
            catch (Exception ex)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("");
                Console.WriteLine("--- INSTALLATION FAILED ---");
                Console.WriteLine($"Error: {ex.Message}");
                Console.ResetColor();
            }

            Console.WriteLine("");
            Console.WriteLine("Press any key to exit...");
            Console.ReadKey();
        }

        static void CopyDirectory(string sourceDir, string destinationDir, bool recursive)
        {
            var dir = new DirectoryInfo(sourceDir);
            if (!dir.Exists) throw new DirectoryNotFoundException($"Source directory not found: {dir.FullName}");

            DirectoryInfo[] dirs = dir.GetDirectories();
            Directory.CreateDirectory(destinationDir);

            foreach (FileInfo file in dir.GetFiles())
            {
                string targetFilePath = Path.Combine(destinationDir, file.Name);
                file.CopyTo(targetFilePath, true);
            }

            if (recursive)
            {
                foreach (DirectoryInfo subDir in dirs)
                {
                    string newDestinationDir = Path.Combine(destinationDir, subDir.Name);
                    CopyDirectory(subDir.FullName, newDestinationDir, true);
                }
            }
        }
    }
}
