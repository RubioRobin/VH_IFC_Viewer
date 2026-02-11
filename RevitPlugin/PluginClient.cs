using System;
using System.Collections.Generic;
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
        private string _token;

        public PluginClient(string baseUrl)
        {
            _baseUrl = baseUrl.TrimEnd('/');
            
            // Explicitly enable modern TLS protocols
            System.Net.ServicePointManager.SecurityProtocol = 
                System.Net.SecurityProtocolType.Tls12 | (System.Net.SecurityProtocolType)3072 /*Tls13*/;

            _client = new HttpClient();
            _client.Timeout = TimeSpan.FromMinutes(10);
            _client.DefaultRequestHeaders.Add("User-Agent", "VH-Revit-Plugin/1.1");
            _client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
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

        public async Task<bool> LoginAsync(string clientId, string clientSecret)
        {
            var payload = new { client_id = clientId, client_secret = clientSecret };
            var content = new StringContent(JsonConvert.SerializeObject(payload), Encoding.UTF8, "application/json");

            var response = await _client.PostAsync($"{_baseUrl}/api/plugin/login", content).ConfigureAwait(false);
            if (response.IsSuccessStatusCode)
            {
                var result = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                var data = JObject.Parse(result);
                _token = data["access_token"].ToString();
                _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _token);
                return true;
            }
            return false;
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
            var payload = new { projectId, modelName };
            var content = new StringContent(JsonConvert.SerializeObject(payload), Encoding.UTF8, "application/json");
            var response = await _client.PostAsync($"{_baseUrl}/api/plugin/models/create", content).ConfigureAwait(false);
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
            response.EnsureSuccessStatusCode();
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
                response.EnsureSuccessStatusCode();
            }
        }

        public async Task CompleteVersionAsync(string modelId, string versionId)
        {
            var response = await _client.PostAsync($"{_baseUrl}/api/plugin/models/{modelId}/versions/{versionId}/complete", null).ConfigureAwait(false);
            response.EnsureSuccessStatusCode();
        }

        public async Task<ShareInfo> CreateShareAsync(string modelId, string versionId)
        {
            var response = await _client.PostAsync($"{_baseUrl}/api/plugin/models/{modelId}/versions/{versionId}/share", null).ConfigureAwait(false);
            response.EnsureSuccessStatusCode();
            var result = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
            return JsonConvert.DeserializeObject<ShareInfo>(result);
        }

        public async Task<string> GenerateQRAsync(string modelId, string versionId, string viewerUrl, string projectId)
        {
            var payload = new { viewerUrl, projectId };
            var content = new StringContent(JsonConvert.SerializeObject(payload), Encoding.UTF8, "application/json");
            var response = await _client.PostAsync($"{_baseUrl}/api/plugin/models/{modelId}/versions/{versionId}/qr", content).ConfigureAwait(false);
            response.EnsureSuccessStatusCode();
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
}
