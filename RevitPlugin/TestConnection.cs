using System;
using System.Net.Http;
using System.Text.Json;
using System.Threading.Tasks;

class TestConnection
{
    static async Task Main(string[] args)
    {
        string backendUrl = "https://vh-ifc-backend.onrender.com";
        
        Console.WriteLine($"Testing connection to: {backendUrl}");
        Console.WriteLine("=====================================\n");
        
        var cookieContainer = new System.Net.CookieContainer();
        using (var handler = new HttpClientHandler { 
            CookieContainer = cookieContainer, 
            UseCookies = true,
            ServerCertificateCustomValidationCallback = (message, cert, chain, errors) => true // Accept all SSL
        })
        using (var client = new HttpClient(handler))
        {
            client.Timeout = TimeSpan.FromSeconds(30);
            
            try
            {
                // Test 1: Health check
                Console.WriteLine("1. Testing /api/health...");
                var healthResponse = await client.GetAsync($"{backendUrl}/api/health");
                Console.WriteLine($"   Status: {healthResponse.StatusCode}");
                var healthBody = await healthResponse.Content.ReadAsStringAsync();
                Console.WriteLine($"   Response: {healthBody}\n");
                
                // Test 2: Login
                Console.WriteLine("2. Testing login...");
                var loginData = new { username = "admin", password = "admin123" };
                var content = new StringContent(
                    JsonSerializer.Serialize(loginData), 
                    System.Text.Encoding.UTF8, 
                    "application/json");
                
                var loginResponse = await client.PostAsync($"{backendUrl}/api/auth/login", content);
                Console.WriteLine($"   Status: {loginResponse.StatusCode}");
                var loginBody = await loginResponse.Content.ReadAsStringAsync();
                Console.WriteLine($"   Response: {loginBody}");
                
                // Check cookies
                var cookies = cookieContainer.GetCookies(new Uri(backendUrl));
                Console.WriteLine($"   Cookies received: {cookies.Count}");
                foreach (System.Net.Cookie cookie in cookies)
                {
                    Console.WriteLine($"     - {cookie.Name}: {cookie.Value.Substring(0, Math.Min(20, cookie.Value.Length))}...");
                }
                Console.WriteLine();
                
                if (!loginResponse.IsSuccessStatusCode)
                {
                    Console.WriteLine("   ❌ LOGIN FAILED!");
                    return;
                }
                
                // Test 3: Get projects (requires auth)
                Console.WriteLine("3. Testing authenticated request (/api/projects)...");
                var projectsResponse = await client.GetAsync($"{backendUrl}/api/projects");
                Console.WriteLine($"   Status: {projectsResponse.StatusCode}");
                var projectsBody = await projectsResponse.Content.ReadAsStringAsync();
                Console.WriteLine($"   Response: {projectsBody.Substring(0, Math.Min(200, projectsBody.Length))}...\n");
                
                if (projectsResponse.IsSuccessStatusCode)
                {
                    Console.WriteLine("✅ ALL TESTS PASSED!");
                }
                else
                {
                    Console.WriteLine("❌ Authentication test failed - session not maintained");
                }
                
            }
            catch (Exception ex)
            {
                Console.WriteLine($"\n❌ ERROR: {ex.Message}");
                Console.WriteLine($"Type: {ex.GetType().Name}");
                if (ex.InnerException != null)
                {
                    Console.WriteLine($"Inner: {ex.InnerException.Message}");
                }
            }
        }
        
        Console.WriteLine("\nPress any key to exit...");
        Console.ReadKey();
    }
}
