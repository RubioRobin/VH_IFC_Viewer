using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace VH_IFC_QR
{
    public class PluginClient
    {
        private readonly HttpClient _client;
        private readonly string _baseUrl;
        private string _pluginToken;
        private string _userToken;
        public string CurrentUsername { get; private set; }

        private string _tokenPath;

        public PluginClient(string baseUrl)
        {
            _baseUrl = baseUrl.TrimEnd('/');
            
            // Explicitly enable modern TLS protocols
            System.Net.ServicePointManager.SecurityProtocol = 
                System.Net.SecurityProtocolType.Tls12 | (System.Net.SecurityProtocolType)3072 /*Tls13*/;

            _client = new HttpClient();
            _client.Timeout = TimeSpan.FromMinutes(10);
            _client.DefaultRequestHeaders.Add("User-Agent", "VH-Revit-Plugin/2.0");
            _client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

            // Setup Token Path
            string appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            string folder = Path.Combine(appData, "VH_IFC_Viewer");
            if (!Directory.Exists(folder)) Directory.CreateDirectory(folder);
            _tokenPath = Path.Combine(folder, "auth.json");
        }

        public async Task<string> GetHealthAsync()
        {
            try {
                var response = await _client.GetAsync($"{_baseUrl}/api/health").ConfigureAwait(false);
                return $"Status: {response.StatusCode}";
            } catch (Exception ex) {
                return $"Error: {ex.Message}";
            }
        }

        public async Task<bool> LoginPluginAsync(string clientId, string clientSecret)
        {
            var payload = new { client_id = clientId, client_secret = clientSecret };
            var content = new StringContent(JsonConvert.SerializeObject(payload), Encoding.UTF8, "application/json");

            var response = await _client.PostAsync($"{_baseUrl}/api/plugin/login", content).ConfigureAwait(false);
            if (response.IsSuccessStatusCode)
            {
                var result = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                var data = JObject.Parse(result);
                _pluginToken = data["access_token"].ToString();
                _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _pluginToken);
                return true;
            }
            return false;
        }

        public async Task<bool> LoginUserAsync(string username, string password)
        {
            if (string.IsNullOrEmpty(_pluginToken)) throw new Exception("Plugin not authenticated.");

            var payload = new { username, password };
            var content = new StringContent(JsonConvert.SerializeObject(payload), Encoding.UTF8, "application/json");

            var response = await _client.PostAsync($"{_baseUrl}/api/plugin/user-login", content).ConfigureAwait(false);
            
            if (response.StatusCode == System.Net.HttpStatusCode.NotFound)
            {
                throw new Exception("Login endpoint niet gevonden. Herstart de backend server a.u.b.");
            }

            if (response.IsSuccessStatusCode)
            {
                var result = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                var data = JObject.Parse(result);
                
                _userToken = data["access_token"].ToString();
                CurrentUsername = data["username"].ToString();
                
                SaveToken(new AuthData { Token = _userToken, Username = CurrentUsername, Expiry = DateTime.Now.AddDays(7) });
                
                return true;
            }
            
            if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized)
            {
                 return false; // Invalid credentials
            }

            var errorBody = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
            throw new Exception($"Login fout check ({(int)response.StatusCode}): {errorBody}");
        }

        public bool LoadToken()
        {
            try
            {
                if (File.Exists(_tokenPath))
                {
                    var json = File.ReadAllText(_tokenPath);
                    var data = JsonConvert.DeserializeObject<AuthData>(json);
                    
                    if (data != null && data.Expiry > DateTime.Now)
                    {
                        _userToken = data.Token;
                        CurrentUsername = data.Username;
                        return true;
                    }
                }
            }
            catch { }
            return false;
        }

        private void SaveToken(AuthData data)
        {
            try
            {
                File.WriteAllText(_tokenPath, JsonConvert.SerializeObject(data));
            }
            catch { }
        }

        public void Logout()
        {
            _userToken = null;
            CurrentUsername = null;
            if (File.Exists(_tokenPath)) File.Delete(_tokenPath);
        }

        public async Task<List<ProjectInfo>> GetProjectsAsync()
        {
            var response = await _client.GetAsync($"{_baseUrl}/api/plugin/projects").ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                var error = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                throw new Exception($"Projecten ophalen mislukt ({(int)response.StatusCode}): {error}");
            }
            var content = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
            return JsonConvert.DeserializeObject<List<ProjectInfo>>(content);
        }

        public async Task<string> CreateModelAsync(string projectId, string modelName)
        {
            // Attach User Token Header
            if (!string.IsNullOrEmpty(_userToken))
            {
                _client.DefaultRequestHeaders.Remove("x-user-token");
                _client.DefaultRequestHeaders.Add("x-user-token", _userToken);
            }

            var payload = new { projectId, modelName };
            var content = new StringContent(JsonConvert.SerializeObject(payload), Encoding.UTF8, "application/json");
            var response = await _client.PostAsync($"{_baseUrl}/api/plugin/models/create", content).ConfigureAwait(false);
            
            _client.DefaultRequestHeaders.Remove("x-user-token"); // Cleanup

            if (!response.IsSuccessStatusCode)
            {
                var error = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                throw new Exception($"Model aanmaken mislukt ({(int)response.StatusCode}): {error}");
            }
            var result = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
            return JObject.Parse(result)["modelId"].ToString();
        }

        public async Task<UploadSessionInfo> CreateUploadSessionAsync(string modelId, string fileName, long fileSize, string checksum)
        {
            var payload = new { fileName, contentType = "application/octet-stream", fileSize, checksumSha256 = checksum };
            var content = new StringContent(JsonConvert.SerializeObject(payload), Encoding.UTF8, "application/json");
            var response = await _client.PostAsync($"{_baseUrl}/api/plugin/models/{modelId}/versions/upload-session", content).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                var error = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                throw new Exception($"Upload sessie mislukt ({(int)response.StatusCode}): {error}");
            }
            var result = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
            return JsonConvert.DeserializeObject<UploadSessionInfo>(result);
        }

        public async Task UploadFileAsync(string uploadUrl, string filePath)
        {
            using (var stream = System.IO.File.OpenRead(filePath))
            {
                var content = new StreamContent(stream);
                content.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
                var response = await _client.PutAsync(uploadUrl, content).ConfigureAwait(false);
                if (!response.IsSuccessStatusCode)
                {
                    var error = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                    throw new Exception($"Bestand uploaden mislukt ({(int)response.StatusCode}): {error}");
                }
            }
        }

        public async Task CompleteVersionAsync(string modelId, string versionId)
        {
            var response = await _client.PostAsync($"{_baseUrl}/api/plugin/models/{modelId}/versions/{versionId}/complete", null).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                var error = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                throw new Exception($"Versie voltooien mislukt ({(int)response.StatusCode}): {error}");
            }
        }

        public async Task<ShareInfo> CreateShareAsync(string modelId, string versionId)
        {
            var response = await _client.PostAsync($"{_baseUrl}/api/plugin/models/{modelId}/versions/{versionId}/share", null).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                var error = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                throw new Exception($"Share link maken mislukt ({(int)response.StatusCode}): {error}");
            }
            var result = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
            return JsonConvert.DeserializeObject<ShareInfo>(result);
        }

        public async Task<string> GenerateQRAsync(string modelId, string versionId, string viewerUrl, string projectId)
        {
            var payload = new { viewerUrl, projectId };
            var content = new StringContent(JsonConvert.SerializeObject(payload), Encoding.UTF8, "application/json");
            var response = await _client.PostAsync($"{_baseUrl}/api/plugin/models/{modelId}/versions/{versionId}/qr", content).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                var error = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                throw new Exception($"QR genereren mislukt ({(int)response.StatusCode}): {error}");
            }
            var result = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
            return JObject.Parse(result)["qrUrl"].ToString();
        }

        public async Task<byte[]> DownloadQRAsync(string qrUrl)
        {
            return await _client.GetByteArrayAsync(qrUrl).ConfigureAwait(false);
        }
    }

    public class ProjectInfo
    {
        public string id { get; set; }
        public string name { get; set; }
        public string code { get; set; }
    }

    public class UploadSessionInfo
    {
        public string versionId { get; set; }
        public string uploadUrl { get; set; }
        public string storagePath { get; set; }
    }

    public class ShareInfo
    {
        public string token { get; set; }
        public string viewerUrl { get; set; }
    }

    public class AuthData
    {
        public string Token { get; set; }
        public string Username { get; set; }
        public DateTime Expiry { get; set; }
    }
}
