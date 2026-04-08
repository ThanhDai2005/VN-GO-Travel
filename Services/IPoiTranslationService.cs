using System.Threading;
using MauiApp1.Models;

namespace MauiApp1.Services;

/// <summary>
/// Resolves a POI in the requested language: primary <c>pois</c> row, then SQLite translation cache, then EN (or fallback source) + translate.
/// </summary>
public interface IPoiTranslationService
{
    /// <param name="lang">Target language (e.g. vi, en). Null/empty normalized to vi.</param>
    Task<Poi?> GetOrTranslateAsync(string code, string? lang, CancellationToken cancellationToken = default);
}
