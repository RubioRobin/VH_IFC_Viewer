using System;
using System.Collections.Generic;
using System.Windows;
using System.Diagnostics;

namespace VH_IFC_QR
{
    public partial class ResultWindow : Window
    {
        public ResultWindow(List<string> results)
        {
            InitializeComponent();
            itemsResults.ItemsSource = results;
        }

        private void BtnClose_Click(object sender, RoutedEventArgs e)
        {
            this.Close();
        }
    }
}
