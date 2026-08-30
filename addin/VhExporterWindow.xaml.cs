using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.Versioning;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Data;
using System.Windows.Input;
using IFCExportSingleAssemblyUI.ViewModels;

namespace VH_IFC_QR
{
    [SupportedOSPlatform("windows")]
    public partial class VhExporterWindow : Window
    {
        private readonly MainWindowViewModel _mainViewModel;
        private readonly ExportIFCViewModel _exportViewModel;

        public IReadOnlyDictionary<string, int> PhaseIfcCounts { get; }

        public VhExporterWindow(
            MainWindowViewModel mainViewModel,
            ExportIFCViewModel exportViewModel,
            IReadOnlyDictionary<string, int> phaseIfcCounts)
        {
            _mainViewModel = mainViewModel ?? throw new ArgumentNullException(nameof(mainViewModel));
            _exportViewModel = exportViewModel ?? throw new ArgumentNullException(nameof(exportViewModel));
            PhaseIfcCounts = phaseIfcCounts ?? new Dictionary<string, int>();

            InitializeComponent();
            DataContext = _mainViewModel;
            RevitWindowHelper.KeepOnTop(this);
        }

        private void Export_Click(object sender, RoutedEventArgs e)
        {
            if (!_exportViewModel.GetChecked().Any())
            {
                RevitWindowHelper.ShowMessage(
                    this,
                    "Selecteer minimaal één designfase.",
                    "VH Engineering",
                    MessageBoxButton.OK,
                    MessageBoxImage.Warning);
                return;
            }

            string exportPath = _mainViewModel.FileExportPath?.Trim();
            if (string.IsNullOrWhiteSpace(exportPath))
            {
                RevitWindowHelper.ShowMessage(
                    this,
                    "Kies eerst een exportmap.",
                    "VH Engineering",
                    MessageBoxButton.OK,
                    MessageBoxImage.Warning);
                return;
            }

            try
            {
                Directory.CreateDirectory(exportPath);
                _mainViewModel.FileExportPath = exportPath;
            }
            catch (Exception ex)
            {
                RevitWindowHelper.ShowMessage(
                    this,
                    $"De exportmap kan niet worden gebruikt.\n\n{ex.Message}",
                    "VH Engineering",
                    MessageBoxButton.OK,
                    MessageBoxImage.Warning);
                return;
            }

            DialogResult = true;
            Close();
        }

        private void Close_Click(object sender, RoutedEventArgs e)
        {
            DialogResult = false;
            Close();
        }

        private void Window_PreviewKeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Escape)
            {
                DialogResult = false;
                Close();
                e.Handled = true;
                return;
            }

            if (e.Key == Key.Enter)
            {
                Export_Click(sender, new RoutedEventArgs());
                e.Handled = true;
            }
        }

        private void SelectAllCheckBox_Click(object sender, RoutedEventArgs e)
        {
            if (sender is not CheckBox selectAllCheckBox)
                return;

            bool isChecked = selectAllCheckBox.IsChecked == true;
            foreach (var view in _exportViewModel.Views)
                view.IsChecked = isChecked;
        }

        private void Header_MouseDown(object sender, MouseButtonEventArgs e)
        {
            if (e.ChangedButton != MouseButton.Left || e.LeftButton != MouseButtonState.Pressed)
                return;

            DragMove();
            e.Handled = true;
        }
    }

    public sealed class PhaseIfcCountConverter : IMultiValueConverter
    {
        public object Convert(object[] values, Type targetType, object parameter, CultureInfo culture)
        {
            if (values?.Length < 2 || values[0] is not string phaseName ||
                values[1] is not IReadOnlyDictionary<string, int> counts ||
                !counts.TryGetValue(phaseName, out int count))
            {
                return "0 IFC's";
            }

            return count == 1 ? "1 IFC" : $"{count} IFC's";
        }

        public object[] ConvertBack(object value, Type[] targetTypes, object parameter, CultureInfo culture)
        {
            throw new NotSupportedException();
        }
    }
}
