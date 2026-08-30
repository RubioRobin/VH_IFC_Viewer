using System;
using System.Windows;
using System.Windows.Input;
using System.Threading.Tasks;

namespace VH_IFC_QR
{
    using System.Windows.Media;

    public partial class LoginWindow : Window
    {
        private PluginClient _client;
        public bool IsLoggedIn { get; private set; } = false;

        public LoginWindow(PluginClient client)
        {
            InitializeComponent();
            RevitWindowHelper.KeepOnTop(this);
            _client = client;
        }

        private async void BtnLogin_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                btnLogin.IsEnabled = false;
                lblStatus.Foreground = new SolidColorBrush(Color.FromRgb(22, 163, 74)); // Green-600
                lblStatus.Text = "Bezig met inloggen...";

                string email = txtUsername.Text.Trim();
                string password = txtPassword.Password;

                if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
                {
                    lblStatus.Foreground = Brushes.Red;
                    lblStatus.Text = "Vul alle velden in.";
                    btnLogin.IsEnabled = true;
                    return;
                }

                // Authenticate
                bool success = await _client.LoginUserAsync(email, password);

                if (success)
                {
                    lblStatus.Text = "Succesvol ingelogd!";
                    IsLoggedIn = true;
                    await Task.Delay(500); // Short delay to show success
                    this.DialogResult = true;
                    this.Close();
                }
                else
                {
                    lblStatus.Foreground = Brushes.Red;
                    lblStatus.Text = "Ongeldig e-mailadres of wachtwoord.";
                }
            }
            catch (Exception ex)
            {
                lblStatus.Foreground = Brushes.Red;
                lblStatus.Text = "Fout: " + ex.Message;
            }
            finally
            {
                btnLogin.IsEnabled = true;
            }
        }

        private void Window_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Escape)
            {
                this.DialogResult = false;
                this.Close();
            }
            else if (e.Key == Key.Enter && btnLogin.IsEnabled)
            {
                BtnLogin_Click(sender, e);
            }
        }
    }
}
