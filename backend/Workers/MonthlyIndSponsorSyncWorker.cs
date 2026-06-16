using backend.Models;
using backend.Services;
using Microsoft.Extensions.DependencyInjection;

namespace backend.Workers;

public sealed class MonthlyIndSponsorSyncWorker : BackgroundService
{
    private readonly IndSponsorScraper _scraper;
    private readonly CompanyEnricher _enricher;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<MonthlyIndSponsorSyncWorker> _logger;

    public MonthlyIndSponsorSyncWorker(
        IndSponsorScraper scraper,
        CompanyEnricher enricher,
        IServiceScopeFactory scopeFactory,
        ILogger<MonthlyIndSponsorSyncWorker> logger)
    {
        _scraper = scraper;
        _enricher = enricher;
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var delay = GetDelayUntilNextSync();
            _logger.LogInformation("Next IND sync scheduled in {Delay:g}", delay);
            try { await Task.Delay(delay, stoppingToken); }
            catch (OperationCanceledException) { break; }
            if (stoppingToken.IsCancellationRequested) break;
            await RunSyncAsync(stoppingToken);
        }
    }

    private static TimeSpan GetDelayUntilNextSync()
    {
        var now  = DateTimeOffset.UtcNow;
        var next = new DateTimeOffset(now.Year, now.Month, 20, 0, 0, 0, TimeSpan.Zero);
        if (next <= now) next = next.AddMonths(1);
        return next - now;
    }

    private async Task RunSyncAsync(CancellationToken ct)
    {
        _logger.LogInformation("IND sponsor sync started at {Timestamp}", DateTimeOffset.UtcNow);

        IReadOnlyList<SponsorCompany> freshCompanies;
        try { freshCompanies = await _scraper.FetchAsync(); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to fetch IND sponsor register");
            return;
        }

        using var scope = _scopeFactory.CreateScope();
        var store = scope.ServiceProvider.GetRequiredService<backend.Services.SponsorStore>();

        var existing = (await store.GetAllAsync()).ToDictionary(c => c.Id);
        var freshIds = freshCompanies.Select(c => c.Id).ToHashSet();
        var added = 0; var updated = 0;

        foreach (var company in freshCompanies)
        {
            if (existing.TryGetValue(company.Id, out var prev))
            {
                company.Summary          = prev.Summary;
                company.CoreIndustry     = prev.CoreIndustry;
                company.TechStackTags    = prev.TechStackTags;
                company.FunctionalTags   = prev.FunctionalTags;
                company.WorkingLanguage  = prev.WorkingLanguage;
                company.CompanySize      = prev.CompanySize;
                company.RemotePolicy     = prev.RemotePolicy;
                company.ParentCompanyName = prev.ParentCompanyName;
                company.WebsiteUrl       = prev.WebsiteUrl;
                company.TargetMarket     = prev.TargetMarket;
                company.EnrichedAt       = prev.EnrichedAt;
                company.EnrichmentVersion = prev.EnrichmentVersion;
                company.RemovedAt        = null;
                updated++;
            }
            else added++;
        }

        await store.UpsertAllAsync(freshCompanies);

        var removedIds = existing.Keys
            .Where(id => !freshIds.Contains(id) && existing[id].RemovedAt == null)
            .ToList();
        await store.SoftDeleteRemovedAsync(removedIds);
        var removed = removedIds.Count;

        _logger.LogInformation(
            "Sync complete — added: {Added}, updated: {Updated}, removed: {Removed}, total: {Total}",
            added, updated, removed, freshCompanies.Count);

        var toEnrich = freshCompanies
            .Where(c => c.EnrichmentVersion < CompanyEnricher.CurrentVersion)
            .ToList();

        var enriched = 0;
        if (toEnrich.Count > 0)
        {
            _logger.LogInformation("Enriching {Count} companies via LLM (batch mode)", toEnrich.Count);
            var saveLock = new SemaphoreSlim(1, 1);

            await Parallel.ForEachAsync(
                toEnrich.Chunk(20),
                new ParallelOptions { MaxDegreeOfParallelism = 5, CancellationToken = ct },
                async (batch, batchCt) =>
                {
                    var batchList = batch.ToList();
                    await _enricher.EnrichBatchAsync(batchList, batchCt);
                    await saveLock.WaitAsync(batchCt);
                    try
                    {
                        var done = batchList.Where(c => c.EnrichmentVersion >= CompanyEnricher.CurrentVersion).ToList();
                        if (done.Count > 0)
                        {
                            await store.SaveEnrichmentBatchAsync(done);
                            Interlocked.Add(ref enriched, done.Count);
                        }
                    }
                    finally { saveLock.Release(); }
                });
        }

        await store.LogSyncAsync(new SyncLog
        {
            TriggerSource  = "monthly",
            Added          = added,
            Updated        = updated,
            Removed        = removed,
            Enriched       = enriched,
            TotalAfterSync = freshCompanies.Count,
        });

        _logger.LogInformation(
            "Enrichment complete — enriched: {Enriched} of {Total}", enriched, toEnrich.Count);
    }
}
