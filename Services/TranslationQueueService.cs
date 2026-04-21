using System.Collections.Concurrent;
using System.Diagnostics;
using CommunityToolkit.Mvvm.Messaging;
using MauiApp1.ApplicationContracts.Services;
using MauiApp1.Messages;
using MauiApp1.Models;

namespace MauiApp1.Services;

/// <summary>
/// Background queue for translation requests.
/// Implements up to 3 simultaneous translation workers.
/// </summary>
public sealed class TranslationQueueService : IDisposable
{
    private readonly IPoiTranslationService _translationService;
    private readonly ILocalizationService _locService;
    private readonly ConcurrentQueue<(string Code, string Language)> _queue = new();
    private readonly SemaphoreSlim _signal = new(0);
    private readonly SemaphoreSlim _concurrencyLimit = new(3, 3);
    private readonly CancellationTokenSource _cts = new();
    private bool _disposed;

    public TranslationQueueService(IPoiTranslationService translationService, ILocalizationService locService)
    {
        _translationService = translationService;
        _locService = locService;

        // Start the background dispatcher
        Task.Run(ProcessQueueAsync, _cts.Token);
    }

    /// <summary>
    /// Enqueues a translation request for the given POI and language.
    /// Deduplicates if the same request is already in the queue or being processed
    /// (relying on IPoiTranslationService's own internal locking for the latter).
    /// </summary>
    public void Enqueue(string code, string lang)
    {
        if (string.IsNullOrWhiteSpace(code) || string.IsNullOrWhiteSpace(lang)) return;

        var normalizedCode = code.Trim().ToUpperInvariant();
        var normalizedLang = lang.Trim().ToLowerInvariant();

        // Basic deduplication: check if already in queue (O(N) but queue is usually small)
        if (_queue.Any(x => x.Code == normalizedCode && x.Language == normalizedLang))
        {
            Debug.WriteLine($"[TRANSLATE-QUEUE] Already in queue: {normalizedCode} ({normalizedLang})");
            return;
        }

        Debug.WriteLine($"[TRANSLATE-QUEUE] Enqueue: {normalizedCode} ({normalizedLang})");
        _queue.Enqueue((normalizedCode, normalizedLang));
        _signal.Release();
    }

    private async Task ProcessQueueAsync()
    {
        while (!_cts.IsCancellationRequested)
        {
            try
            {
                // Wait for a signal that we have items
                await _signal.WaitAsync(_cts.Token).ConfigureAwait(false);

                if (_queue.TryDequeue(out var request))
                {
                    // Wait for a concurrency slot
                    await _concurrencyLimit.WaitAsync(_cts.Token).ConfigureAwait(false);

                    // Fire and forget the translation task (it will release its own slot)
                    _ = Task.Run(() => RunTranslationAsync(request.Code, request.Language), _cts.Token);
                }
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                Debug.WriteLine($"[TRANSLATE-QUEUE] Dispatcher error: {ex.Message}");
            }
        }
    }

    private async Task RunTranslationAsync(string code, string lang)
    {
        try
        {
            Debug.WriteLine($"[TRANSLATE-QUEUE] Processing: {code} ({lang})");
            WeakReferenceMessenger.Default.Send(new TranslationStartedMessage(code, lang));

            // Per user request, this is sequential logic inside the task but parallelized up to 3 tasks.
            // IPoiTranslationService already handles its own internal SemaphoreSlim(1) per-key.
            var result = await _translationService.GetOrTranslateAsync(code, lang, _cts.Token).ConfigureAwait(false);

            if (result?.Localization != null)
            {
                // Register the result in the in-memory lookup
                _locService.RegisterDynamicTranslation(code, lang, result.Localization);
                
                Debug.WriteLine($"[TRANSLATE-QUEUE] Completed: {code} ({lang})");
                WeakReferenceMessenger.Default.Send(new TranslationCompletedMessage(code, lang, result));
            }
            else
            {
                Debug.WriteLine($"[TRANSLATE-QUEUE] Failed: {code} ({lang}) - Result or Localization is null");
                WeakReferenceMessenger.Default.Send(new TranslationFailedMessage(code, lang, "Result or localization was null"));
            }
        }
        catch (OperationCanceledException) { }
        catch (Exception ex)
        {
            Debug.WriteLine($"[TRANSLATE-QUEUE] Error processing {code} ({lang}): {ex.Message}");
            WeakReferenceMessenger.Default.Send(new TranslationFailedMessage(code, lang, ex.Message));
        }
        finally
        {
            _concurrencyLimit.Release();
        }
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        _cts.Cancel();
        _cts.Dispose();
        _signal.Dispose();
        _concurrencyLimit.Dispose();
    }
}
