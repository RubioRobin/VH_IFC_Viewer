using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using Autodesk.Revit.DB;

namespace VH_IFC_QR
{
    public class ViewSheetMapping
    {
        public bool IsSelected { get; set; } = false;
        public View3D View { get; set; }
        public string ViewName { get { return View.Name; } }
        public ViewSheet SelectedSheet { get; set; }
        public List<ViewSheet> AllSheets { get; set; }
    }

    public partial class SelectionWindow : Window
    {
        public ProjectInfo SelectedProject { get; private set; }
        public string ModelNamePrefix { get { return txtModelName.Text; } }

        public List<ViewSheetMapping> Mappings { get; private set; } = new List<ViewSheetMapping>();
        public List<ViewSheetMapping> ValidMappings { get; private set; } = new List<ViewSheetMapping>();

        public event Action OnLogout;
        private List<ProjectInfo> _projects;

        public SelectionWindow(List<ProjectInfo> projects, List<View3D> views, List<ViewSheet> sheets, string defaultName, string username)
        {
            InitializeComponent();
            _projects = projects;
            comboProjects.ItemsSource = _projects;

            // Default selection
            if (_projects.Count > 0) comboProjects.SelectedIndex = 0;
            txtModelName.Text = defaultName;
            txtLoggedInAs.Text = username; // Simplified based on XAML change

            // Initialize Mappings
            foreach(var v in views)
            {
                Mappings.Add(new ViewSheetMapping 
                { 
                    IsSelected = false, 
                    View = v, 
                    AllSheets = sheets,
                    SelectedSheet = sheets.FirstOrDefault(s => s.Name.Contains(v.Name))
                });
            }

            gridMapping.ItemsSource = Mappings;
            this.DataContext = this;

            LoadSettings();
            UpdateSummary();
        }

        private void Header_MouseDown(object sender, MouseButtonEventArgs e)
        {
            if (e.ChangedButton == MouseButton.Left)
                this.DragMove();
        }

        private void LoadSettings()
        {
            if (!string.IsNullOrEmpty(SettingsManager.Instance.LastPrefix))
                txtModelName.Text = SettingsManager.Instance.LastPrefix;
                
            if (!string.IsNullOrEmpty(SettingsManager.Instance.LastProjectId))
            {
                var proj = _projects.FirstOrDefault(p => p.id == SettingsManager.Instance.LastProjectId);
                if (proj != null) comboProjects.SelectedItem = proj;
            }
        }

        private void SaveSettings()
        {
            var proj = comboProjects.SelectedItem as ProjectInfo;
            if (proj != null)
                SettingsManager.Instance.LastProjectId = proj.id;
            
            SettingsManager.Instance.LastPrefix = txtModelName.Text;
            SettingsManager.Save();
        }

        private void HeaderCheckBox_Click(object sender, RoutedEventArgs e)
        {
            bool val = ((CheckBox)sender).IsChecked == true;
            foreach (var m in Mappings) m.IsSelected = val;
            gridMapping.Items.Refresh();
            UpdateSummary();
        }

        private void RowCheckBox_Click(object sender, RoutedEventArgs e)
        {
            UpdateSummary();
        }

        private void UpdateSummary()
        {
            int count = Mappings.Count(m => m.IsSelected);
            lblSelectionSummary.Text = count == 0 ? "Niets geselecteerd" : $"{count} Views geselecteerd voor export";
            
            btnExport.Content = count > 0 ? $"Uitvoeren ({count})" : "Uitvoeren";
            btnExport.IsEnabled = count > 0;
            
            bool anyMissingSheet = Mappings.Any(m => m.IsSelected && m.SelectedSheet == null);
            if (anyMissingSheet)
            {
                lblSelectionSummary.Text += " (Sheets ontbreken!)";
            }
        }

        private void BtnExport_Click(object sender, RoutedEventArgs e)
        {
            SelectedProject = comboProjects.SelectedItem as ProjectInfo;
            
            if (SelectedProject == null)
            {
                MessageBox.Show("Selecteer een Project.", "Fout", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            if (string.IsNullOrWhiteSpace(txtModelName.Text))
            {
                 MessageBox.Show("Vul een geldig prefix in.", "Fout", MessageBoxButton.OK, MessageBoxImage.Warning);
                 return;
            }

            ValidMappings = Mappings.Where(m => m.IsSelected).ToList();
            if (ValidMappings.Count == 0) return;

            var missingSheet = ValidMappings.FirstOrDefault(m => m.SelectedSheet == null);
            if (missingSheet != null)
            {
                MessageBox.Show($"Selecteer een Sheet voor view: {missingSheet.ViewName}", "Sheet Ontbreekt", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            SaveSettings();

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
