using System;
using System.Net.Http;
using System.Net.Http.Json;
using System.Threading;
using System.Threading.Tasks;
using MauiApp1.Configuration;

namespace MauiApp1.Infrastructure.Remote;

public class ApiClient : IApiClient
{
    private readonly HttpClient _httpClient;

    public ApiClient()
    {
        var baseUrl = MauiApp1.Configuration.BackendApiConfiguration.BaseUrl;
        if (!baseUrl.EndsWith("/")) baseUrl += "/";
        
        _httpClient = new HttpClient
        {
            BaseAddress = new Uri(baseUrl)
        };
    }

    public async Task<T?> GetAsync<T>(string endpoint, CancellationToken cancellationToken = default)
    {
        return await _httpClient.GetFromJsonAsync<T>(endpoint, cancellationToken);
    }

    public async Task<TResponse?> PostAsync<TRequest, TResponse>(string endpoint, TRequest data, CancellationToken cancellationToken = default)
    {
        var response = await _httpClient.PostAsJsonAsync(endpoint, data, cancellationToken);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<TResponse>(cancellationToken: cancellationToken);
    }
}
