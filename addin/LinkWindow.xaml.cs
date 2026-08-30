using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using Autodesk.Revit.DB;

namespace VH_IFC_QR
{
    public class AssemblyFileMatch
    {
        public bool IsSelected { get; set; } = false;
        public string AssemblyCode { get; set; }
        public bool IsMatched { get; set; } = false;
        public string MatchedFileName { get; set; } = "— Geen match —";
        public string MatchedFileId { get; set; }
        public ViewSheet SelectedSheet { get; set; }
        public List<ViewSheet> AllSheets { get; set; }
    }

    public partial class LinkWindow : Window
    {
        public ProjectInfo SelectedProject { get; private set; }
        public List<AssemblyFileMatch> Matches { get; private set; } = new List<AssemblyFileMatch>();
        public List<AssemblyFileMatch> ValidMatches { get; private set; } = new List<AssemblyFileMatch>();
        public event Action OnLogout;

        private List<ProjectInfo> _projects;
        private List<ViewSheet> _sheets;
        private PluginClient _client;

        public LinkWindow(List<ProjectInfo> projects, List<ViewSheet> sheets, PluginClient client, string username)
        {
            InitializeComponent();
            RevitWindowHelper.KeepOnTop(this);
            _projects = projects;
            _sheets = sheets;
            _client = client;

            comboProjects.ItemsSource = _projects;
            if (_projects.Count > 0) comboProjects.SelectedIndex = 0;
            txtLoggedInAs.Text = username;

            this.DataContext = this;
            LoadSettings();
        }

        private void Header_MouseDown(object sender, MouseButtonEventArgs e)
        {
            if (e.ChangedButton != MouseButton.Left || e.LeftButton != MouseButtonState.Pressed)
                return;

            DragMove();
            e.Handled = true;
        }

        private void LoadSettings()
        {
            if (!string.IsNullOrEmpty(SettingsManager.Instance.LastProjectId))
            {
                var proj = _projects.FirstOrDefault(p => p.id == SettingsManager.Instance.LastProjectId);
                if (proj != null) comboProjects.SelectedItem = proj;
            }
        }

        private async void ComboProjects_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            var project = comboProjects.SelectedItem as ProjectInfo;
            if (project == null) return;

            lblStatus.Text = "Bestanden ophalen...";
            Matches.Clear();
            gridMatches.ItemsSource = null;

            try
            {
                // Haal bestanden op van de server
                var files = await _client.GetProjectFilesAsync(project.id);
                if (files == null || files.Count == 0)
                {
                    lblStatus.Text = "⚠ Geen bestanden gevonden in dit project.";
                    UpdateSummary();
                    return;
                }

                // Maak een dictionary van assembly code → file
                // Bestandsnaam patroon: "BP2-10B 3D.ifc" → assembly code = "BP2-10B"
                var filesByCode = new Dictionary<string, ProjectFileInfo>(StringComparer.OrdinalIgnoreCase);
                foreach (var f in files)
                {
                    string code = ExtractAssemblyCode(f.filename);
                    if (!string.IsNullOrEmpty(code) && !filesByCode.ContainsKey(code))
                    {
                        filesByCode[code] = f;
                    }
                }

                // Maak matches lijst: elke file is een potentiële match
                foreach (var kvp in filesByCode)
                {
                    var match = new AssemblyFileMatch
                    {
                        AssemblyCode = kvp.Key,
                        IsMatched = true,
                        MatchedFileName = kvp.Value.filename,
                        MatchedFileId = kvp.Value.id,
                        AllSheets = _sheets,
                        IsSelected = true,
                        // Prefer exact sheet numbers; an ambiguous partial match must
                        // be selected explicitly by the user.
                        SelectedSheet = SheetMatcher.FindSheet(_sheets, kvp.Key)
                    };
                    Matches.Add(match);
                }

                // Sorteer: matches eerst, dan ongematchte
                Matches = Matches.OrderByDescending(m => m.IsMatched).ThenBy(m => m.AssemblyCode).ToList();
                gridMatches.ItemsSource = Matches;

                int matchCount = Matches.Count(m => m.IsMatched);
                lblStatus.Text = $"✓ {matchCount} bestanden gevonden, {Matches.Count(m => m.IsMatched && m.SelectedSheet != null)} automatisch aan sheets gekoppeld.";
            }
            catch (Exception ex)
            {
                lblStatus.Text = $"❌ Fout: {ex.Message}";
            }

            UpdateSummary();
        }

        /// <summary>
        /// Extracts the assembly code from a filename.
        /// Pattern: "BP2-10B 3D.ifc" → "BP2-10B"
        /// Removes common suffixes like " 3D", " 2D", and file extension.
        /// </summary>
        public static string ExtractAssemblyCode(string filename)
        {
            if (string.IsNullOrWhiteSpace(filename)) return null;

            // Verwijder extensie
            string name = System.IO.Path.GetFileNameWithoutExtension(filename);

            // Verwijder bekende suffixen (case-insensitive)
            string[] suffixes = { " 3D", " 2D", " 3d", " 2d" };
            foreach (var suffix in suffixes)
            {
                if (name.EndsWith(suffix, StringComparison.OrdinalIgnoreCase))
                {
                    name = name.Substring(0, name.Length - suffix.Length);
                    break;
                }
            }

            return name.Trim();
        }

        private void HeaderCheckBox_Click(object sender, RoutedEventArgs e)
        {
            bool val = ((CheckBox)sender).IsChecked == true;
            foreach (var m in Matches)
            {
                if (m.IsMatched) m.IsSelected = val;
            }
            gridMatches.Items.Refresh();
            UpdateSummary();
        }

        private void RowCheckBox_Click(object sender, RoutedEventArgs e)
        {
            UpdateSummary();
        }

        private void UpdateSummary()
        {
            int selected = Matches.Count(m => m.IsSelected && m.IsMatched);
            int missingSheet = Matches.Count(m => m.IsSelected && m.IsMatched && m.SelectedSheet == null);

            if (selected == 0)
            {
                lblSelectionSummary.Text = "Niets geselecteerd";
            }
            else
            {
                lblSelectionSummary.Text = $"{selected} items geselecteerd voor QR linking";
            }

            btnLink.Content = selected > 0 ? $"Link QR Codes ({selected})" : "Link QR Codes";
            btnLink.IsEnabled = selected > 0;
        }

        private void BtnLink_Click(object sender, RoutedEventArgs e)
        {
            SelectedProject = comboProjects.SelectedItem as ProjectInfo;

            if (SelectedProject == null)
            {
                RevitWindowHelper.ShowMessage(this, "Selecteer een Project.", "Fout", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            ValidMatches = Matches.Where(m => m.IsSelected && m.IsMatched).ToList();
            if (ValidMatches.Count == 0) return;

            var missingSheet = ValidMatches.FirstOrDefault(m => m.SelectedSheet == null);
            if (missingSheet != null)
            {
                var result = RevitWindowHelper.ShowMessage(
                    this,
                    $"Assembly '{missingSheet.AssemblyCode}' heeft geen sheet toegewezen.\n\nWil je doorgaan zonder QR plaatsing op sheets voor items zonder sheet?",
                    "Sheets Ontbreken",
                    MessageBoxButton.YesNo,
                    MessageBoxImage.Question);
                if (result == MessageBoxResult.No) return;
            }

            // Sla project op voor volgende keer
            SettingsManager.Instance.LastProjectId = SelectedProject.id;
            SettingsManager.Save();

            this.DialogResult = true;
            this.Close();
        }

        private void BtnCancel_Click(object sender, RoutedEventArgs e)
        {
            this.DialogResult = false;
            this.Close();
        }

        private void Logout_Click(object sender, MouseButtonEventArgs e)
        {
            OnLogout?.Invoke();
            this.DialogResult = false;
            this.Close();
        }
    }
}
