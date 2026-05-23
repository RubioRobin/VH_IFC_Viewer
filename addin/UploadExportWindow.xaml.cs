using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.Versioning;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using Autodesk.Revit.DB;
using Forms = System.Windows.Forms;

namespace VH_IFC_QR
{
    public class LocalIfcUploadItem
    {
        public bool IsSelected { get; set; } = true;
        public string FilePath { get; set; }
        public string FileName => Path.GetFileName(FilePath);
        public string AssemblyCode { get; set; }
        public ViewSheet SelectedSheet { get; set; }
        public List<ViewSheet> AllSheets { get; set; }
    }

    public partial class UploadExportWindow : Window
    {
        public ProjectInfo SelectedProject { get; private set; }
        public List<LocalIfcUploadItem> Items { get; private set; } = new List<LocalIfcUploadItem>();
        public List<LocalIfcUploadItem> ValidItems { get; private set; } = new List<LocalIfcUploadItem>();
        public event Action OnLogout;

        private readonly List<ProjectInfo> _projects;
        private readonly List<ViewSheet> _sheets;
        private readonly string _defaultProjectId;
        private readonly string _initialFolder;

        public UploadExportWindow(List<ProjectInfo> projects, List<ViewSheet> sheets, string username, string defaultProjectId = null, string initialFolder = null)
        {
            InitializeComponent();
            RevitWindowHelper.KeepOnTop(this);

            _projects = projects;
            _sheets = sheets;
            _defaultProjectId = defaultProjectId;
            _initialFolder = initialFolder;

            comboProjects.ItemsSource = _projects;
            if (!string.IsNullOrEmpty(defaultProjectId))
            {
                var defaultProject = _projects.FirstOrDefault(p => p.id == defaultProjectId);
                if (defaultProject != null) comboProjects.SelectedItem = defaultProject;
            }

            if (comboProjects.SelectedItem == null && _projects.Count > 0) comboProjects.SelectedIndex = 0;
            txtLoggedInAs.Text = username;

            LoadSettings();
            DataContext = this;
        }

        private void LoadSettings()
        {
            if (string.IsNullOrEmpty(_defaultProjectId) && !string.IsNullOrEmpty(SettingsManager.Instance.LastProjectId))
            {
                var project = _projects.FirstOrDefault(p => p.id == SettingsManager.Instance.LastProjectId);
                if (project != null) comboProjects.SelectedItem = project;
            }

            string folder = !string.IsNullOrWhiteSpace(_initialFolder)
                ? _initialFolder
                : SettingsManager.Instance.LastExportFolder;

            if (!string.IsNullOrEmpty(folder) &&
                Directory.Exists(folder))
            {
                LoadFolder(folder);
            }
        }

        private void Header_MouseDown(object sender, MouseButtonEventArgs e)
        {
            if (e.ChangedButton == MouseButton.Left)
                DragMove();
        }

        [SupportedOSPlatform("windows")]
        private void BtnBrowse_Click(object sender, RoutedEventArgs e)
        {
            using (var dialog = new Forms.FolderBrowserDialog())
            {
                dialog.Description = "Kies de map met geexporteerde IFC-bestanden";
                dialog.ShowNewFolderButton = false;

                if (!string.IsNullOrEmpty(txtFolderPath.Text) && Directory.Exists(txtFolderPath.Text))
                    dialog.SelectedPath = txtFolderPath.Text;

                if (RevitWindowHelper.ShowDialog(dialog, this) == Forms.DialogResult.OK)
                    LoadFolder(dialog.SelectedPath);
            }
        }

        private void LoadFolder(string folderPath)
        {
            txtFolderPath.Text = folderPath;

            Items = Directory.GetFiles(folderPath, "*.ifc", SearchOption.TopDirectoryOnly)
                .OrderBy(Path.GetFileName, StringComparer.OrdinalIgnoreCase)
                .Select(path =>
                {
                    string assemblyCode = AssemblyUploadNaming.ExtractAssemblyCode(path);
                    return new LocalIfcUploadItem
                    {
                        FilePath = path,
                        AssemblyCode = assemblyCode,
                        AllSheets = _sheets,
                        SelectedSheet = FindSheetForAssemblyCode(assemblyCode)
                    };
                })
                .ToList();

            gridFiles.ItemsSource = Items;

            int matchedSheets = Items.Count(i => i.SelectedSheet != null);
            lblStatus.Text = Items.Count == 0
                ? "Geen IFC-bestanden gevonden in deze map."
                : $"{Items.Count} IFC-bestanden gevonden, {matchedSheets} automatisch aan sheets gekoppeld.";

            UpdateSummary();
        }

        private ViewSheet FindSheetForAssemblyCode(string assemblyCode)
        {
            if (string.IsNullOrWhiteSpace(assemblyCode)) return null;

            return _sheets.FirstOrDefault(sheet =>
                ContainsIgnoreCase(sheet.SheetNumber, assemblyCode) ||
                ContainsIgnoreCase(sheet.Name, assemblyCode));
        }

        private static bool ContainsIgnoreCase(string value, string search)
        {
            return !string.IsNullOrEmpty(value) &&
                   value.IndexOf(search, StringComparison.OrdinalIgnoreCase) >= 0;
        }

        private void HeaderCheckBox_Click(object sender, RoutedEventArgs e)
        {
            bool selected = ((CheckBox)sender).IsChecked == true;
            foreach (var item in Items)
                item.IsSelected = selected;

            gridFiles.Items.Refresh();
            UpdateSummary();
        }

        private void RowCheckBox_Click(object sender, RoutedEventArgs e)
        {
            UpdateSummary();
        }

        private void UpdateSummary()
        {
            int selected = Items.Count(i => i.IsSelected);
            int missingSheet = Items.Count(i => i.IsSelected && i.SelectedSheet == null);

            if (Items.Count == 0)
                lblSelectionSummary.Text = "Geen IFC-bestanden geladen";
            else if (selected == 0)
                lblSelectionSummary.Text = "Niets geselecteerd";
            else if (missingSheet > 0)
                lblSelectionSummary.Text = $"{selected} bestanden geselecteerd, {missingSheet} zonder sheet";
            else
                lblSelectionSummary.Text = $"{selected} bestanden geselecteerd";

            btnUpload.Content = selected > 0 ? $"Uploaden ({selected})" : "Uploaden";
            btnUpload.IsEnabled = selected > 0;
        }

        private void BtnUpload_Click(object sender, RoutedEventArgs e)
        {
            SelectedProject = comboProjects.SelectedItem as ProjectInfo;
            if (SelectedProject == null)
            {
                RevitWindowHelper.ShowMessage(this, "Selecteer een project.", "Project ontbreekt", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            ValidItems = Items.Where(i => i.IsSelected).ToList();
            if (ValidItems.Count == 0) return;

            var missingSheet = ValidItems.FirstOrDefault(i => i.SelectedSheet == null);
            if (missingSheet != null)
            {
                var result = RevitWindowHelper.ShowMessage(
                    this,
                    $"'{missingSheet.FileName}' heeft geen sheet toegewezen.\n\nDoorgaan zonder QR-plaatsing voor items zonder sheet?",
                    "Sheets ontbreken",
                    MessageBoxButton.YesNo,
                    MessageBoxImage.Question);

                if (result == MessageBoxResult.No) return;
            }

            SettingsManager.Instance.LastProjectId = SelectedProject.id;
            SettingsManager.Instance.LastExportFolder = txtFolderPath.Text;
            SettingsManager.Save();

            DialogResult = true;
            Close();
        }

        private void BtnCancel_Click(object sender, RoutedEventArgs e)
        {
            DialogResult = false;
            Close();
        }

        private void Logout_Click(object sender, MouseButtonEventArgs e)
        {
            OnLogout?.Invoke();
            DialogResult = false;
            Close();
        }
    }
}
