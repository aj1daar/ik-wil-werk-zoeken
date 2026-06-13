using backend.Data;
using backend.Models;
using Microsoft.EntityFrameworkCore;

namespace backend.Services;

public sealed class SponsorStore(AppDbContext db)
{
    public async Task<IReadOnlyList<SponsorCompany>> GetAllAsync() =>
        await db.Sponsors.ToListAsync();

    public async Task<IReadOnlyList<SponsorCompany>> GetActiveAsync() =>
        await db.Sponsors.Where(c => c.RemovedAt == null).ToListAsync();

    public async Task<SponsorCompany?> GetAsync(string id) =>
        await db.Sponsors.FindAsync(id);

    public async Task UpsertAsync(SponsorCompany company)
    {
        var existing = await db.Sponsors.FindAsync(company.Id);
        if (existing is null)
            db.Sponsors.Add(company);
        else
            db.Entry(existing).CurrentValues.SetValues(company);
        await db.SaveChangesAsync();
    }

    public async Task UpsertAllAsync(IEnumerable<SponsorCompany> companies)
    {
        foreach (var company in companies)
        {
            var existing = await db.Sponsors.FindAsync(company.Id);
            if (existing is null)
                db.Sponsors.Add(company);
            else
                db.Entry(existing).CurrentValues.SetValues(company);
        }
        await db.SaveChangesAsync();
    }

    public async Task SoftDeleteRemovedAsync(IEnumerable<string> ids)
    {
        var idSet = ids.ToHashSet();
        if (idSet.Count == 0) return;

        var now = DateTimeOffset.UtcNow;
        await db.Sponsors
            .Where(c => idSet.Contains(c.Id) && c.RemovedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(c => c.RemovedAt, now));
    }

    public async Task LogSyncAsync(SyncLog log)
    {
        db.SyncLogs.Add(log);
        await db.SaveChangesAsync();
    }

    public async Task<IReadOnlyList<SyncLog>> GetSyncLogsAsync(int limit = 20) =>
        await db.SyncLogs
            .OrderByDescending(s => s.SyncedAt)
            .Take(limit)
            .ToListAsync();
}
