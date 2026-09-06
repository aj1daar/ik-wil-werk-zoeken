using backend.Data;
using backend.Models;
using Microsoft.EntityFrameworkCore;

namespace backend.Services;

public sealed class SponsorStore(AppDbContext db)
{
    // Companies carrying aliases, loaded at most once per scope. Dropped whenever
    // this store changes a name, a merge or an unmerge.
    private List<SponsorCompany>? _aliasCache;

    public async Task<IReadOnlyList<SponsorCompany>> GetAllAsync() =>
        await db.Sponsors.ToListAsync();

    public async Task<IReadOnlyList<SponsorCompany>> GetActiveAsync() =>
        await db.Sponsors
            .Where(c => c.RemovedAt == null && c.MergedIntoId == null)
            .OrderBy(c => c.Name)
            .ToListAsync();

    public async Task<SponsorCompany?> GetAsync(string id) =>
        await db.Sponsors.FindAsync(id);

    // Every company that was merged into the given one, newest name first.
    public async Task<IReadOnlyList<SponsorCompany>> GetMergedIntoAsync(string targetId) =>
        await db.Sponsors.Where(c => c.MergedIntoId == targetId).OrderBy(c => c.Name).ToListAsync();

    // Resolves a free-text company name to a live company. Falls back to the
    // alias list so a name the company used before a rename — or the name of a
    // duplicate that was merged away — still finds the surviving company.
    public async Task<SponsorCompany?> FindByNameAsync(string name)
    {
        var trimmed = name.Trim().ToLower();
        if (trimmed.Length == 0) return null;

        var exact = await db.Sponsors.FirstOrDefaultAsync(c =>
            c.RemovedAt == null && c.MergedIntoId == null && c.Name.ToLower() == trimmed);
        if (exact is not null) return exact;

        // Only renamed/merged companies carry aliases, so this set stays small.
        // Matched in memory because a case-insensitive array match does not
        // translate to SQL on every provider. Cached for the lifetime of the
        // store — one scope, i.e. one request — because listing applications
        // resolves a name per row.
        _aliasCache ??= await db.Sponsors
            .Where(c => c.RemovedAt == null && c.MergedIntoId == null && c.AliasNames != null)
            .ToListAsync();

        return _aliasCache.FirstOrDefault(c =>
            c.AliasNames!.Any(a => string.Equals(a.Trim(), trimmed, StringComparison.OrdinalIgnoreCase)));
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
            .Where(c => c.RemovedAt == null && c.MergedIntoId == null && c.EnrichmentVersion < belowVersion)
            .OrderBy(c => c.Name)
            .Take(limit)
            .ToListAsync();

    public async Task<int> CountUnEnrichedAsync(int belowVersion) =>
        await db.Sponsors
            .CountAsync(c => c.RemovedAt == null && c.MergedIntoId == null && c.EnrichmentVersion < belowVersion);

    public async Task<IReadOnlyList<SponsorCompany>> GetLowConfidenceAsync(int limit, int version) =>
        await db.Sponsors
            .Where(c => c.RemovedAt == null && c.MergedIntoId == null && c.EnrichmentVersion == version && c.Summary == null)
            .OrderBy(c => c.Name)
            .Take(limit)
            .ToListAsync();

    public async Task<int> CountLowConfidenceAsync(int version) =>
        await db.Sponsors
            .CountAsync(c => c.RemovedAt == null && c.MergedIntoId == null && c.EnrichmentVersion == version && c.Summary == null);

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

        // A rename keeps the old name as an alias, so applications already saved
        // under it still resolve to this company.
        if (edit.Name is not null && !string.Equals(edit.Name, company.Name, StringComparison.Ordinal))
        {
            company.AliasNames = MergeAliases(company.AliasNames, [company.Name], edit.Name);
            company.Name       = edit.Name;
        }

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
        _aliasCache = null;
        return company;
    }

    // ── merge / unmerge ──────────────────────────────────────────────────────

    public const int MaxMergeSources = 50;

    // Folds one or more duplicate companies into a surviving company. Nothing is
    // deleted: each source keeps its own row with MergedIntoId set, which hides it
    // from the register, keeps the monthly IND sync from re-creating it, and makes
    // the merge undoable. The target absorbs the source names as aliases, and every
    // application link and user list entry is re-pointed at the target.
    public async Task<(MergeResult? result, string? error)> MergeCompaniesAsync(
        string targetId, IReadOnlyList<string> sourceIds)
    {
        var target = await db.Sponsors.FindAsync(targetId);
        if (target is null) return (null, "Target company not found");
        if (target.MergedIntoId is not null)
            return (null, "Target company was itself merged into another company — unmerge it first");
        if (target.RemovedAt is not null)
            return (null, "Target company is no longer in the IND register — pick a live company to merge into");

        var sources = new List<SponsorCompany>(sourceIds.Count);
        foreach (var sourceId in sourceIds)
        {
            var source = await db.Sponsors.FindAsync(sourceId);
            if (source is null) return (null, $"Company not found: {sourceId}");
            if (source.MergedIntoId is not null && source.MergedIntoId != targetId)
                return (null, $"'{source.Name}' is already merged into another company");
            sources.Add(source);
        }

        var sourceIdList = sources.Select(c => c.Id).Distinct(StringComparer.Ordinal).ToArray();
        await using var tx = await db.Database.BeginTransactionAsync();

        var absorbed = sources
            .SelectMany(c => new[] { c.Name }.Concat(c.AliasNames ?? []))
            .ToArray();
        target.AliasNames = MergeAliases(target.AliasNames, absorbed, target.Name);

        foreach (var source in sources) source.MergedIntoId = target.Id;

        // A company previously merged into one of the sources follows it across,
        // so MergedIntoId never forms a chain.
        var grandchildren = await db.Sponsors
            .Where(c => c.MergedIntoId != null && sourceIdList.Contains(c.MergedIntoId!) && c.Id != target.Id)
            .ToListAsync();
        foreach (var child in grandchildren) child.MergedIntoId = target.Id;

        var movedApplications = await db.Stages
            .Where(s => s.SponsorCompanyId != null && sourceIdList.Contains(s.SponsorCompanyId!))
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.SponsorCompanyId, target.Id));

        var (moved, dropped) = await RepointListEntriesAsync(sourceIdList, target.Id);

        await db.SaveChangesAsync();
        await tx.CommitAsync();
        _aliasCache = null;

        return (new MergeResult(
            Target:             target,
            MergedIds:          sourceIdList,
            MovedApplications:  movedApplications,
            MovedListEntries:   moved,
            DroppedListEntries: dropped), null);
    }

    // Moves each user's "interested"/"hidden" entry from a source company to the
    // target. A user who already has an entry for the target keeps that one and the
    // now-duplicate source entry is deleted — the (UserId, SponsorCompanyId) unique
    // index allows only one row per user and company.
    private async Task<(int moved, int dropped)> RepointListEntriesAsync(
        string[] sourceIdList, string targetId)
    {
        var entries = await db.CompanyLists
            .Where(x => sourceIdList.Contains(x.SponsorCompanyId))
            .ToListAsync();
        if (entries.Count == 0) return (0, 0);

        var userIds = entries.Select(x => x.UserId).Distinct(StringComparer.Ordinal).ToArray();
        var takenByUser = await db.CompanyLists
            .Where(x => x.SponsorCompanyId == targetId && userIds.Contains(x.UserId))
            .Select(x => x.UserId)
            .ToListAsync();
        var taken = takenByUser.ToHashSet(StringComparer.Ordinal);

        var moved = 0;
        var dropped = 0;
        foreach (var entry in entries)
        {
            if (taken.Contains(entry.UserId))
            {
                db.CompanyLists.Remove(entry);
                dropped++;
            }
            else
            {
                entry.SponsorCompanyId = targetId;
                taken.Add(entry.UserId);
                moved++;
            }
        }
        return (moved, dropped);
    }

    // Undoes a single merge: the company returns to the register and the names it
    // contributed are dropped from the target's alias list, unless another company
    // still merged into the target contributes the same name. Applications and user
    // lists stay with the target — application sponsor links are resolved by name on
    // every read, so they follow the restored company again on their own.
    public async Task<(SponsorCompany? restored, string? error)> UnmergeCompanyAsync(string sourceId)
    {
        var source = await db.Sponsors.FindAsync(sourceId);
        if (source is null) return (null, "Company not found");
        if (source.MergedIntoId is null) return (null, "Company is not merged into anything");

        var target = await db.Sponsors.FindAsync(source.MergedIntoId);
        if (target is not null)
        {
            var contributed = new[] { source.Name }
                .Concat(source.AliasNames ?? [])
                .Select(n => n.Trim())
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

            var stillContributed = (await db.Sponsors
                    .Where(c => c.MergedIntoId == target.Id && c.Id != source.Id)
                    .ToListAsync())
                .SelectMany(c => new[] { c.Name }.Concat(c.AliasNames ?? []))
                .Select(n => n.Trim())
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

            var kept = (target.AliasNames ?? [])
                .Where(a => !contributed.Contains(a.Trim()) || stillContributed.Contains(a.Trim()))
                .ToArray();
            target.AliasNames = kept.Length > 0 ? kept : null;
        }

        source.MergedIntoId = null;
        await db.SaveChangesAsync();
        _aliasCache = null;
        return (source, null);
    }

    // Adds names to an alias list: trimmed, blank-filtered, case-insensitively
    // de-duplicated (first spelling wins) and never containing the company's own
    // current name. Returns null rather than an empty array so the column stays NULL.
    internal static string[]? MergeAliases(string[]? existing, IEnumerable<string> additions, string ownName)
    {
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var own = ownName.Trim();
        if (own.Length > 0) seen.Add(own);

        var result = new List<string>();
        foreach (var raw in (existing ?? []).Concat(additions))
        {
            var name = raw?.Trim();
            if (string.IsNullOrEmpty(name)) continue;
            if (seen.Add(name)) result.Add(name);
        }
        return result.Count > 0 ? result.ToArray() : null;
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

public sealed record MergeResult(
    SponsorCompany Target,
    string[] MergedIds,
    int MovedApplications,
    int MovedListEntries,
    int DroppedListEntries);
