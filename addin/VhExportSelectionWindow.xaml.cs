using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.Versioning;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using WinForms = System.Windows.Forms;

namespace VH_IFC_QR
{
    [SupportedOSPlatform("windows")]
    public partial class VhExportSelectionWindow : Window
    {
        private readonly List<CheckBox> _phaseChecks = new List<CheckBox>();

        public VhExportSelectionWindow(IEnumerable<string> designPhases, string defaultFolder)
        {
            InitializeComponent();
            RevitWindowHelper.KeepOnTop(this);

            txtExportFolder.Text = string.IsNullOrWhiteSpace(defaultFolder)
                ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads")
                : defaultFolder;

            foreach (string phase in (designPhases ?? Enumerable.Empty<string>()).OrderBy(value => value, StringComparer.OrdinalIgnoreCase))
            {
                var checkBox = new CheckBox
                {
                    Content = phase,
                    Tag = phase,
                    Margin = new Thickness(0, 0, 0, 8),
                    FontSize = 14
                };

                _phaseChecks.Add(checkBox);
                phaseList.Children.Add(checkBox);
            }

            if (_phaseChecks.Count == 1)
                _phaseChecks[0].IsChecked = true;

            txtInfo.Text = _phaseChecks.Count == 0
                ? "Geen designfase met 15.* gevonden. De add-in kan dan alleen assemblies uit de actieve view exporteren."
                : "Selecteer alleen de fase(s) die je nu wilt uploaden. Zo blijft Revit snel en overzichtelijk.";
        }

        public string ExportFolder => txtExportFolder.Text?.Trim();

        public List<string> SelectedDesignPhases => _phaseChecks
            .Where(check => check.IsChecked == true)
            .Select(check => check.Tag as string)
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .ToList();

        private void BtnBrowse_Click(object sender, RoutedEventArgs e)
        {
            using (var dialog = new WinForms.FolderBrowserDialog())
            {
                dialog.Description = "Kies exportmap";
                dialog.SelectedPath = Directory.Exists(ExportFolder)
                    ? ExportFolder
                    : Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);

                if (RevitWindowHelper.ShowDialog(dialog, this) == WinForms.DialogResult.OK)
                    txtExportFolder.Text = dialog.SelectedPath;
            }
        }

        private void BtnExport_Click(object sender, RoutedEventArgs e)
        {
            if (string.IsNullOrWhiteSpace(ExportFolder))
            {
                RevitWindowHelper.ShowMessage(this, "Kies eerst een exportmap.", "VH Engineering", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            try
            {
                Directory.CreateDirectory(ExportFolder);
            }
            catch (Exception ex)
            {
                RevitWindowHelper.ShowMessage(this, $"De exportmap kan niet worden gebruikt.\n\n{ex.Message}", "VH Engineering", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            if (_phaseChecks.Count > 0 && SelectedDesignPhases.Count == 0)
            {
                RevitWindowHelper.ShowMessage(this, "Selecteer minimaal één designfase.", "VH Engineering", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            DialogResult = true;
            Close();
        }

        private void BtnCancel_Click(object sender, RoutedEventArgs e)
        {
            DialogResult = false;
            Close();
        }

        private void Header_MouseDown(object sender, MouseButtonEventArgs e)
        {
            if (e.ChangedButton == MouseButton.Left)
                DragMove();
        }
    }
}
