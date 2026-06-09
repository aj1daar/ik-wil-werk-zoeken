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

        IReadOnlyList<backend.Models.SponsorCompany> companies;

        try
        {
            companies = await _scraper.FetchAsync();
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to fetch IND sponsor register");
            return;
        }

        var added = 0;
        var updated = 0;

        foreach (var company in companies)
        {
            // Preserve enrichment data on update — scraper produces unenriched objects
            if (_store.Companies.TryGetValue(company.Id, out var existing))
            {
                company.Summary = existing.Summary;
                company.CoreIndustry = existing.CoreIndustry;
                company.TechStackTags = existing.TechStackTags;
                company.FunctionalTags = existing.FunctionalTags;
                company.EnrichedAt = existing.EnrichedAt;
                updated++;
            }
            else
            {
                added++;
            }
            _store.Companies[company.Id] = company;
        }

        logger.LogInformation(
            "Sync complete — added: {Added}, updated: {Updated}, total in store: {Total}",
            added, updated, _store.Companies.Count);

        // Enrich companies that have no LLM data yet (concurrent, max 5 at a time)
        var toEnrich = _store.Companies.Values
            .Where(c => c.EnrichedAt is null)
            .ToList();

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

        logger.LogInformation(
            "Enrichment complete — enriched: {Enriched}, failed: {EnrichFailed} of {Total}",
            enriched, enrichFailed, toEnrich.Count);
    }
}
