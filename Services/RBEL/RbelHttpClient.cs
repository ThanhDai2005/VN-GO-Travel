using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using MauiApp1.Configuration;

namespace MauiApp1.Services.RBEL;

/// <summary>Async HTTP to 7.3.0 ingestion only; never called from UI thread by design.</summary>
public sealed class RbelHttpClient
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private readonly HttpClient _http;
    private readonly AuthTokenStore _tokens;

    public RbelHttpClient(HttpClient http, AuthTokenStore tokens)
    {
        _http = http;
        _tokens = tokens;
    }

    public async Task<bool> PostBatchAsync(IReadOnlyList<RbelWireEvent> events, CancellationToken cancellationToken = default)
    {
        if (events.Count == 0)
            return true;

        if (string.IsNullOrWhiteSpace(_tokens.Token)
            && string.IsNullOrWhiteSpace(RbelBridgeConfiguration.IntelligenceIngestApiKey))
            return false;

        var body = new
        {
            schema = "event-contract-v2",
            rbelMappingVersion = RbelMappingProfile.MappingVersion,
            sentAt = DateTimeOffset.UtcNow,
            events
        };

        var maxAttempts = 3;
        var delay = TimeSpan.FromMilliseconds(400);
        for (var attempt = 1; attempt <= maxAttempts; attempt++)
        {
            using var req = new HttpRequestMessage(HttpMethod.Post, "intelligence/events/batch");
            req.Content = JsonContent.Create(body, options: JsonOptions);

            var token = _tokens.Token;
            if (!string.IsNullOrWhiteSpace(token))
                req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            else if (!string.IsNullOrWhiteSpace(RbelBridgeConfiguration.IntelligenceIngestApiKey))
                req.Headers.TryAddWithoutValidation("X-Api-Key", RbelBridgeConfiguration.IntelligenceIngestApiKey!);

            try
            {
                var resp = await _http.SendAsync(req, cancellationToken).ConfigureAwait(false);
                if (resp.IsSuccessStatusCode)
                    return true;
                if ((int)resp.StatusCode is >= 400 and < 500 and not 408 and not 429)
                    return false;
            }
            catch
            {
                if (attempt == maxAttempts)
                    return false;
            }

            await Task.Delay(delay, cancellationToken).ConfigureAwait(false);
            delay = TimeSpan.FromMilliseconds(Math.Min(delay.TotalMilliseconds * 2, 5000));
        }

        return false;
    }
}
