using backend.Data;
using backend.Models;
using Microsoft.EntityFrameworkCore;

namespace backend.Services;

public sealed class SponsorStore(AppDbContext db)
{
    public async Task<IReadOnlyList<SponsorCompany>> GetAllAsync() =>
        await db.Sponsors.ToListAsync();

    public async Task<IReadOnlyList<SponsorCompany>> GetActiveAsync() =>
        await db.Sponsors.Where(c => c.RemovedAt == null).OrderBy(c => c.Name).ToListAsync();

    public async Task<SponsorCompany?> GetAsync(string id) =>
        await db.Sponsors.FindAsync(id);

    public async Task<SponsorCompany?> FindByNameAsync(string name)
    {
        var trimmed = name.Trim().ToLower();
        return await db.Sponsors.FirstOrDefaultAsync(c =>
            c.RemovedAt == null && c.Name.ToLower() == trimmed);
    }

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

    public async Task AddAllAsync(IEnumerable<SponsorCompany> companies)
    {
        db.Sponsors.AddRange(companies);
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

    public async Task<IReadOnlyList<SponsorCompany>> GetUnEnrichedAsync(int limit, int belowVersion) =>
        await db.Sponsors
            .Where(c => c.RemovedAt == null && c.EnrichmentVersion < belowVersion)
            .OrderBy(c => c.Name)
            .Take(limit)
            .ToListAsync();

    public async Task<int> CountUnEnrichedAsync(int belowVersion) =>
        await db.Sponsors
            .CountAsync(c => c.RemovedAt == null && c.EnrichmentVersion < belowVersion);

    public async Task<IReadOnlyList<SponsorCompany>> GetLowConfidenceAsync(int limit, int version) =>
        await db.Sponsors
            .Where(c => c.RemovedAt == null && c.EnrichmentVersion == version && c.Summary == null)
            .OrderBy(c => c.Name)
            .Take(limit)
            .ToListAsync();

    public async Task<int> CountLowConfidenceAsync(int version) =>
        await db.Sponsors
            .CountAsync(c => c.RemovedAt == null && c.EnrichmentVersion == version && c.Summary == null);

    // Persists enrichment fields for each company via direct UPDATE — no change-tracker overhead.
    public async Task SaveEnrichmentBatchAsync(IReadOnlyList<SponsorCompany> companies)
    {
        foreach (var c in companies)
        {
            await db.Sponsors
                .Where(s => s.Id == c.Id)
                .ExecuteUpdateAsync(s => s
                    .SetProperty(p => p.Summary,           c.Summary)
                    .SetProperty(p => p.CoreIndustry,      c.CoreIndustry)
                    .SetProperty(p => p.TechStackTags,     c.TechStackTags)
                    .SetProperty(p => p.FunctionalTags,    c.FunctionalTags)
                    .SetProperty(p => p.WorkingLanguage,   c.WorkingLanguage)
                    .SetProperty(p => p.CompanySize,       c.CompanySize)
                    .SetProperty(p => p.RemotePolicy,      c.RemotePolicy)
                    .SetProperty(p => p.ParentCompanyName, c.ParentCompanyName)
                    .SetProperty(p => p.WebsiteUrl,        c.WebsiteUrl)
                    .SetProperty(p => p.TargetMarket,      c.TargetMarket)
                    .SetProperty(p => p.City,              c.City)
                    .SetProperty(p => p.EnrichedAt,        c.EnrichedAt)
                    .SetProperty(p => p.EnrichmentVersion, c.EnrichmentVersion)
                );
        }
    }

    // A manual admin edit is treated as already-enriched (current version, timestamped
    // now) so the automatic enrich/retry sweeps never silently overwrite it later.
    public async Task<SponsorCompany?> UpdateCompanyAsync(string id, CompanyEdit edit)
    {
        var company = await db.Sponsors.FindAsync(id);
        if (company is null) return null;

        company.Summary           = edit.Summary;
        company.City              = edit.City;
        company.Locations         = edit.Locations;
        company.WebsiteUrl        = edit.WebsiteUrl;
        company.CoreIndustry      = edit.CoreIndustry;
        company.TechStackTags     = edit.TechStackTags;
        company.FunctionalTags    = edit.FunctionalTags;
        company.WorkingLanguage   = edit.WorkingLanguage;
        company.CompanySize       = edit.CompanySize;
        company.RemotePolicy      = edit.RemotePolicy;
        company.ParentCompanyName = edit.ParentCompanyName;
        company.TargetMarket      = edit.TargetMarket;
        company.EnrichedAt        = DateTimeOffset.UtcNow;
        company.EnrichmentVersion = CompanyEnricher.CurrentVersion;

        await db.SaveChangesAsync();
        return company;
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
