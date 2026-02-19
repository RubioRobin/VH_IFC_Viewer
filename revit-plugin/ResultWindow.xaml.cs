using System;
using System.Collections.Generic;
using System.Windows;
using System.Diagnostics;

namespace VH_IFC_QR
{
    public partial class ResultWindow : Window
    {
        private string _projectUrl;

        public ResultWindow(List<string> results, string projectId)
        {
            InitializeComponent();
            itemsResults.ItemsSource = results;
            
            // Fixed Admin URL as requested
            _projectUrl = "https://vh-ifc-viewer.vercel.app/admin.html#/projects"; 
        }

        private void BtnClose_Click(object sender, RoutedEventArgs e)
        {
            this.Close();
        }

        private void BtnOpenProject_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = _projectUrl,
                    UseShellExecute = true
                });
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Kon browser niet openen: {ex.Message}");
            }
            this.Close();
        }
    }
}
