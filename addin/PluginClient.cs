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
        private string _pluginClientId;
        private string _pluginClientSecret;
        private DateTime _pluginTokenExpiry = DateTime.MinValue;
        public string CurrentUsername { get; private set; }

        private string _tokenPath;

        public PluginClient(string baseUrl)
        {
            _baseUrl = baseUrl.TrimEnd('/');
            
            // Moderne TLS protocollen expliciet inschakelen
            System.Net.ServicePointManager.SecurityProtocol = 
                System.Net.SecurityProtocolType.Tls12 | (System.Net.SecurityProtocolType)3072 /*Tls13*/;

            _client = new HttpClient();
            _client.Timeout = TimeSpan.FromMinutes(10);
            _client.DefaultRequestHeaders.Add("User-Agent", "VH-Revit-Plugin/2.0");
            _client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

            // Token Pad instellen
            string appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            string folder = Path.Combine(appData, "VH_IFC_Viewer");
            if (!Directory.Exists(folder)) Directory.CreateDirectory(folder);
            _tokenPath = Path.Combine(folder, "auth.json");
        }

        // Retry helper: 3 pogingen met exponential backoff (1s, 2s, 4s) voor transient HTTP-fouten
        private async Task<T> ExecuteWithRetryAsync<T>(Func<Task<T>> operation, int maxAttempts = 3)
        {
            for (int attempt = 1; attempt <= maxAttempts; attempt++)
            {
                try
                {
                    return await operation().ConfigureAwait(false);
                }
                catch (HttpRequestException) when (attempt < maxAttempts)
                {
                    await Task.Delay(TimeSpan.FromSeconds(Math.Pow(2, attempt - 1))).ConfigureAwait(false);
                }
                catch (TaskCanceledException) when (attempt < maxAttempts)
                {
                    await Task.Delay(TimeSpan.FromSeconds(Math.Pow(2, attempt - 1))).ConfigureAwait(false);
                }
            }
            return await operation().ConfigureAwait(false); // Laatste poging — laat exception doorgaan
        }

        // Error sanitization: haal 'message' of 'error' uit JSON, anders generieke tekst
        private string SanitizeErrorMessage(string body, System.Net.HttpStatusCode status)
        {
            try
            {
                var j = JObject.Parse(body);
                return j["message"]?.ToString() ?? j["error"]?.ToString() ?? $"Server fout ({(int)status})";
            }
            catch
            {
                return $"Server fout ({(int)status})";
            }
        }

        // Zorg dat plugin-token geldig is; herverbind automatisch als token bijna verlopen is
        private async Task EnsurePluginAuthAsync()
        {
            if (DateTime.Now >= _pluginTokenExpiry && !string.IsNullOrEmpty(_pluginClientId))
                await LoginPluginAsync(_pluginClientId, _pluginClientSecret).ConfigureAwait(false);
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
            // Sla credentials op voor automatische herverbinding bij token-verloop
            _pluginClientId = clientId;
            _pluginClientSecret = clientSecret;

            var payload = new { client_id = clientId, client_secret = clientSecret };
            var content = new StringContent(JsonConvert.SerializeObject(payload), Encoding.UTF8, "application/json");

            var response = await _client.PostAsync($"{_baseUrl}/api/plugin/login", content).ConfigureAwait(false);
            if (response.IsSuccessStatusCode)
            {
                var result = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                var data = JObject.Parse(result);
                _pluginToken = data["access_token"]?.ToString() ?? throw new Exception("Ongeldig serverantwoord: access_token ontbreekt");
                _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _pluginToken);
                // Token is 1 uur geldig; vernieuw 5 minuten voor verloop
                _pluginTokenExpiry = DateTime.Now.AddMinutes(55);
                return true;
            }

            var errorBody = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
            throw new Exception(SanitizeErrorMessage(errorBody, response.StatusCode));
        }

        public async Task<bool> LoginUserAsync(string username, string password)
        {
            if (string.IsNullOrEmpty(_pluginToken)) throw new Exception("Plugin niet geauthenticeerd.");

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

                _userToken = data["access_token"]?.ToString() ?? throw new Exception("Ongeldig serverantwoord: access_token ontbreekt");
                CurrentUsername = data["username"]?.ToString() ?? throw new Exception("Ongeldig serverantwoord: username ontbreekt");
                
                SaveToken(new AuthData { Token = _userToken, Username = CurrentUsername, Expiry = DateTime.Now.AddDays(7) });
                
                return true;
            }
            
            if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized)
            {
                 return false; // Invalid credentials
            }

            var errorBody = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
            throw new Exception(SanitizeErrorMessage(errorBody, response.StatusCode));
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
            await EnsurePluginAuthAsync().ConfigureAwait(false);
            return await ExecuteWithRetryAsync(async () =>
            {
                var response = await _client.GetAsync($"{_baseUrl}/api/plugin/projects").ConfigureAwait(false);
                if (!response.IsSuccessStatusCode)
                {
                    var error = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                    throw new Exception($"Projecten ophalen mislukt: {SanitizeErrorMessage(error, response.StatusCode)}");
                }
                var content = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                return JsonConvert.DeserializeObject<List<ProjectInfo>>(content);
            }).ConfigureAwait(false);
        }

        public async Task<ProjectInfo> EnsureProjectAsync(string projectNumber, string projectName)
        {
            await EnsurePluginAuthAsync().ConfigureAwait(false);

            var payload = new { projectNumber, projectName };
            var request = new HttpRequestMessage(HttpMethod.Post, $"{_baseUrl}/api/plugin/projects/ensure")
            {
                Content = new StringContent(JsonConvert.SerializeObject(payload), Encoding.UTF8, "application/json")
            };
            if (!string.IsNullOrEmpty(_userToken))
                request.Headers.Add("x-user-token", _userToken);

            var response = await _client.SendAsync(request).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                var error = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                throw new Exception($"Project zoeken of aanmaken mislukt: {SanitizeErrorMessage(error, response.StatusCode)}");
            }

            var content = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
            return JsonConvert.DeserializeObject<ProjectInfo>(content);
        }

        public async Task<string> CreateModelAsync(string projectId, string modelName, string uploaderName = null)
        {
            var payload = new { projectId, modelName, uploaderName };
            var request = new HttpRequestMessage(HttpMethod.Post, $"{_baseUrl}/api/plugin/models/create")
            {
                Content = new StringContent(JsonConvert.SerializeObject(payload), Encoding.UTF8, "application/json")
            };
            if (!string.IsNullOrEmpty(_userToken))
                request.Headers.Add("x-user-token", _userToken);

            var response = await _client.SendAsync(request).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                var error = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                throw new Exception($"Model aanmaken mislukt: {SanitizeErrorMessage(error, response.StatusCode)}");
            }
            var result = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
            return JObject.Parse(result)["modelId"]?.ToString() ?? throw new Exception("Ongeldig serverantwoord: modelId ontbreekt");
        }

        public async Task<UploadSessionInfo> CreateUploadSessionAsync(string modelId, string fileName, long fileSize, string checksum, string uploaderName = null)
        {
            var payload = new { fileName, contentType = "application/octet-stream", fileSize, checksumSha256 = checksum, uploaderName };
            var request = new HttpRequestMessage(HttpMethod.Post, $"{_baseUrl}/api/plugin/models/{modelId}/versions/upload-session")
            {
                Content = new StringContent(JsonConvert.SerializeObject(payload), Encoding.UTF8, "application/json")
            };
            if (!string.IsNullOrEmpty(_userToken))
                request.Headers.Add("x-user-token", _userToken);

            var response = await _client.SendAsync(request).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                var error = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                throw new Exception($"Upload sessie mislukt: {SanitizeErrorMessage(error, response.StatusCode)}");
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
                    throw new Exception($"Bestand uploaden mislukt: {SanitizeErrorMessage(error, response.StatusCode)}");
                }
            }
        }

        public async Task CompleteVersionAsync(string modelId, string versionId)
        {
            await ExecuteWithRetryAsync<bool>(async () =>
            {
                var response = await _client.PostAsync($"{_baseUrl}/api/plugin/models/{modelId}/versions/{versionId}/complete", null).ConfigureAwait(false);
                if (!response.IsSuccessStatusCode)
                {
                    var error = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                    throw new Exception($"Versie voltooien mislukt: {SanitizeErrorMessage(error, response.StatusCode)}");
                }
                return true;
            }).ConfigureAwait(false);
        }

        public async Task<ShareInfo> CreateShareAsync(string modelId, string versionId)
        {
            return await ExecuteWithRetryAsync(async () =>
            {
                var response = await _client.PostAsync($"{_baseUrl}/api/plugin/models/{modelId}/versions/{versionId}/share", null).ConfigureAwait(false);
                if (!response.IsSuccessStatusCode)
                {
                    var error = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                    throw new Exception($"Share link maken mislukt: {SanitizeErrorMessage(error, response.StatusCode)}");
                }
                var result = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                return JsonConvert.DeserializeObject<ShareInfo>(result);
            }).ConfigureAwait(false);
        }

        public async Task<string> GenerateQRAsync(string modelId, string versionId, string viewerUrl, string projectId)
        {
            return await ExecuteWithRetryAsync(async () =>
            {
                var payload = new { viewerUrl, projectId };
                var content = new StringContent(JsonConvert.SerializeObject(payload), Encoding.UTF8, "application/json");
                var response = await _client.PostAsync($"{_baseUrl}/api/plugin/models/{modelId}/versions/{versionId}/qr", content).ConfigureAwait(false);
                if (!response.IsSuccessStatusCode)
                {
                    var error = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                    throw new Exception($"QR genereren mislukt: {SanitizeErrorMessage(error, response.StatusCode)}");
                }
                var result = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                return JObject.Parse(result)["qrUrl"].ToString();
            }).ConfigureAwait(false);
        }

        public async Task<byte[]> DownloadQRAsync(string qrUrl)
        {
            return await ExecuteWithRetryAsync(() => _client.GetByteArrayAsync(qrUrl)).ConfigureAwait(false);
        }

        // --- ASSEMBLY LINK WORKFLOW ---

        public async Task<List<ProjectFileInfo>> GetProjectFilesAsync(string projectId)
        {
            var response = await _client.GetAsync($"{_baseUrl}/api/plugin/projects/{projectId}/files").ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                var error = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                throw new Exception($"Bestanden ophalen mislukt: {SanitizeErrorMessage(error, response.StatusCode)}");
            }
            var content = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
            return JsonConvert.DeserializeObject<List<ProjectFileInfo>>(content);
        }

        public async Task<ShareQRResult> CreateShareAndQRAsync(string fileId, string projectId)
        {
            var payload = new { projectId };
            var content = new StringContent(JsonConvert.SerializeObject(payload), Encoding.UTF8, "application/json");
            var response = await _client.PostAsync($"{_baseUrl}/api/plugin/files/{fileId}/share-qr", content).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                var error = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                throw new Exception($"Share-QR genereren mislukt: {SanitizeErrorMessage(error, response.StatusCode)}");
            }
            var result = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
            return JsonConvert.DeserializeObject<ShareQRResult>(result);
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

    public class ProjectFileInfo
    {
        public string id { get; set; }
        public string filename { get; set; }
        public string path { get; set; }
        public long size { get; set; }
        public string created_at { get; set; }
    }

    public class ShareQRResult
    {
        public string viewerUrl { get; set; }
        public string shareToken { get; set; }
        public string qrUrl { get; set; }
        public string modelId { get; set; }
        public string versionId { get; set; }
    }
}
