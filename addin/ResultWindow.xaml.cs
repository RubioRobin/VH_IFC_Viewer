using System;
using System.Collections.Generic;
using System.Windows;
using System.Diagnostics;

namespace VH_IFC_QR
{
    public partial class ResultWindow : Window
    {
        private readonly string _dashboardUrl;

        public ResultWindow(IEnumerable<string> qrSheetLabels, string dashboardUrl)
        {
            InitializeComponent();
            RevitWindowHelper.KeepOnTop(this);

            ResultSummary summary = ResultSummaryFormatter.ForQrSheets(qrSheetLabels);
            txtSubtitle.Text = summary.Subtitle;
            itemsResults.ItemsSource = summary.SheetLines;

            _dashboardUrl = dashboardUrl;
            btnDashboard.Visibility = string.IsNullOrWhiteSpace(_dashboardUrl)
                ? Visibility.Collapsed
                : Visibility.Visible;
        }

        private void BtnClose_Click(object sender, RoutedEventArgs e)
        {
            this.Close();
        }

        private void BtnDashboard_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = _dashboardUrl,
                    UseShellExecute = true
                });

                this.Close();
            }
            catch (Exception ex)
            {
                NotificationWindow.ShowError($"Dashboard openen mislukt.\n\n{ex.Message}");
            }
        }
    }
}
