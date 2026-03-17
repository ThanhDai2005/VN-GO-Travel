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

        // Keep unique index on Code (Code is primary key in model)
        await _db.ExecuteAsync("CREATE UNIQUE INDEX IF NOT EXISTS IX_pois_Code ON pois(Code)");

        _inited = true;
    }

    public Task<List<Poi>> GetAllAsync(string langCode)
        => _db.Table<Poi>()
              .Where(p => p.LanguageCode == langCode)
              .OrderByDescending(p => p.Priority)
              .ToListAsync();

    public Task<Poi?> GetByCodeAsync(string code)
        => _db.Table<Poi>()
              .Where(p => p.Code == code)
              .FirstOrDefaultAsync();

    public Task<int> InsertAsync(Poi poi)
        => _db.InsertAsync(poi);

    public Task<int> UpdateAsync(Poi poi)
        => _db.UpdateAsync(poi);

    public Task<int> InsertManyAsync(IEnumerable<Poi> pois)
        => _db.InsertAllAsync(pois);

    public async Task UpsertAsync(Poi poi)
    {
        var existing = await GetByCodeAsync(poi.Code);

        if (existing == null)
        {
            await _db.InsertAsync(poi);
            return;
        }

        // Update existing record (Code is primary key in model)
        await _db.UpdateAsync(poi);
    }

    public async Task UpsertManyAsync(IEnumerable<Poi> pois)
    {
        foreach (var poi in pois)
        {
            await UpsertAsync(poi);
        }
    }
}