using System;
using System.Windows;
using System.Windows.Controls;
using System.Linq;

namespace VH_IFC_QR
{
    public partial class IfcSettingsWindow : Window
    {
        public IfcSettingsWindow()
        {
            InitializeComponent();
            LoadSettingsToUI();
        }

        private void Window_MouseDown(object sender, System.Windows.Input.MouseButtonEventArgs e)
        {
            if (e.ChangedButton == System.Windows.Input.MouseButton.Left)
                this.DragMove();
        }

        private void LoadSettingsToUI()
        {
            var settings = SettingsManager.Instance;
            txtQrSize.Text = settings.QrSizeMm.ToString();
            
            // Location
            foreach (ComboBoxItem item in comboQrLocation.Items)
            {
                if (item.Tag.ToString() == settings.QrLocation)
                {
                    comboQrLocation.SelectedItem = item;
                    break;
                }
            }
            if (comboQrLocation.SelectedItem == null) comboQrLocation.SelectedIndex = 0;

            // Version
            foreach (ComboBoxItem item in comboIfcVersion.Items)
            {
                if (item.Tag.ToString() == settings.IfcVersion)
                {
                    comboIfcVersion.SelectedItem = item;
                    break;
                }
            }
            if (comboIfcVersion.SelectedItem == null) comboIfcVersion.SelectedIndex = 0;

            chkVisibleOnly.IsChecked = settings.ExportOnlyVisible;
        }

        private void BtnSave_Click(object sender, RoutedEventArgs e)
        {
            if (double.TryParse(txtQrSize.Text, out double size))
            {
                SettingsManager.Instance.QrSizeMm = size;
            }
            else
            {
                MessageBox.Show("Voer een geldige getalswaarde in voor de QR grootte.", "Fout", MessageBoxButton.OK, MessageBoxImage.Error);
                return;
            }

            if (comboQrLocation.SelectedItem is ComboBoxItem locationItem)
            {
                SettingsManager.Instance.QrLocation = locationItem.Tag.ToString();
            }

            if (comboIfcVersion.SelectedItem is ComboBoxItem versionItem)
            {
                SettingsManager.Instance.IfcVersion = versionItem.Tag.ToString();
            }

            SettingsManager.Instance.ExportOnlyVisible = chkVisibleOnly.IsChecked == true;

            SettingsManager.Save();
            this.DialogResult = true;
            this.Close();
        }

        private void BtnCancel_Click(object sender, RoutedEventArgs e)
        {
            this.DialogResult = false;
            this.Close();
        }
    }
}
