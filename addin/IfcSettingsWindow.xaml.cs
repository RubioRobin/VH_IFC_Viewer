using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Globalization;
using System.Linq;

namespace VH_IFC_QR
{
    public partial class IfcSettingsWindow : Window
    {
        public IfcSettingsWindow()
        {
            InitializeComponent();
            RevitWindowHelper.KeepOnTop(this);
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
            // PasswordBox toont bestaande waarde niet — dit is bewust gedrag voor security
            txtClientSecret.Password = settings.ClientSecret;
            txtQrSize.Text = settings.QrSizeMm.ToString();
            txtQrOffset.Text = settings.QrOffsetMm.ToString();
            
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
            string cleanText = txtQrSize.Text.Replace(",", ".");
            if (double.TryParse(cleanText, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out double size))
            {
                SettingsManager.Instance.QrSizeMm = size;
            }
            else
            {
                RevitWindowHelper.ShowMessage(this, "Voer een geldige getalswaarde in voor de QR grootte (bijv. 25 of 25.5).", "Fout", MessageBoxButton.OK, MessageBoxImage.Error);
                return;
            }

            string cleanOffset = txtQrOffset.Text.Replace(",", ".");
            if (double.TryParse(cleanOffset, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out double offset))
            {
                SettingsManager.Instance.QrOffsetMm = offset;
            }
            else
            {
                RevitWindowHelper.ShowMessage(this, "Voer een geldige getalswaarde in voor de QR afstand (bijv. 10 of 10.5).", "Fout", MessageBoxButton.OK, MessageBoxImage.Error);
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

            string secret = txtClientSecret.Password.Trim();
            if (!string.IsNullOrEmpty(secret))
                SettingsManager.Instance.ClientSecret = secret;

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
