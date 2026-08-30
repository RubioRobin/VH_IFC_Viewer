using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace VH_IFC_QR
{
    public class PluginClient
    {
        private readonly HttpClient _client;
        private readonly HttpClient _authClient;
        private readonly HttpClient _storageClient;
        private readonly string _supabaseUrl;
        private readonly string _functionUrl;
        private readonly string _publishableKey;
        private string _userToken;
        private string _refreshToken;
        private DateTime _tokenExpiryUtc = DateTime.MinValue;
        private readonly SemaphoreSlim _sessionRefreshLock = new SemaphoreSlim(1, 1);
        public string CurrentUsername { get; private set; }

        private readonly string _tokenPath;
        private const string ProtectedTokenPrefix = "dpapi:";

        public PluginClient(string supabaseUrl, string publishableKey)
        {
            if (string.IsNullOrWhiteSpace(supabaseUrl))
                throw new ArgumentException("Supabase URL ontbreekt.", nameof(supabaseUrl));
            if (string.IsNullOrWhiteSpace(publishableKey))
                throw new ArgumentException("Supabase publishable key ontbreekt.", nameof(publishableKey));
            _supabaseUrl = supabaseUrl.TrimEnd('/');
            _functionUrl = $"{_supabaseUrl}/functions/v1/revit-api";
            _publishableKey = publishableKey;

            // Moderne TLS protocollen expliciet inschakelen
            System.Net.ServicePointManager.SecurityProtocol =
                System.Net.SecurityProtocolType.Tls12 | (System.Net.SecurityProtocolType)3072 /*Tls13*/;
            System.Net.ServicePointManager.Expect100Continue = false;

            _client = new HttpClient();
            _client.Timeout = TimeSpan.FromMinutes(10);
            _client.DefaultRequestHeaders.Add("User-Agent", "VH-Revit-Plugin/2.0");
            _client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
            _client.DefaultRequestHeaders.Add("apikey", _publishableKey);

            // Auth- en Storage-aanvragen use only the public project key.
            _authClient = new HttpClient { Timeout = TimeSpan.FromMinutes(2) };
            _authClient.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
            _authClient.DefaultRequestHeaders.Add("apikey", _publishableKey);

            // Signed Storage operations still pass the project publishable key.
            // Do not add the Revit plugin key or a service-role key here.
            _storageClient = new HttpClient { Timeout = TimeSpan.FromMinutes(30) };
            _storageClient.DefaultRequestHeaders.Add("apikey", _publishableKey);

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
                return j["message"]?.ToString() ?? j["msg"]?.ToString() ?? j["error"]?.ToString() ?? $"Server fout ({(int)status})";
            }
            catch
            {
                return $"Server fout ({(int)status})";
            }
        }

        private string Endpoint(string path) => $"{_functionUrl}/{path.TrimStart('/')}";

        private void ApplyAuthData(AuthData data, bool persist)
        {
            if (data == null || string.IsNullOrWhiteSpace(data.Token))
                throw new InvalidOperationException("Ongeldig Supabase-sessieantwoord.");

            _userToken = data.Token;
            _refreshToken = data.RefreshToken;
            CurrentUsername = data.Username;
            _tokenExpiryUtc = data.Expiry.ToUniversalTime();

            if (persist)
                SaveToken(data);
        }

        private async Task EnsureFreshUserTokenAsync()
        {
            if (!string.IsNullOrWhiteSpace(_userToken) && _tokenExpiryUtc > DateTime.UtcNow.AddMinutes(1))
                return;

            await _sessionRefreshLock.WaitAsync().ConfigureAwait(false);
            try
            {
                if (!string.IsNullOrWhiteSpace(_userToken) && _tokenExpiryUtc > DateTime.UtcNow.AddMinutes(1))
                    return;

                if (string.IsNullOrWhiteSpace(_refreshToken))
                    throw new InvalidOperationException("Je Supabase-sessie is verlopen. Meld je opnieuw aan.");

                using var content = new StringContent(
                    JsonConvert.SerializeObject(new { refresh_token = _refreshToken }),
                    Encoding.UTF8,
                    "application/json");
                using var response = await _authClient
                    .PostAsync($"{_supabaseUrl}/auth/v1/token?grant_type=refresh_token", content)
                    .ConfigureAwait(false);

                if (!response.IsSuccessStatusCode)
                {
                    ClearAuthenticatedSession();
                    throw new InvalidOperationException("Je Supabase-sessie is verlopen. Meld je opnieuw aan.");
                }

                var result = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                var data = JObject.Parse(result);
                var accessToken = data["access_token"]?.ToString();
                if (string.IsNullOrWhiteSpace(accessToken))
                {
                    ClearAuthenticatedSession();
                    throw new InvalidOperationException("Supabase gaf geen geldige vernieuwde sessie terug.");
                }

                int expiresIn = data["expires_in"]?.Value<int?>() ?? 3600;
                ApplyAuthData(new AuthData
                {
                    Token = accessToken,
                    RefreshToken = data["refresh_token"]?.ToString() ?? _refreshToken,
                    Username = data["user"]?["email"]?.ToString() ?? CurrentUsername,
                    Expiry = DateTime.UtcNow.AddSeconds(Math.Max(60, expiresIn))
                }, persist: true);
            }
            catch (JsonException)
            {
                ClearAuthenticatedSession();
                throw new InvalidOperationException("Supabase gaf geen geldige vernieuwde sessie terug.");
            }
            finally
            {
                _sessionRefreshLock.Release();
            }
        }

        private async Task AddUserAuthorizationAsync(HttpRequestMessage request)
        {
            await EnsureFreshUserTokenAsync().ConfigureAwait(false);
            if (string.IsNullOrWhiteSpace(_userToken))
                throw new InvalidOperationException("Je Supabase-sessie ontbreekt. Meld je opnieuw aan.");

            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _userToken);
        }

        private void ClearAuthenticatedSession()
        {
            _userToken = null;
            _refreshToken = null;
            _tokenExpiryUtc = DateTime.MinValue;
            CurrentUsername = null;
            try { if (File.Exists(_tokenPath)) File.Delete(_tokenPath); } catch { }
        }

        public async Task CheckConnectionAsync()
        {
            using var response = await _client.GetAsync(Endpoint("health")).ConfigureAwait(false);
            if (response.IsSuccessStatusCode) return;
            var errorBody = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
            throw new Exception(SanitizeErrorMessage(errorBody, response.StatusCode));
        }

        public async Task<bool> LoginUserAsync(string email, string password)
        {
            var payload = new { email, password };
            var content = new StringContent(JsonConvert.SerializeObject(payload), Encoding.UTF8, "application/json");
            var response = await _authClient.PostAsync($"{_supabaseUrl}/auth/v1/token?grant_type=password", content).ConfigureAwait(false);

            if (response.IsSuccessStatusCode)
            {
                var result = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                var data = JObject.Parse(result);

                string accessToken = data["access_token"]?.ToString() ?? throw new Exception("Ongeldig serverantwoord: access_token ontbreekt");
                string username = data["user"]?["email"]?.ToString() ?? email;
                int expiresIn = data["expires_in"]?.Value<int?>() ?? 3600;

                ApplyAuthData(new AuthData
                {
                    Token = accessToken,
                    RefreshToken = data["refresh_token"]?.ToString(),
                    Username = username,
                    Expiry = DateTime.UtcNow.AddSeconds(Math.Max(60, expiresIn))
                }, persist: true);

                return true;
            }

            if (response.StatusCode == HttpStatusCode.Unauthorized || response.StatusCode == HttpStatusCode.BadRequest)
            {
                return false;
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
                    var storedValue = File.ReadAllText(_tokenPath);
                    var needsEncryptionMigration = !storedValue.StartsWith(ProtectedTokenPrefix, StringComparison.Ordinal);
                    var json = UnprotectTokenJson(storedValue);
                    var data = JsonConvert.DeserializeObject<AuthData>(json);

                    if (data != null && !string.IsNullOrWhiteSpace(data.Token))
                    {
                        // Older add-in versions saved the session as plaintext JSON.
                        // Re-save a valid legacy session with Windows DPAPI immediately.
                        ApplyAuthData(data, persist: needsEncryptionMigration);
                        if (data.Expiry.ToUniversalTime() > DateTime.UtcNow.AddMinutes(1))
                            return true;

                        try
                        {
                            EnsureFreshUserTokenAsync().GetAwaiter().GetResult();
                            return true;
                        }
                        catch
                        {
                            ClearAuthenticatedSession();
                        }
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
                if (!OperatingSystem.IsWindows())
                    return;

                string json = JsonConvert.SerializeObject(data);
                byte[] protectedBytes = ProtectedData.Protect(
                    Encoding.UTF8.GetBytes(json),
                    optionalEntropy: null,
                    scope: DataProtectionScope.CurrentUser);
                File.WriteAllText(_tokenPath, ProtectedTokenPrefix + Convert.ToBase64String(protectedBytes));
            }
            catch { }
        }

        private static string UnprotectTokenJson(string value)
        {
            if (string.IsNullOrWhiteSpace(value) || !value.StartsWith(ProtectedTokenPrefix, StringComparison.Ordinal))
                return value;

            if (!OperatingSystem.IsWindows())
                return string.Empty;

            byte[] protectedBytes = Convert.FromBase64String(value.Substring(ProtectedTokenPrefix.Length));
            byte[] plainBytes = ProtectedData.Unprotect(
                protectedBytes,
                optionalEntropy: null,
                scope: DataProtectionScope.CurrentUser);
            return Encoding.UTF8.GetString(plainBytes);
        }

        public async Task<ProjectInfo> EnsureProjectAsync(string projectNumber, string projectName)
        {
            var payload = new { projectNumber, projectName };
            var request = new HttpRequestMessage(HttpMethod.Post, Endpoint("projects/ensure"))
            {
                Content = new StringContent(JsonConvert.SerializeObject(payload), Encoding.UTF8, "application/json")
            };
            await AddUserAuthorizationAsync(request).ConfigureAwait(false);

            var response = await _client.SendAsync(request).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                var error = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                throw new Exception($"Project zoeken of aanmaken mislukt: {SanitizeErrorMessage(error, response.StatusCode)}");
            }

            var content = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
            return JsonConvert.DeserializeObject<ProjectInfo>(content);
        }

        public async Task<List<ProjectInfo>> GetProjectsAsync()
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, Endpoint("projects"));
            await AddUserAuthorizationAsync(request).ConfigureAwait(false);
            var response = await _client.SendAsync(request).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
                throw new Exception($"Projecten ophalen mislukt: {SanitizeErrorMessage(await response.Content.ReadAsStringAsync().ConfigureAwait(false), response.StatusCode)}");
            return JsonConvert.DeserializeObject<List<ProjectInfo>>(await response.Content.ReadAsStringAsync().ConfigureAwait(false)) ?? new List<ProjectInfo>();
        }

        public async Task<List<ProjectFileInfo>> GetProjectFilesAsync(string projectId)
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, Endpoint($"projects/{projectId}/files"));
            await AddUserAuthorizationAsync(request).ConfigureAwait(false);
            var response = await _client.SendAsync(request).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
                throw new Exception($"Bestanden ophalen mislukt: {SanitizeErrorMessage(await response.Content.ReadAsStringAsync().ConfigureAwait(false), response.StatusCode)}");
            return JsonConvert.DeserializeObject<List<ProjectFileInfo>>(await response.Content.ReadAsStringAsync().ConfigureAwait(false)) ?? new List<ProjectFileInfo>();
        }

        public async Task<ShareQrInfo> CreateShareAndQRAsync(string fileId, string projectId)
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, Endpoint($"files/{fileId}/share-qr"))
            {
                Content = new StringContent(JsonConvert.SerializeObject(new { projectId }), Encoding.UTF8, "application/json")
            };
            await AddUserAuthorizationAsync(request).ConfigureAwait(false);
            var response = await _client.SendAsync(request).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
                throw new Exception($"QR-link maken mislukt: {SanitizeErrorMessage(await response.Content.ReadAsStringAsync().ConfigureAwait(false), response.StatusCode)}");
            return JsonConvert.DeserializeObject<ShareQrInfo>(await response.Content.ReadAsStringAsync().ConfigureAwait(false));
        }

        public void Logout()
        {
            ClearAuthenticatedSession();
        }

        public async Task<string> CreateModelAsync(string projectId, string modelName, string uploaderName = null)
        {
            var payload = new { projectId, modelName, uploaderName };
            var request = new HttpRequestMessage(HttpMethod.Post, Endpoint("models/create"))
            {
                Content = new StringContent(JsonConvert.SerializeObject(payload), Encoding.UTF8, "application/json")
            };
            await AddUserAuthorizationAsync(request).ConfigureAwait(false);

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
            var request = new HttpRequestMessage(HttpMethod.Post, Endpoint($"models/{modelId}/versions/upload-session"))
            {
                Content = new StringContent(JsonConvert.SerializeObject(payload), Encoding.UTF8, "application/json")
            };
            await AddUserAuthorizationAsync(request).ConfigureAwait(false);

            var response = await _client.SendAsync(request).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                var error = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                throw new Exception($"Upload sessie mislukt: {SanitizeErrorMessage(error, response.StatusCode)}");
            }
            var result = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
            return JsonConvert.DeserializeObject<UploadSessionInfo>(result);
        }

        private const int TusChunkSize = 6 * 1024 * 1024;

        // Only raised before a TUS upload URL is created. Once a chunk has been
        // accepted, falling back to PUT could overwrite or corrupt an in-flight
        // resumable upload and is therefore intentionally not attempted.
        private sealed class TusInitializationException : Exception
        {
            public TusInitializationException(string message, Exception innerException = null)
                : base(message, innerException) { }
        }

        // Raised only after Storage confirms that the TUS upload has accepted
        // zero bytes, so retrying via the one-shot signed PUT URL is safe.
        private sealed class TusFallbackToSignedPutException : Exception
        {
            public TusFallbackToSignedPutException(string message, Exception innerException = null)
                : base(message, innerException) { }
        }

        public async Task UploadFileAsync(UploadSessionInfo session, string filePath, Action<long, long> progress = null)
        {
            if (session == null) throw new ArgumentNullException(nameof(session));
            if (string.IsNullOrWhiteSpace(filePath) || !File.Exists(filePath))
                throw new FileNotFoundException("IFC-bestand niet gevonden.", filePath);

            if (!string.IsNullOrWhiteSpace(session.uploadToken) && !string.IsNullOrWhiteSpace(session.tusEndpoint))
            {
                try
                {
                    await UploadResumableFileAsync(session, filePath, progress).ConfigureAwait(false);
                    return;
                }
                catch (TusInitializationException ex)
                {
                    // The Edge Function also returns a short-lived signed PUT URL.
                    // It is safe to use here because no resumable chunk exists yet.
                    System.Diagnostics.Debug.WriteLine($"[PluginClient] TUS niet beschikbaar, signed PUT fallback: {ex.Message}");
                }
                catch (TusFallbackToSignedPutException ex)
                {
                    System.Diagnostics.Debug.WriteLine($"[PluginClient] TUS accepteerde nog geen bytes, signed PUT fallback: {ex.Message}");
                }
            }

            await UploadStandardFileAsync(session.uploadUrl, filePath, progress).ConfigureAwait(false);
        }

        private async Task UploadStandardFileAsync(string uploadUrl, string filePath, Action<long, long> progress)
        {
            if (string.IsNullOrWhiteSpace(uploadUrl))
                throw new InvalidOperationException("Supabase gaf geen upload-URL terug.");

            using (var stream = File.OpenRead(filePath))
            using (var content = new ProgressStreamContent(stream, 1024 * 256, progress))
            using (var request = new HttpRequestMessage(HttpMethod.Put, uploadUrl))
            {
                content.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
                content.Headers.ContentLength = stream.Length;
                request.Content = content;

                using var response = await _storageClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead).ConfigureAwait(false);
                if (!response.IsSuccessStatusCode)
                {
                    var error = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                    throw new Exception($"Bestand uploaden mislukt: {SanitizeErrorMessage(error, response.StatusCode)}");
                }
            }
        }

        private async Task UploadResumableFileAsync(UploadSessionInfo session, string filePath, Action<long, long> progress)
        {
            var fileInfo = new FileInfo(filePath);
            if (fileInfo.Length <= 0) throw new InvalidOperationException("Het IFC-bestand is leeg.");

            var uploadUri = await CreateTusUploadAsync(session, fileInfo.Length).ConfigureAwait(false);
            byte[] buffer = new byte[TusChunkSize];
            long offset = 0;
            progress?.Invoke(offset, fileInfo.Length);

            using var stream = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.Read, TusChunkSize, useAsync: true);
            while (offset < fileInfo.Length)
            {
                try
                {
                    stream.Position = offset;
                    int read = await stream.ReadAsync(buffer, 0, (int)Math.Min(buffer.Length, fileInfo.Length - offset)).ConfigureAwait(false);
                    if (read <= 0) throw new EndOfStreamException("Kon IFC-bestand niet volledig uitlezen.");

                    long confirmedOffset = await UploadTusChunkAsync(uploadUri, session.uploadToken, buffer, read, offset).ConfigureAwait(false);
                    if (confirmedOffset <= offset || confirmedOffset > fileInfo.Length)
                        throw new InvalidOperationException("Supabase gaf een ongeldige TUS upload-offset terug.");

                    offset = confirmedOffset;
                    progress?.Invoke(offset, fileInfo.Length);
                }
                catch (HttpRequestException ex) when (offset == 0)
                {
                    try
                    {
                        long remoteOffset = await GetTusOffsetAsync(uploadUri, session.uploadToken).ConfigureAwait(false);
                        if (remoteOffset == 0)
                        {
                            throw new TusFallbackToSignedPutException(
                                "De TUS-uploadverbinding bleef afbreken voordat er bytes waren geaccepteerd.",
                                ex);
                        }

                        if (remoteOffset > offset && remoteOffset <= fileInfo.Length)
                        {
                            offset = remoteOffset;
                            progress?.Invoke(offset, fileInfo.Length);
                            continue;
                        }
                    }
                    catch (TusFallbackToSignedPutException)
                    {
                        throw;
                    }
                    catch
                    {
                        // Without a confirmed zero offset, never risk a second
                        // writer for the same Storage path.
                    }

                    throw;
                }
            }
        }

        private async Task<Uri> CreateTusUploadAsync(UploadSessionInfo session, long length)
        {
            if (!Uri.TryCreate(session.tusEndpoint, UriKind.Absolute, out var endpoint))
                throw new TusInitializationException("Supabase gaf geen geldige TUS endpoint terug.");

            try
            {
                using var request = new HttpRequestMessage(HttpMethod.Post, endpoint);
                request.Headers.TryAddWithoutValidation("Tus-Resumable", "1.0.0");
                request.Headers.TryAddWithoutValidation("Upload-Length", length.ToString(CultureInfo.InvariantCulture));
                request.Headers.TryAddWithoutValidation("x-signature", session.uploadToken);
                request.Headers.TryAddWithoutValidation("Upload-Metadata", string.Join(",",
                    $"bucketName {TusMetadata(session.storageBucket ?? "ifc-models")}",
                    $"objectName {TusMetadata(session.storagePath)}",
                    $"contentType {TusMetadata("application/octet-stream")}",
                    $"cacheControl {TusMetadata("3600")}"));

                using var response = await _storageClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead).ConfigureAwait(false);
                if (!response.IsSuccessStatusCode || response.Headers.Location == null)
                {
                    string error = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                    throw new TusInitializationException(
                        $"Resumable IFC-upload starten mislukt: {SanitizeErrorMessage(error, response.StatusCode)}");
                }

                return response.Headers.Location.IsAbsoluteUri
                    ? response.Headers.Location
                    : new Uri(endpoint, response.Headers.Location);
            }
            catch (HttpRequestException ex)
            {
                throw new TusInitializationException("De TUS-uploadserver is niet bereikbaar.", ex);
            }
            catch (TaskCanceledException ex)
            {
                throw new TusInitializationException("De TUS-uploadserver reageert niet op tijd.", ex);
            }
        }

        private async Task<long> UploadTusChunkAsync(Uri uploadUri, string signature, byte[] buffer, int length, long offset)
        {
            const int maxAttempts = 5;
            Exception lastTransient = null;

            for (int attempt = 1; attempt <= maxAttempts; attempt++)
            {
                try
                {
                    using var request = new HttpRequestMessage(new HttpMethod("PATCH"), uploadUri);
                    request.Headers.TryAddWithoutValidation("Tus-Resumable", "1.0.0");
                    request.Headers.TryAddWithoutValidation("Upload-Offset", offset.ToString(CultureInfo.InvariantCulture));
                    request.Headers.TryAddWithoutValidation("x-signature", signature);

                    using var content = new ByteArrayContent(buffer, 0, length);
                    content.Headers.ContentType = new MediaTypeHeaderValue("application/offset+octet-stream");
                    request.Content = content;

                    using var response = await _storageClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead).ConfigureAwait(false);
                    if (response.IsSuccessStatusCode)
                    {
                        if (TryGetHeaderLong(response, "Upload-Offset", out long nextOffset)) return nextOffset;
                        return offset + length;
                    }

                    if ((int)response.StatusCode < 500 && response.StatusCode != HttpStatusCode.TooManyRequests)
                    {
                        string error = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                        throw new Exception($"Resumable IFC-upload mislukt: {SanitizeErrorMessage(error, response.StatusCode)}");
                    }

                    lastTransient = new HttpRequestException(
                        $"TUS upload HTTP {(int)response.StatusCode}.");
                }
                catch (HttpRequestException ex)
                {
                    lastTransient = ex;
                }
                catch (TaskCanceledException ex)
                {
                    lastTransient = ex;
                }

                if (attempt == maxAttempts)
                    break;

                await Task.Delay(TimeSpan.FromSeconds(Math.Pow(2, attempt - 1))).ConfigureAwait(false);
                try
                {
                    long recoveredOffset = await GetTusOffsetAsync(uploadUri, signature).ConfigureAwait(false);
                    // A response can be lost after Storage already accepted a chunk.
                    // Return that offset to the outer loop so it re-reads the correct
                    // bytes instead of replaying the old buffer at a new offset.
                    if (recoveredOffset != offset) return recoveredOffset;
                }
                catch (Exception ex) when (
                    ex is HttpRequestException ||
                    ex is TaskCanceledException ||
                    ex is InvalidOperationException)
                {
                    lastTransient = ex;
                }
            }

            throw new HttpRequestException("Resumable IFC-upload kon niet worden hervat.", lastTransient);
        }

        private async Task<long> GetTusOffsetAsync(Uri uploadUri, string signature)
        {
            using var request = new HttpRequestMessage(HttpMethod.Head, uploadUri);
            request.Headers.TryAddWithoutValidation("Tus-Resumable", "1.0.0");
            request.Headers.TryAddWithoutValidation("x-signature", signature);
            using var response = await _storageClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode || !TryGetHeaderLong(response, "Upload-Offset", out long offset))
                throw new InvalidOperationException("Kon de voortgang van de resumable IFC-upload niet ophalen.");
            return offset;
        }

        private static bool TryGetHeaderLong(HttpResponseMessage response, string name, out long value)
        {
            value = 0;
            return response.Headers.TryGetValues(name, out var values) &&
                   long.TryParse(values.FirstOrDefault(), NumberStyles.None, CultureInfo.InvariantCulture, out value);
        }

        private static string TusMetadata(string value)
        {
            return Convert.ToBase64String(Encoding.UTF8.GetBytes(value ?? string.Empty));
        }

        private sealed class ProgressStreamContent : HttpContent
        {
            private readonly Stream _source;
            private readonly int _bufferSize;
            private readonly Action<long, long> _progress;
            private readonly long _length;

            public ProgressStreamContent(Stream source, int bufferSize, Action<long, long> progress)
            {
                _source = source ?? throw new ArgumentNullException(nameof(source));
                _bufferSize = bufferSize > 0 ? bufferSize : 81920;
                _progress = progress;
                _length = source.CanSeek ? source.Length : -1;
            }

            protected override async Task SerializeToStreamAsync(Stream stream, TransportContext context)
            {
                byte[] buffer = new byte[_bufferSize];
                long uploaded = 0;
                int bytesRead;

                _progress?.Invoke(0, _length);

                while ((bytesRead = await _source.ReadAsync(buffer, 0, buffer.Length).ConfigureAwait(false)) > 0)
                {
                    await stream.WriteAsync(buffer, 0, bytesRead).ConfigureAwait(false);
                    uploaded += bytesRead;
                    _progress?.Invoke(uploaded, _length);
                }
            }

            protected override bool TryComputeLength(out long length)
            {
                length = _length;
                return _length >= 0;
            }
        }

        public async Task CompleteVersionAsync(string modelId, string versionId)
        {
            await ExecuteWithRetryAsync<bool>(async () =>
            {
                using var request = new HttpRequestMessage(HttpMethod.Post, Endpoint($"models/{modelId}/versions/{versionId}/complete"));
                await AddUserAuthorizationAsync(request).ConfigureAwait(false);
                using var response = await _client.SendAsync(request).ConfigureAwait(false);
                if (!response.IsSuccessStatusCode)
                {
                    var error = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                    if (response.StatusCode == HttpStatusCode.Conflict ||
                        (int)response.StatusCode >= 500)
                    {
                        // Storage can briefly need time to expose a newly uploaded
                        // object. The complete endpoint is idempotent, so retry
                        // only transient responses.
                        throw new HttpRequestException(
                            $"Versie voltooien mislukt: {SanitizeErrorMessage(error, response.StatusCode)}");
                    }

                    throw new Exception($"Versie voltooien mislukt: {SanitizeErrorMessage(error, response.StatusCode)}");
                }
                return true;
            }).ConfigureAwait(false);
        }

        public async Task<ShareInfo> CreateShareAsync(string modelId, string versionId)
        {
            return await ExecuteWithRetryAsync(async () =>
            {
                using var request = new HttpRequestMessage(HttpMethod.Post, Endpoint($"models/{modelId}/versions/{versionId}/share"));
                await AddUserAuthorizationAsync(request).ConfigureAwait(false);
                var response = await _client.SendAsync(request).ConfigureAwait(false);
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
                using var request = new HttpRequestMessage(HttpMethod.Post, Endpoint($"models/{modelId}/versions/{versionId}/qr"))
                {
                    Content = new StringContent(JsonConvert.SerializeObject(new { projectId }), Encoding.UTF8, "application/json")
                };
                await AddUserAuthorizationAsync(request).ConfigureAwait(false);
                var response = await _client.SendAsync(request).ConfigureAwait(false);
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
            return await ExecuteWithRetryAsync(() => _storageClient.GetByteArrayAsync(qrUrl)).ConfigureAwait(false);
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
        public string uploadToken { get; set; }
        public string tusEndpoint { get; set; }
        public string storagePath { get; set; }
        public string storageBucket { get; set; }
    }

    public class ShareInfo
    {
        public string token { get; set; }
        public string viewerUrl { get; set; }
    }

    public class ProjectFileInfo
    {
        public string id { get; set; }
        public string filename { get; set; }
        public string path { get; set; }
        public long size { get; set; }
    }

    public class ShareQrInfo
    {
        public string viewerUrl { get; set; }
        public string qrUrl { get; set; }
        public string modelId { get; set; }
        public string versionId { get; set; }
    }

    public class AuthData
    {
        public string Token { get; set; }
        public string RefreshToken { get; set; }
        public string Username { get; set; }
        public DateTime Expiry { get; set; }
    }

}
