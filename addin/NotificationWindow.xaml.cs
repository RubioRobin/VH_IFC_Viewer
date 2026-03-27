using System.Windows;
using System.Windows.Input;

namespace VH_IFC_QR
{
    public partial class NotificationWindow : Window
    {
        public enum NotificationType { Info, Error, Warning }

        public NotificationWindow(string message, NotificationType type = NotificationType.Info)
        {
            InitializeComponent();

            MessageBlock.Text = message;

            switch (type)
            {
                case NotificationType.Error:
                    TitleBlock.Text = "Er ging iets mis";
                    IconBlock.Text = "❌";
                    break;
                case NotificationType.Warning:
                    TitleBlock.Text = "Let op";
                    IconBlock.Text = "⚠️";
                    break;
                default:
                    TitleBlock.Text = "Informatie";
                    IconBlock.Text = "ℹ️";
                    break;
            }
        }

        // Handig: statische methodes zodat aanroepen kort blijven
        public static void ShowError(string message)
        {
            var win = new NotificationWindow(message, NotificationType.Error);
            win.ShowDialog();
        }

        public static void ShowInfo(string message)
        {
            var win = new NotificationWindow(message, NotificationType.Info);
            win.ShowDialog();
        }

        public static void ShowWarning(string message)
        {
            var win = new NotificationWindow(message, NotificationType.Warning);
            win.ShowDialog();
        }

        private void BtnOk_Click(object sender, RoutedEventArgs e) => Close();
        private void Window_MouseDown(object sender, MouseButtonEventArgs e)
        {
            if (e.ChangedButton == MouseButton.Left) DragMove();
        }
    }
}
