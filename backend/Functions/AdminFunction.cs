using System.Net;
using System.Text.Json;
using backend.Models;
using backend.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;

namespace backend.Functions;

public sealed class AdminFunction
{
    private readonly TokenService       _tokens;
    private readonly UserStore          _users;
    private readonly SponsorStore       _sponsorStore;
    private readonly IndSponsorScraper  _scraper;
    private readonly CompanyEnricher    _enricher;
    private readonly ILogger<AdminFunction> _logger;

    public AdminFunction(
        TokenService tokens,
        UserStore users,
        SponsorStore sponsorStore,
        IndSponsorScraper scraper,
        CompanyEnricher enricher,
        ILogger<AdminFunction> logger)
    {
        _tokens       = tokens;
        _users        = users;
        _sponsorStore = sponsorStore;
        _scraper      = scraper;
        _enricher     = enricher;
        _logger       = logger;
    }

    // GET /api/admin/users
    [Function("AdminListUsers")]
    public async Task<HttpResponseData> ListUsers(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", "options", Route = "admin/users")]
        HttpRequestData req)
    {
        if (IsOptions(req)) return Cors(req, HttpStatusCode.OK);
        if (!IsAdmin(req, out var forbidden)) return forbidden!;

        var users = await _users.GetAllAsync();
        var summaries = users.Select(u => new AdminUserSummary
        {
            UserId        = u.UserId,
            Email         = u.Email,
            FirstName     = u.FirstName,
            LastName      = u.LastName,
            Role          = u.Role,
            EmailVerified = u.EmailVerified,
            CreatedAt     = u.CreatedAt,
        }).ToArray();

        return await JsonOk(req, summaries, AppJsonSerializerContext.Default.AdminUserSummaryArray);
    }

    // POST /api/admin/promote
    [Function("AdminPromote")]
    public async Task<HttpResponseData> Promote(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", "options", Route = "admin/promote")]
        HttpRequestData req)
    {
        if (IsOptions(req)) return Cors(req, HttpStatusCode.OK);
        if (!IsAdmin(req, out var forbidden)) return forbidden!;

        PromoteRequest? body = null;
        try { body = await JsonSerializer.DeserializeAsync(req.Body, AppJsonSerializerContext.Default.PromoteRequest); }
        catch { /* malformed JSON */ }

        if (string.IsNullOrWhiteSpace(body?.Email))
            return await ErrorResponse(req, HttpStatusCode.BadRequest, "email is required");

        var target = await _users.GetByEmailAsync(body.Email.Trim().ToLowerInvariant());
        if (target is null)
            return await ErrorResponse(req, HttpStatusCode.NotFound, "User not found");

        target.Role = "admin";
        await _users.UpdateAsync(target);

        var summary = new AdminUserSummary
        {
            UserId        = target.UserId,
            Email         = target.Email,
            FirstName     = target.FirstName,
            LastName      = target.LastName,
            Role          = target.Role,
            EmailVerified = target.EmailVerified,
            CreatedAt     = target.CreatedAt,
        };

        return await JsonOk(req, summary, AppJsonSerializerContext.Default.AdminUserSummary);
    }

    // POST /api/admin/reload-sponsors
    [Function("AdminReloadSponsors")]
    public async Task<HttpResponseData> ReloadSponsors(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", "options", Route = "admin/reload-sponsors")]
        HttpRequestData req)
    {
        if (IsOptions(req)) return Cors(req, HttpStatusCode.OK);
        if (!IsAdmin(req, out var forbidden)) return forbidden!;

        IReadOnlyList<SponsorCompany> freshCompanies;
        try
        {
            freshCompanies = await _scraper.FetchAsync();
        }
        catch (Exception ex)
        {
            return await ErrorResponse(req, HttpStatusCode.BadGateway,
                $"Failed to fetch IND sponsor register: {ex.Message}");
        }

        var existing = (await _sponsorStore.GetAllAsync()).ToDictionary(c => c.Id);
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
                company.RemovedAt         = null;
                updated++;
            }
            else
            {
                added++;
            }
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

        var toEnrich = freshCompanies
            .Where(c => c.EnrichmentVersion < CompanyEnricher.CurrentVersion)
            .ToList();
        var enriched = 0;

        if (toEnrich.Count > 0)
        {
            var batches = toEnrich
                .Select((c, i) => (c, i))
                .GroupBy(x => x.i / 20)
                .Select(g => g.Select(x => x.c).ToList())
                .ToList();

            var cts = new CancellationTokenSource();
            await Parallel.ForEachAsync(
                batches,
                new ParallelOptions { MaxDegreeOfParallelism = 5, CancellationToken = cts.Token },
                async (batch, ct) =>
                {
                    var count = await _enricher.EnrichBatchAsync(batch, ct);
                    Interlocked.Add(ref enriched, count);
                });

            foreach (var company in toEnrich.Where(c => c.EnrichmentVersion >= CompanyEnricher.CurrentVersion))
                await _sponsorStore.UpsertAsync(company);
        }

        await _sponsorStore.LogSyncAsync(new SyncLog
        {
            TriggerSource  = "admin",
            Added          = added,
            Updated        = updated,
            Removed        = removed,
            Enriched       = enriched,
            TotalAfterSync = freshCompanies.Count,
        });

        var result = new MessageResponse
        {
            Message = $"Sync complete — added: {added}, updated: {updated}, removed: {removed}, total: {freshCompanies.Count}, enriched: {enriched}"
        };

        return await JsonOk(req, result, AppJsonSerializerContext.Default.MessageResponse);
    }

    // GET /api/admin/sync-logs
    [Function("AdminSyncLogs")]
    public async Task<HttpResponseData> GetSyncLogs(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", "options", Route = "admin/sync-logs")]
        HttpRequestData req)
    {
        if (IsOptions(req)) return Cors(req, HttpStatusCode.OK);
        if (!IsAdmin(req, out var forbidden)) return forbidden!;

        var logs = await _sponsorStore.GetSyncLogsAsync();
        return await JsonOk(req, logs.ToArray(), AppJsonSerializerContext.Default.SyncLogArray);
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private bool IsAdmin(HttpRequestData req, out HttpResponseData? response)
    {
        req.Headers.TryGetValues("Authorization", out var authValues);
        var bearer = authValues?.FirstOrDefault();

        if (!_tokens.ValidateToken(bearer))
        {
            response = ErrorResponse(req, HttpStatusCode.Unauthorized, "Authentication required").GetAwaiter().GetResult();
            return false;
        }

        if (_tokens.GetRole(bearer) != "admin")
        {
            response = ErrorResponse(req, HttpStatusCode.Forbidden, "Admin access required").GetAwaiter().GetResult();
            return false;
        }

        response = null;
        return true;
    }

    private static bool IsOptions(HttpRequestData req) =>
        req.Method.Equals("OPTIONS", StringComparison.OrdinalIgnoreCase);

    private static HttpResponseData Cors(HttpRequestData req, HttpStatusCode status)
    {
        var res = req.CreateResponse(status);
        AuthFunction.AddCors(res);
        return res;
    }

    private static async Task<HttpResponseData> ErrorResponse(
        HttpRequestData req, HttpStatusCode status, string message)
    {
        var res = req.CreateResponse(status);
        AuthFunction.AddCors(res);
        res.Headers.TryAddWithoutValidation("Content-Type", "application/json; charset=utf-8");
        await res.WriteStringAsync(JsonSerializer.Serialize(
            new ErrorResponse { Message = message }, AppJsonSerializerContext.Default.ErrorResponse));
        return res;
    }

    private static async Task<HttpResponseData> JsonOk<T>(
        HttpRequestData req, T value,
        System.Text.Json.Serialization.Metadata.JsonTypeInfo<T> typeInfo,
        HttpStatusCode status = HttpStatusCode.OK)
    {
        var res = req.CreateResponse(status);
        AuthFunction.AddCors(res);
        res.Headers.TryAddWithoutValidation("Content-Type", "application/json; charset=utf-8");
        await res.WriteStringAsync(JsonSerializer.Serialize(value, typeInfo));
        return res;
    }
}
