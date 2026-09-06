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
            var toEnrich = await _sponsorStore.GetUnEnrichedAsync(10, CompanyEnricher.CurrentVersion);

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

    [HttpPost("retry-low-confidence")]
    public async Task<IActionResult> RetryLowConfidence()
    {
        if (CheckAdmin() is { } err) return err;
        try
        {
            var toRetry = await _sponsorStore.GetLowConfidenceAsync(10, CompanyEnricher.CurrentVersion);
            if (toRetry.Count == 0)
                return Ok(new EnrichResponse { Enriched = 0, Remaining = 0, Message = "No low-confidence companies to retry." });

            var batch = toRetry.ToList();
            await _enricher.EnrichRetryBatchAsync(batch);
            var done = batch.Where(c => c.EnrichmentVersion >= CompanyEnricher.RetryVersion).ToList();
            if (done.Count > 0)
                await _sponsorStore.SaveEnrichmentBatchAsync(done);

            var remaining = await _sponsorStore.CountLowConfidenceAsync(CompanyEnricher.CurrentVersion);
            return Ok(new EnrichResponse
            {
                Enriched  = done.Count,
                Remaining = remaining,
                Message   = $"Retried {done.Count}/{toRetry.Count} with {CompanyEnricher.RetryModel}. {remaining} low-confidence remaining.",
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled exception in RetryLowConfidence");
            return Error(500, $"Internal error: {ex.GetType().Name}: {ex.Message}");
        }
    }

    [HttpPut("companies/{id}")]
    public async Task<IActionResult> UpdateCompany(string id, [FromBody] UpdateCompanyRequest? body)
    {
        if (CheckAdmin() is { } err) return err;
        try
        {
            if (body is null) return Error(400, "request body is required");

            var (edit, validationError) = NormalizeCompanyEdit(body);
            if (validationError is not null) return Error(400, validationError);

            var updated = await _sponsorStore.UpdateCompanyAsync(id, edit!);
            if (updated is null) return Error(404, "Company not found");

            return Ok(updated);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled exception in UpdateCompany");
            return Error(500, $"Internal error: {ex.GetType().Name}: {ex.Message}");
        }
    }

    private const int TextFieldMax  = 200;
    private const int SummaryMax     = 2000;
    private const int WebsiteUrlMax  = 2048;
    private const int TagMax         = 100;
    private const int MaxListItems   = 50;

    // Trims, validates and de-duplicates an admin company edit. Returns
    // (null, message) on the first validation failure, otherwise (edit, null).
    internal static (CompanyEdit? edit, string? error) NormalizeCompanyEdit(UpdateCompanyRequest body)
    {
        static string? Clean(string? v)
        {
            if (string.IsNullOrWhiteSpace(v)) return null;
            return v.Trim();
        }

        static (string? value, string? error) Bounded(string? v, string field, int max)
        {
            var cleaned = Clean(v);
            if (cleaned is not null && cleaned.Length > max)
                return (null, $"{field} must not exceed {max} characters");
            return (cleaned, null);
        }

        static (string[]? value, string? error) CleanList(string[]? raw, string field)
        {
            if (raw is null) return (null, null);

            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var result = new List<string>();
            foreach (var item in raw)
            {
                var trimmed = item?.Trim();
                if (string.IsNullOrEmpty(trimmed)) continue;
                if (trimmed.Length > TagMax)
                    return (null, $"{field} entries must not exceed {TagMax} characters");
                if (seen.Add(trimmed)) result.Add(trimmed);
            }
            if (result.Count == 0) return (null, null);
            if (result.Count > MaxListItems)
                return (null, $"{field} must not exceed {MaxListItems} entries");
            return (result.ToArray(), null);
        }

        static (string? value, string? error) CleanUrl(string? v)
        {
            var cleaned = Clean(v);
            if (cleaned is null) return (null, null);
            if (cleaned.Length > WebsiteUrlMax)
                return (null, $"websiteUrl must not exceed {WebsiteUrlMax} characters");
            if (!Uri.TryCreate(cleaned, UriKind.Absolute, out var uri) ||
                (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
                return (null, "websiteUrl must be a valid http(s) URL");
            return (uri.ToString(), null);
        }

        // Name is the one field that cannot be cleared: omitted / null keeps the
        // current name, but a blank string is a mistake, not a "clear this".
        string? name = null;
        if (body.Name is not null)
        {
            name = body.Name.Trim();
            if (name.Length == 0) return (null, "name must not be blank");
            if (name.Length > TextFieldMax)
                return (null, $"name must not exceed {TextFieldMax} characters");
        }

        var (summary, e1) = Bounded(body.Summary, "summary", SummaryMax);
        if (e1 is not null) return (null, e1);
        var (city, e2) = Bounded(body.City, "city", TextFieldMax);
        if (e2 is not null) return (null, e2);
        var (websiteUrl, e3) = CleanUrl(body.WebsiteUrl);
        if (e3 is not null) return (null, e3);
        var (coreIndustry, e4) = Bounded(body.CoreIndustry, "coreIndustry", TextFieldMax);
        if (e4 is not null) return (null, e4);
        var (workingLanguage, e5) = Bounded(body.WorkingLanguage, "workingLanguage", TextFieldMax);
        if (e5 is not null) return (null, e5);
        var (companySize, e6) = Bounded(body.CompanySize, "companySize", TextFieldMax);
        if (e6 is not null) return (null, e6);
        var (remotePolicy, e7) = Bounded(body.RemotePolicy, "remotePolicy", TextFieldMax);
        if (e7 is not null) return (null, e7);
        var (parentCompanyName, e8) = Bounded(body.ParentCompanyName, "parentCompanyName", TextFieldMax);
        if (e8 is not null) return (null, e8);
        var (targetMarket, e9) = Bounded(body.TargetMarket, "targetMarket", TextFieldMax);
        if (e9 is not null) return (null, e9);
        var (locations, e10) = CleanList(body.Locations, "locations");
        if (e10 is not null) return (null, e10);
        var (techStackTags, e11) = CleanList(body.TechStackTags, "techStackTags");
        if (e11 is not null) return (null, e11);
        var (functionalTags, e12) = CleanList(body.FunctionalTags, "functionalTags");
        if (e12 is not null) return (null, e12);

        return (new CompanyEdit(
            Summary:           summary,
            City:              city,
            Locations:         locations,
            WebsiteUrl:        websiteUrl,
            CoreIndustry:      coreIndustry,
            TechStackTags:     techStackTags,
            FunctionalTags:    functionalTags,
            WorkingLanguage:   workingLanguage,
            CompanySize:       companySize,
            RemotePolicy:      remotePolicy,
            ParentCompanyName: parentCompanyName,
            TargetMarket:      targetMarket,
            Name:              name), null);
    }

    [HttpGet("companies/{id}/merged")]
    public async Task<IActionResult> GetMergedCompanies(string id)
    {
        if (CheckAdmin() is { } err) return err;
        try
        {
            if (await _sponsorStore.GetAsync(id) is null) return Error(404, "Company not found");
            return Ok((await _sponsorStore.GetMergedIntoAsync(id)).ToArray());
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled exception in GetMergedCompanies");
            return Error(500, $"Internal error: {ex.GetType().Name}: {ex.Message}");
        }
    }

    [HttpPost("companies/merge")]
    public async Task<IActionResult> MergeCompanies([FromBody] MergeCompaniesRequest? body)
    {
        if (CheckAdmin() is { } err) return err;
        try
        {
            var (targetId, sourceIds, validationError) = NormalizeMerge(body);
            if (validationError is not null) return Error(400, validationError);

            var (result, mergeError) = await _sponsorStore.MergeCompaniesAsync(targetId!, sourceIds!);
            if (mergeError is not null)
                return Error(mergeError.Contains("not found") ? 404 : 400, mergeError);

            _logger.LogInformation(
                "Admin merged {Count} companies into {TargetId} — applications moved: {Apps}, list entries moved: {Moved}, dropped: {Dropped}",
                result!.MergedIds.Length, targetId, result.MovedApplications, result.MovedListEntries, result.DroppedListEntries);

            return Ok(new MergeCompaniesResponse
            {
                Target             = result.Target,
                MergedIds          = result.MergedIds,
                MovedApplications  = result.MovedApplications,
                MovedListEntries   = result.MovedListEntries,
                DroppedListEntries = result.DroppedListEntries,
                Message            = $"Merged {result.MergedIds.Length} " +
                                     $"{(result.MergedIds.Length == 1 ? "company" : "companies")} into {result.Target.Name}.",
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled exception in MergeCompanies");
            return Error(500, $"Internal error: {ex.GetType().Name}: {ex.Message}");
        }
    }

    [HttpPost("companies/{id}/unmerge")]
    public async Task<IActionResult> UnmergeCompany(string id)
    {
        if (CheckAdmin() is { } err) return err;
        try
        {
            var (restored, error) = await _sponsorStore.UnmergeCompanyAsync(id);
            if (error is not null) return Error(error == "Company not found" ? 404 : 400, error);

            _logger.LogInformation("Admin unmerged company {CompanyId}", id);
            return Ok(restored);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled exception in UnmergeCompany");
            return Error(500, $"Internal error: {ex.GetType().Name}: {ex.Message}");
        }
    }

    // Trims and validates a merge request: a target, at least one source, no
    // duplicates, and the target never merged into itself.
    internal static (string? targetId, string[]? sourceIds, string? error) NormalizeMerge(MergeCompaniesRequest? body)
    {
        if (body is null) return (null, null, "request body is required");

        var targetId = body.TargetId?.Trim();
        if (string.IsNullOrEmpty(targetId)) return (null, null, "targetId is required");

        var seen = new HashSet<string>(StringComparer.Ordinal);
        var sourceIds = new List<string>();
        foreach (var raw in body.SourceIds ?? [])
        {
            var sourceId = raw?.Trim();
            if (string.IsNullOrEmpty(sourceId)) continue;
            if (sourceId == targetId)
                return (null, null, "a company cannot be merged into itself");
            if (seen.Add(sourceId)) sourceIds.Add(sourceId);
        }

        if (sourceIds.Count == 0) return (null, null, "sourceIds must contain at least one company");
        if (sourceIds.Count > SponsorStore.MaxMergeSources)
            return (null, null, $"at most {SponsorStore.MaxMergeSources} companies can be merged at once");

        return (targetId, sourceIds.ToArray(), null);
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
