using backend.Models;
using backend.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;

namespace backend.Functions;

public sealed class MonthlyIndSponsorSyncFunction
{
    private readonly IndSponsorScraper _scraper;
    private readonly SponsorStore _store;
    private readonly CompanyEnricher _enricher;

    public MonthlyIndSponsorSyncFunction(IndSponsorScraper scraper, SponsorStore store, CompanyEnricher enricher)
    {
        _scraper = scraper;
        _store = store;
        _enricher = enricher;
    }

    [Function("MonthlyIndSponsorSync")]
    public async Task Run(
        [TimerTrigger("0 0 0 20 * *")] TimerInfo timerInfo,
        FunctionContext context)
    {
        var logger = context.GetLogger<MonthlyIndSponsorSyncFunction>();
        logger.LogInformation("IND sponsor sync started at {Timestamp}", DateTimeOffset.UtcNow);

        IReadOnlyList<backend.Models.SponsorCompany> freshCompanies;
        try
        {
            freshCompanies = await _scraper.FetchAsync();
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to fetch IND sponsor register");
            return;
        }

        var existing = (await _store.GetAllAsync()).ToDictionary(c => c.Id);
        var freshIds = freshCompanies.Select(c => c.Id).ToHashSet();

        var added   = 0;
        var updated = 0;

        foreach (var company in freshCompanies)
        {
            if (existing.TryGetValue(company.Id, out var prev))
            {
                company.Summary           = prev.Summary;
                company.CoreIndustry      = prev.CoreIndustry;
                company.TechStackTags     = prev.TechStackTags;
                company.FunctionalTags    = prev.FunctionalTags;
                company.WorkingLanguage   = prev.WorkingLanguage;
                company.CompanySize       = prev.CompanySize;
                company.RemotePolicy      = prev.RemotePolicy;
                company.ParentCompanyName = prev.ParentCompanyName;
                company.WebsiteUrl        = prev.WebsiteUrl;
                company.TargetMarket      = prev.TargetMarket;
                company.EnrichedAt        = prev.EnrichedAt;
                company.EnrichmentVersion = prev.EnrichmentVersion;
                // Clear soft-delete if it was previously removed and has now returned
                company.RemovedAt = null;
                updated++;
            }
            else
            {
                added++;
            }
        }

        await _store.UpsertAllAsync(freshCompanies);

        // Soft-delete companies that are no longer in the IND register
        var removedIds = existing.Keys
            .Where(id => !freshIds.Contains(id) && existing[id].RemovedAt == null)
            .ToList();
        await _store.SoftDeleteRemovedAsync(removedIds);
        var removed = removedIds.Count;

        logger.LogInformation(
            "Sync complete — added: {Added}, updated: {Updated}, removed: {Removed}, total: {Total}",
            added, updated, removed, freshCompanies.Count);

        var toEnrich = freshCompanies
            .Where(c => c.EnrichmentVersion < CompanyEnricher.CurrentVersion)
            .ToList();

        var enriched = 0;

        if (toEnrich.Count > 0)
        {
            logger.LogInformation("Enriching {Count} companies via LLM (batch mode)", toEnrich.Count);

            var batches = toEnrich
                .Select((c, i) => (c, i))
                .GroupBy(x => x.i / 20)
                .Select(g => g.Select(x => x.c).ToList())
                .ToList();

            await Parallel.ForEachAsync(
                batches,
                new ParallelOptions { MaxDegreeOfParallelism = 5 },
                async (batch, ct) =>
                {
                    var count = await _enricher.EnrichBatchAsync(batch, ct);
                    Interlocked.Add(ref enriched, count);
                });

            foreach (var company in toEnrich.Where(c => c.EnrichmentVersion >= CompanyEnricher.CurrentVersion))
                await _store.UpsertAsync(company);
        }

        await _store.LogSyncAsync(new SyncLog
        {
            TriggerSource  = "monthly",
            Added          = added,
            Updated        = updated,
            Removed        = removed,
            Enriched       = enriched,
            TotalAfterSync = freshCompanies.Count,
        });

        logger.LogInformation(
            "Enrichment complete — enriched: {Enriched} of {Total}",
            enriched, toEnrich.Count);
    }
}
