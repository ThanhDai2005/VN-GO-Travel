using System.Diagnostics;
using System.Net.Http.Json;
using System.Text.Json;

namespace MauiApp1.Services;

/// <summary>
/// Primary translation provider using Langbly API.
/// If it fails, falls back to GTranslate.
/// </summary>
public sealed class LangblyTranslationProvider : ITranslationProvider
{
    private readonly HttpClient _httpClient;
    private readonly GTranslateTranslationProvider _fallback;

    // Simulate standard Langbly API Endpoints (mocked for demo unless configured)
    private const string LangblyEndpoint = "https://api.langbly.com/v1/translate";
    private const string LangblyBatchEndpoint = "https://api.langbly.com/v1/translate/batch";
    
    // For local simulation without a real API Key. If set to true, it just skips
    // network and uses GTranslate immediately to ensure smooth functionality.
    private readonly bool _useFallbackDirectly = true; 

    public LangblyTranslationProvider(GTranslateTranslationProvider fallback)
    {
        _fallback = fallback;
        _httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
        // _httpClient.DefaultRequestHeaders.Add("Authorization", "Bearer YOUR_API_KEY");
    }

    /// <inheritdoc />
    public async Task<TranslationResult> TranslateAsync(string text, string fromLang, string toLang, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrEmpty(text))
            return new TranslationResult(text, true);

        fromLang = string.IsNullOrWhiteSpace(fromLang) ? "en" : fromLang.Trim().ToLowerInvariant();
        toLang = string.IsNullOrWhiteSpace(toLang) ? "en" : toLang.Trim().ToLowerInvariant();

        if (string.Equals(fromLang, toLang, StringComparison.OrdinalIgnoreCase))
            return new TranslationResult(text, true);

        if (_useFallbackDirectly)
        {
            Debug.WriteLine($"[Langbly] Skipping to fallback (GTranslate) for: {fromLang} -> {toLang}");
            return await _fallback.TranslateAsync(text, fromLang, toLang, cancellationToken);
        }

        try
        {
            // Simulate Langbly API Request
            var requestBody = new { 
                Text = text, 
                Source = fromLang, 
                Target = toLang 
            };

            var response = await _httpClient.PostAsJsonAsync(LangblyEndpoint, requestBody, cancellationToken);
            
            if (response.IsSuccessStatusCode)
            {
                var content = await response.Content.ReadFromJsonAsync<LangblyResponse>(cancellationToken: cancellationToken);
                if (content != null && !string.IsNullOrWhiteSpace(content.TranslatedText))
                {
                    return new TranslationResult(content.TranslatedText, true);
                }
            }
            
            Debug.WriteLine($"[Langbly] Error {response.StatusCode}. Falling back to GTranslate...");
            return await _fallback.TranslateAsync(text, fromLang, toLang, cancellationToken);
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[Langbly] API Exception: {ex.Message}. Falling back...");
            return await _fallback.TranslateAsync(text, fromLang, toLang, cancellationToken);
        }
    }

    public async Task<List<TranslationResult>> TranslateBatchAsync(List<TranslationRequest> requests, CancellationToken cancellationToken = default)
    {
        if (requests == null || requests.Count == 0) return new List<TranslationResult>();
        
        if (_useFallbackDirectly)
        {
            return await _fallback.TranslateBatchAsync(requests, cancellationToken);
        }

        try
        {
            // --- TRUE BATCHING IMPLEMENTATION (Phase 4 Fix) ---
            var batchRequest = new LangblyBatchRequest
            {
                Requests = requests.Select(r => new LangblyRequest 
                { 
                    Id = r.Id, 
                    Text = r.Text, 
                    Source = r.FromLang, 
                    Target = r.ToLang 
                }).ToList()
            };

            var response = await _httpClient.PostAsJsonAsync(LangblyBatchEndpoint, batchRequest, cancellationToken);

            if (response.IsSuccessStatusCode)
            {
                var content = await response.Content.ReadFromJsonAsync<LangblyBatchResponse>(cancellationToken: cancellationToken);
                if (content?.Results != null)
                {
                    // Map results back in the same order as input
                    var resultMap = content.Results.ToDictionary(x => x.Id, x => x.TranslatedText);
                    return requests.Select(r => 
                        new TranslationResult(resultMap.TryGetValue(r.Id, out var txt) ? txt : r.Text, 
                                              resultMap.ContainsKey(r.Id))).ToList();
                }
            }

            Debug.WriteLine($"[Langbly] Batch Error {response.StatusCode}. Falling back to individual (parallel) fallback...");
            return await _fallback.TranslateBatchAsync(requests, cancellationToken);
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[Langbly] Batch API Exception: {ex.Message}. Falling back...");
            return await _fallback.TranslateBatchAsync(requests, cancellationToken);
        }
    }

    private class LangblyRequest
    {
        public string Id { get; set; } = "";
        public string Text { get; set; } = "";
        public string Source { get; set; } = "";
        public string Target { get; set; } = "";
    }

    private class LangblyBatchRequest
    {
        public List<LangblyRequest> Requests { get; set; } = new();
    }

    private class LangblyBatchResponse
    {
        public List<LangblyBatchResult> Results { get; set; } = new();
    }

    private class LangblyBatchResult
    {
        public string Id { get; set; } = "";
        public string TranslatedText { get; set; } = "";
    }

    private class LangblyResponse
    {
        public string TranslatedText { get; set; } = "";
    }
}
