using System.Threading;
using MauiApp1.ApplicationContracts.Repositories;
using MauiApp1.Models;
using Microsoft.Extensions.Logging;
using SQLite;

namespace MauiApp1.Services;

public class PoiDatabase : IPoiQueryRepository, IPoiCommandRepository, ITranslationRepository
{
    private readonly SQLiteAsyncConnection _db;
    private readonly ILogger<PoiDatabase> _logger;
    private bool _inited;

    public PoiDatabase(ILogger<PoiDatabase> logger)
    {
        _logger = logger;
        var path = Path.Combine(FileSystem.AppDataDirectory, "pois.db");
        _db = new SQLiteAsyncConnection(path);
    }

    public async Task InitAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (_inited) return;

        await _db.CreateTableAsync<Poi>();
        await _db.CreateTableAsync<PoiTranslationCacheEntry>();

        // Ensure new columns exist for flattened model. ALTER TABLE is no-op if column exists.
        try { await _db.ExecuteAsync("ALTER TABLE pois ADD COLUMN Code TEXT"); } catch { }
        try { await _db.ExecuteAsync("ALTER TABLE pois ADD COLUMN LanguageCode TEXT"); } catch { }
        try { await _db.ExecuteAsync("ALTER TABLE pois ADD COLUMN Name TEXT"); } catch { }
        try { await _db.ExecuteAsync("ALTER TABLE pois ADD COLUMN Summary TEXT"); } catch { }
        try { await _db.ExecuteAsync("ALTER TABLE pois ADD COLUMN NarrationShort TEXT"); } catch { }
        try { await _db.ExecuteAsync("ALTER TABLE pois ADD COLUMN NarrationLong TEXT"); } catch { }

        await _db.ExecuteAsync("CREATE INDEX IF NOT EXISTS IX_pois_Code ON pois(Code)");
        await _db.ExecuteAsync("CREATE INDEX IF NOT EXISTS IX_pois_LanguageCode ON pois(LanguageCode)");

        _inited = true;
    }

    public Task<int> GetCountAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return _db.Table<Poi>().CountAsync();
    }

    // Changed: DB now stores exactly 1 core row per POI. No language filtering in SQL.
    public Task<List<Poi>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return _db.Table<Poi>()
              .OrderByDescending(p => p.Priority)
              .ToListAsync();
    }

    public async Task<Poi?> GetByIdAsync(string id, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return await _db.Table<Poi>()
            .Where(p => p.Id == id)
            .FirstOrDefaultAsync();
    }

    public Task<int> InsertAsync(Poi poi, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return _db.InsertAsync(poi);
    }

    public Task<int> UpdateAsync(Poi poi, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return _db.UpdateAsync(poi);
    }

    public Task<int> InsertManyAsync(IEnumerable<Poi> pois, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return _db.InsertAllAsync(pois);
    }

    public async Task UpsertAsync(Poi poi, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var existing = await GetByIdAsync(poi.Id, cancellationToken).ConfigureAwait(false);

        if (existing == null)
        {
            await _db.InsertAsync(poi);
            return;
        }

        await _db.UpdateAsync(poi);
    }

    public async Task UpsertManyAsync(IEnumerable<Poi> pois, CancellationToken cancellationToken = default)
    {
        foreach (var poi in pois)
        {
            cancellationToken.ThrowIfCancellationRequested();
            await UpsertAsync(poi, cancellationToken).ConfigureAwait(false);
        }
    }

    public async Task<Poi?> GetByCodeAsync(string code, string? lang = null, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (string.IsNullOrWhiteSpace(code)) return null;
        code = code.Trim();

        if (!string.IsNullOrWhiteSpace(lang))
        {
            _logger.LogWarning(
                "[TranslationWarning] GetByCodeAsync ignores Lang parameter for code-only lookup | Code={Code} | Lang={Lang}",
                code,
                lang);
        }

        return await _db.Table<Poi>()
            .Where(p => p.Code == code)
            .FirstOrDefaultAsync();
    }

    public Task<Poi?> GetAnyLanguageByCodeAsync(string code, CancellationToken cancellationToken = default)
        => GetByCodeAsync(code, null, cancellationToken);

    public async Task<Poi?> GetExactByCodeAndLanguageAsync(
        string code,
        string languageCode,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (string.IsNullOrWhiteSpace(code) || string.IsNullOrWhiteSpace(languageCode))
            return null;

        var normCode = code.Trim().ToUpperInvariant();
        var normLang = languageCode.Trim().ToLowerInvariant();

        var matches = await _db.Table<Poi>()
            .Where(p => p.Code == normCode && p.LanguageCode == normLang)
            .Take(2)
            .ToListAsync()
            .ConfigureAwait(false);

        if (matches.Count > 1)
        {
            _logger.LogWarning(
                "[TranslationWarning] Multiple POI rows for same code and language | Code={Code} | Lang={Lang} | Count={Count}",
                normCode,
                normLang,
                matches.Count);
        }

        return matches.Count == 0 ? null : matches[0];
    }

    public Task<PoiTranslationCacheEntry?> GetTranslationCacheAsync(
        string code,
        string languageCode,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var key = PoiTranslationCacheEntry.MakeKey(code, languageCode);
        return _db.Table<PoiTranslationCacheEntry>()
            .Where(e => e.Key == key)
            .FirstOrDefaultAsync();
    }

    public async Task UpsertTranslationCacheAsync(PoiTranslationCacheEntry entry, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var existing = await _db.Table<PoiTranslationCacheEntry>()
            .Where(e => e.Key == entry.Key)
            .FirstOrDefaultAsync();

        if (existing == null)
            await _db.InsertAsync(entry);
        else
            await _db.UpdateAsync(entry);
    }

    public async Task<List<Poi>> GetNearbyAsync(double latitude, double longitude, double radiusInMeters, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var all = await GetAllAsync(cancellationToken);
        
        var currentLoc = new Microsoft.Maui.Devices.Sensors.Location(latitude, longitude);
        return all.Where(p => 
            Microsoft.Maui.Devices.Sensors.Location.CalculateDistance(
                currentLoc, 
                new Microsoft.Maui.Devices.Sensors.Location(p.Latitude, p.Longitude), 
                Microsoft.Maui.Devices.Sensors.DistanceUnits.Kilometers) <= radiusInMeters / 1000.0
        ).ToList();
    }
}
