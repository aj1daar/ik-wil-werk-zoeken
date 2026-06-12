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

        // Load existing from DB to preserve enrichment data written by previous syncs
        var existing = (await _store.GetAllAsync()).ToDictionary(c => c.Id);

        var added = 0;
        var updated = 0;

        foreach (var company in freshCompanies)
        {
            if (existing.TryGetValue(company.Id, out var prev))
            {
                company.Summary        = prev.Summary;
                company.CoreIndustry   = prev.CoreIndustry;
                company.TechStackTags  = prev.TechStackTags;
                company.FunctionalTags = prev.FunctionalTags;
                company.EnrichedAt     = prev.EnrichedAt;
                updated++;
            }
            else
            {
                added++;
            }
        }

        await _store.UpsertAllAsync(freshCompanies);

        logger.LogInformation(
            "Sync complete — added: {Added}, updated: {Updated}, total: {Total}",
            added, updated, freshCompanies.Count);

        // Enrich companies that have no LLM data yet
        // Parallel HTTP calls are fine; each mutates its own object in memory.
        // DB writes happen sequentially afterwards to avoid DbContext concurrency issues.
        var toEnrich = freshCompanies.Where(c => c.EnrichedAt is null).ToList();

        if (toEnrich.Count == 0)
            return;

        logger.LogInformation("Enriching {Count} unenriched companies via LLM", toEnrich.Count);
        int enriched = 0, enrichFailed = 0;

        await Parallel.ForEachAsync(
            toEnrich,
            new ParallelOptions { MaxDegreeOfParallelism = 5 },
            async (company, ct) =>
            {
                if (await _enricher.EnrichAsync(company, ct))
                    Interlocked.Increment(ref enriched);
                else
                    Interlocked.Increment(ref enrichFailed);
            });

        // Persist enrichment results sequentially (DbContext is not thread-safe)
        foreach (var company in toEnrich.Where(c => c.EnrichedAt is not null))
            await _store.UpsertAsync(company);

        logger.LogInformation(
            "Enrichment complete — enriched: {Enriched}, failed: {EnrichFailed} of {Total}",
            enriched, enrichFailed, toEnrich.Count);
    }
}
