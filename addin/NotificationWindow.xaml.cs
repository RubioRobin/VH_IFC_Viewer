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
            RevitWindowHelper.KeepOnTop(this);

            MessageBlock.Text = message;

            switch (type)
            {
                case NotificationType.Error:
                    TitleBlock.Text = "Er ging iets mis";
                    IconBlock.Text = "X";
                    break;
                case NotificationType.Warning:
                    TitleBlock.Text = "Let op";
                    IconBlock.Text = "!";
                    break;
                default:
                    TitleBlock.Text = "Informatie";
                    IconBlock.Text = "i";
                    break;
            }
        }

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
