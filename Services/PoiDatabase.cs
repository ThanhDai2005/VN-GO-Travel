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

    public Task<List<Poi>> GetAllAsync(string langCode)
        => _db.Table<Poi>()
              .Where(p => p.LanguageCode == langCode)
              .OrderByDescending(p => p.Priority)
              .ToListAsync();

    public Task<Poi?> GetByIdAsync(string id)
        => _db.Table<Poi>()
              .Where(p => p.Id == id)
              .FirstOrDefaultAsync();

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

    // New helper: get POI by Code with language preference and fallbacks.
    public async Task<Poi?> GetByCodeAsync(string code, string? lang = null)
    {
        if (string.IsNullOrWhiteSpace(code)) return null;

        code = code.Trim();

        // Normalize language
        var requested = string.IsNullOrWhiteSpace(lang) ? null : lang.Trim().ToLowerInvariant();

        // Try exact language match first
        if (!string.IsNullOrWhiteSpace(requested))
        {
            var item = await _db.Table<Poi>()
                .Where(p => p.Code == code && p.LanguageCode == requested)
                .FirstOrDefaultAsync();

            if (item != null) return item;
        }

        // Fallback to Vietnamese
        var vi = await _db.Table<Poi>()
            .Where(p => p.Code == code && p.LanguageCode == "vi")
            .FirstOrDefaultAsync();

        if (vi != null) return vi;

        // Fallback to any language
        return await GetAnyLanguageByCodeAsync(code);
    }

    public async Task<Poi?> GetAnyLanguageByCodeAsync(string code)
    {
        if (string.IsNullOrWhiteSpace(code)) return null;

        code = code.Trim();

        return await _db.Table<Poi>()
            .Where(p => p.Code == code)
            .FirstOrDefaultAsync();
    }
}