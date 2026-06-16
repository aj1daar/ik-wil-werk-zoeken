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

            var newCompanies = freshCompanies.Where(c => !existing.ContainsKey(c.Id)).ToList();
            var added = newCompanies.Count;

            if (newCompanies.Count > 0)
                await _sponsorStore.AddAllAsync(newCompanies);

            var removedIds = existing.Keys
                .Where(id => !freshIds.Contains(id) && existing[id].RemovedAt == null)
                .ToList();
            await _sponsorStore.SoftDeleteRemovedAsync(removedIds);
            var removed = removedIds.Count;

            _logger.LogInformation(
                "Admin reload complete — added: {Added}, removed: {Removed}, total: {Total}",
                added, removed, freshCompanies.Count);

            await _sponsorStore.LogSyncAsync(new SyncLog
            {
                TriggerSource = "admin",
                Added = added,
                Updated = 0,
                Removed = removed,
                Enriched = 0,
                TotalAfterSync = freshCompanies.Count,
            });

            var unenriched = await _sponsorStore.CountUnEnrichedAsync(CompanyEnricher.CurrentVersion);
            return Ok(new MessageResponse
            {
                Message = $"Sync complete — added: {added}, removed: {removed}, total: {freshCompanies.Count}. {unenriched} companies pending enrichment — use Enrich button."
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
            var toEnrich = await _sponsorStore.GetUnEnrichedAsync(20, CompanyEnricher.CurrentVersion);

            if (toEnrich.Count == 0)
                return Ok(new EnrichResponse { Enriched = 0, Remaining = 0, Message = "All companies are already enriched." });

            var batch = toEnrich.ToList();
            await _enricher.EnrichBatchAsync(batch);
            var done = batch.Where(c => c.EnrichmentVersion >= CompanyEnricher.CurrentVersion).ToList();
            if (done.Count > 0)
                await _sponsorStore.SaveEnrichmentBatchAsync(done);

            var remaining = await _sponsorStore.CountUnEnrichedAsync(CompanyEnricher.CurrentVersion);
            return Ok(new EnrichResponse
            {
                Enriched  = done.Count,
                Remaining = remaining,
                Message   = $"Enriched {done.Count}/{toEnrich.Count}. {remaining} remaining.",
            });
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
