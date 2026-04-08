using System.Threading;
using SQLite;
using MauiApp1.Models;

namespace MauiApp1.Services;

public class PoiDatabase
{
    private readonly SQLiteAsyncConnection _db;
    private bool _inited;

    public PoiDatabase()
    {
        var path = Path.Combine(FileSystem.AppDataDirectory, "pois.db");
        _db = new SQLiteAsyncConnection(path);
    }

    public async Task InitAsync()
    {
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

    public Task<int> GetCountAsync()
        => _db.Table<Poi>().CountAsync();

    // Changed: DB now stores exactly 1 core row per POI. No language filtering in SQL.
    public Task<List<Poi>> GetAllAsync()
        => _db.Table<Poi>()
              .OrderByDescending(p => p.Priority)
              .ToListAsync();

    public async Task<Poi?> GetByIdAsync(string id)
    {
        return await _db.Table<Poi>()
            .Where(p => p.Id == id)
            .FirstOrDefaultAsync();
    }

    public Task<int> InsertAsync(Poi poi)
        => _db.InsertAsync(poi);

    public Task<int> UpdateAsync(Poi poi)
        => _db.UpdateAsync(poi);

    public Task<int> InsertManyAsync(IEnumerable<Poi> pois)
        => _db.InsertAllAsync(pois);

    public async Task UpsertAsync(Poi poi)
    {
        var existing = await GetByIdAsync(poi.Id);

        if (existing == null)
        {
            await _db.InsertAsync(poi);
            return;
        }

        await _db.UpdateAsync(poi);
    }

    public async Task UpsertManyAsync(IEnumerable<Poi> pois)
    {
        foreach (var poi in pois)
        {
            await UpsertAsync(poi);
        }
    }

    // Translation Service Helpers
    // Previously these checked LanguageCode in the DB, but since the DB now only stores
    // one core row per POI (no localization), they both just fetch that core row by Code.
    // The MapViewModel will attach localization at load time, and the translation service
    // only needs the core geo data as the "source Poi" anyway.

    public async Task<Poi?> GetByCodeAsync(string code, string? lang = null)
    {
        if (string.IsNullOrWhiteSpace(code)) return null;
        code = code.Trim();

        return await _db.Table<Poi>()
            .Where(p => p.Code == code)
            .FirstOrDefaultAsync();
    }

    public Task<Poi?> GetAnyLanguageByCodeAsync(string code)
    {
        return GetByCodeAsync(code);
    }

    public Task<Poi?> GetExactByCodeAndLanguageAsync(string code, string languageCode, CancellationToken cancellationToken = default)
    {
        return GetByCodeAsync(code);
    }

    public Task<PoiTranslationCacheEntry?> GetTranslationCacheAsync(string code, string languageCode, CancellationToken cancellationToken = default)
    {
        var key = PoiTranslationCacheEntry.MakeKey(code, languageCode);
        return _db.Table<PoiTranslationCacheEntry>()
            .Where(e => e.Key == key)
            .FirstOrDefaultAsync();
    }

    public async Task UpsertTranslationCacheAsync(PoiTranslationCacheEntry entry, CancellationToken cancellationToken = default)
    {
        var existing = await _db.Table<PoiTranslationCacheEntry>()
            .Where(e => e.Key == entry.Key)
            .FirstOrDefaultAsync();

        if (existing == null)
            await _db.InsertAsync(entry);
        else
            await _db.UpdateAsync(entry);
    }
}