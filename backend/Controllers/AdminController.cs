using backend.Models;
using backend.Services;
using Microsoft.AspNetCore.Mvc;

namespace backend.Controllers;

[Route("api/mgmt")]
public sealed class AdminController : ApiControllerBase
{
    private readonly TokenService _tokens;
    private readonly UserStore _users;
    private readonly SponsorStore _sponsorStore;
    private readonly IndSponsorScraper _scraper;
    private readonly CompanyEnricher _enricher;
    private readonly ILogger<AdminController> _logger;

    public AdminController(
        TokenService tokens,
        UserStore users,
        SponsorStore sponsorStore,
        IndSponsorScraper scraper,
        CompanyEnricher enricher,
        ILogger<AdminController> logger)
    {
        _tokens = tokens;
        _users = users;
        _sponsorStore = sponsorStore;
        _scraper = scraper;
        _enricher = enricher;
        _logger = logger;
    }

    private IActionResult? CheckAdmin()
    {
        var bearer = GetBearerToken();
        if (!_tokens.ValidateToken(bearer)) return Error(401, "Authentication required");
        if (_tokens.GetRole(bearer) != "admin") return Error(403, "Admin access required");
        return null;
    }

    [HttpGet("users")]
    public async Task<IActionResult> ListUsers()
    {
        if (CheckAdmin() is { } err) return err;
        try
        {
            var users = await _users.GetAllAsync();
            return Ok(users.Select(u => new AdminUserSummary
            {
                UserId = u.UserId,
                Email = u.Email,
                FirstName = u.FirstName,
                LastName = u.LastName,
                Role = u.Role,
                EmailVerified = u.EmailVerified,
                CreatedAt = u.CreatedAt,
            }).ToArray());
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled exception in ListUsers");
            return Error(500, $"Internal error: {ex.GetType().Name}: {ex.Message}");
        }
    }

    [HttpPost("promote")]
    public async Task<IActionResult> Promote([FromBody] PromoteRequest? body)
    {
        if (CheckAdmin() is { } err) return err;
        try
        {
            if (string.IsNullOrWhiteSpace(body?.Email))
                return Error(400, "email is required");

            var target = await _users.GetByEmailAsync(body.Email.Trim().ToLowerInvariant());
            if (target is null) return Error(404, "User not found");

            target.Role = "admin";
            await _users.UpdateAsync(target);

            return Ok(new AdminUserSummary
            {
                UserId = target.UserId,
                Email = target.Email,
                FirstName = target.FirstName,
                LastName = target.LastName,
                Role = target.Role,
                EmailVerified = target.EmailVerified,
                CreatedAt = target.CreatedAt,
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled exception in Promote");
            return Error(500, $"Internal error: {ex.GetType().Name}: {ex.Message}");
        }
    }

    [HttpPost("reload-sponsors")]
    public async Task<IActionResult> ReloadSponsors()
    {
        if (CheckAdmin() is { } err) return err;
        try
        {
            IReadOnlyList<SponsorCompany> freshCompanies;
            try { freshCompanies = await _scraper.FetchAsync(); }
            catch (Exception ex)
            { return Error(502, $"Failed to fetch IND sponsor register: {ex.Message}"); }

            var existing = (await _sponsorStore.GetAllAsync()).ToDictionary(c => c.Id);
            var freshIds = freshCompanies.Select(c => c.Id).ToHashSet();
            var added = 0; var updated = 0;

            foreach (var company in freshCompanies)
            {
                if (existing.TryGetValue(company.Id, out var prev))
                {
                    company.Summary = prev.Summary;
                    company.CoreIndustry = prev.CoreIndustry;
                    company.TechStackTags = prev.TechStackTags;
                    company.FunctionalTags = prev.FunctionalTags;
                    company.WorkingLanguage = prev.WorkingLanguage;
                    company.CompanySize = prev.CompanySize;
                    company.RemotePolicy = prev.RemotePolicy;
                    company.ParentCompanyName = prev.ParentCompanyName;
                    company.WebsiteUrl = prev.WebsiteUrl;
                    company.TargetMarket = prev.TargetMarket;
                    company.EnrichedAt = prev.EnrichedAt;
                    company.EnrichmentVersion = prev.EnrichmentVersion;
                    company.RemovedAt = null;
                    updated++;
                }
                else added++;
            }

            await _sponsorStore.UpsertAllAsync(freshCompanies);

            var removedIds = existing.Keys
                .Where(id => !freshIds.Contains(id) && existing[id].RemovedAt == null)
                .ToList();
            await _sponsorStore.SoftDeleteRemovedAsync(removedIds);
            var removed = removedIds.Count;

            _logger.LogInformation(
                "Admin reload complete — added: {Added}, updated: {Updated}, removed: {Removed}, total: {Total}",
                added, updated, removed, freshCompanies.Count);

            await _sponsorStore.LogSyncAsync(new SyncLog
            {
                TriggerSource = "admin",
                Added = added,
                Updated = updated,
                Removed = removed,
                Enriched = 0,
                TotalAfterSync = freshCompanies.Count,
            });

            var unenriched = await _sponsorStore.CountUnEnrichedAsync(CompanyEnricher.CurrentVersion);
            return Ok(new MessageResponse
            {
                Message = $"Sync complete — added: {added}, updated: {updated}, removed: {removed}, total: {freshCompanies.Count}. {unenriched} companies pending enrichment — use Enrich button."
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled exception in ReloadSponsors");
            return Error(500, $"Internal error: {ex.GetType().Name}: {ex.Message}");
        }
    }

    [HttpPost("enrich-sponsors")]
    public async Task<IActionResult> EnrichSponsors()
    {
        if (CheckAdmin() is { } err) return err;
        try
        {
            const int PageSize = 500;
            var toEnrich = await _sponsorStore.GetUnEnrichedAsync(PageSize, CompanyEnricher.CurrentVersion);

            if (toEnrich.Count == 0)
                return Ok(new MessageResponse { Message = "All companies are already enriched." });

            var enriched = 0;
            var saveLock = new SemaphoreSlim(1, 1);

            await Parallel.ForEachAsync(
                toEnrich.Chunk(20),
                new ParallelOptions { MaxDegreeOfParallelism = 5 },
                async (batch, ct) =>
                {
                    var batchList = batch.ToList();
                    await _enricher.EnrichBatchAsync(batchList, ct);
                    await saveLock.WaitAsync(ct);
                    try
                    {
                        var done = batchList.Where(c => c.EnrichmentVersion >= CompanyEnricher.CurrentVersion).ToList();
                        if (done.Count > 0)
                        {
                            await _sponsorStore.SaveEnrichmentBatchAsync(done);
                            Interlocked.Add(ref enriched, done.Count);
                        }
                    }
                    finally { saveLock.Release(); }
                });

            var remaining = await _sponsorStore.CountUnEnrichedAsync(CompanyEnricher.CurrentVersion);
            return Ok(new MessageResponse { Message = $"Enriched {enriched}/{toEnrich.Count} companies. {remaining} remaining." });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled exception in EnrichSponsors");
            return Error(500, $"Internal error: {ex.GetType().Name}: {ex.Message}");
        }
    }

    [HttpGet("sync-logs")]
    public async Task<IActionResult> GetSyncLogs()
    {
        if (CheckAdmin() is { } err) return err;
        try
        {
            var logs = await _sponsorStore.GetSyncLogsAsync();
            return Ok(logs.ToArray());
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled exception in GetSyncLogs");
            return Error(500, $"Internal error: {ex.GetType().Name}: {ex.Message}");
        }
    }
}
