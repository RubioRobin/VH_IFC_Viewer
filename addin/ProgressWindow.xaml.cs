using System;
using System.Windows;
using System.Windows.Threading;

namespace VH_IFC_QR
{
    public partial class ProgressWindow : Window
    {
        public ProgressWindow()
        {
            InitializeComponent();
            RevitWindowHelper.KeepOnTop(this);
        }

        public void Update(string message, int percent)
        {
            int value = Math.Max(0, Math.Min(100, percent));

            // Ensure UI update on UI thread
            Dispatcher.BeginInvoke(new Action(() =>
            {
                lblMessage.Text = message;
                progressBar.Value = value;
                lblPercent.Text = $"{value}%";
            }), DispatcherPriority.Render);
        }

        private void Header_MouseDown(object sender, System.Windows.Input.MouseButtonEventArgs e)
        {
            if (e.ChangedButton == System.Windows.Input.MouseButton.Left)
                this.DragMove();
        }
    }
}
