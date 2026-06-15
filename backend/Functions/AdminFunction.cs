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
    private readonly TokenService _tokens;
    private readonly UserStore _users;
    private readonly SponsorStore _sponsorStore;
    private readonly IndSponsorScraper _scraper;
    private readonly CompanyEnricher _enricher;
    private readonly ILogger<AdminFunction> _logger;

    public AdminFunction(
        TokenService tokens,
        UserStore users,
        SponsorStore sponsorStore,
        IndSponsorScraper scraper,
        CompanyEnricher enricher,
        ILogger<AdminFunction> logger)
    {
        _tokens = tokens;
        _users = users;
        _sponsorStore = sponsorStore;
        _scraper = scraper;
        _enricher = enricher;
        _logger = logger;
    }

    // GET /api/admin/users
    [Function("AdminListUsers")]
    public async Task<HttpResponseData> ListUsers(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", "options", Route = "mgmt/users")]
        HttpRequestData req)
    {
        if (IsOptions(req)) return Cors(req, HttpStatusCode.OK);
        if (!IsAdmin(req, out var forbidden)) return forbidden!;

        try
        {
            var users = await _users.GetAllAsync();
            var summaries = users.Select(u => new AdminUserSummary
            {
                UserId = u.UserId,
                Email = u.Email,
                FirstName = u.FirstName,
                LastName = u.LastName,
                Role = u.Role,
                EmailVerified = u.EmailVerified,
                CreatedAt = u.CreatedAt,
            }).ToArray();

            return await JsonOk(req, summaries, AppJsonSerializerContext.Default.AdminUserSummaryArray);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled exception in AdminListUsers");
            return await ErrorResponse(req, HttpStatusCode.InternalServerError,
                $"Internal error: {ex.GetType().Name}: {ex.Message}");
        }
    }

    // POST /api/admin/promote
    [Function("AdminPromote")]
    public async Task<HttpResponseData> Promote(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", "options", Route = "mgmt/promote")]
        HttpRequestData req)
    {
        if (IsOptions(req)) return Cors(req, HttpStatusCode.OK);
        if (!IsAdmin(req, out var forbidden)) return forbidden!;

        try
        {
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
                UserId = target.UserId,
                Email = target.Email,
                FirstName = target.FirstName,
                LastName = target.LastName,
                Role = target.Role,
                EmailVerified = target.EmailVerified,
                CreatedAt = target.CreatedAt,
            };

            return await JsonOk(req, summary, AppJsonSerializerContext.Default.AdminUserSummary);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled exception in AdminPromote");
            return await ErrorResponse(req, HttpStatusCode.InternalServerError,
                $"Internal error: {ex.GetType().Name}: {ex.Message}");
        }
    }

    // POST /api/admin/reload-sponsors
    [Function("AdminReloadSponsors")]
    public async Task<HttpResponseData> ReloadSponsors(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", "options", Route = "mgmt/reload-sponsors")]
        HttpRequestData req)
    {
        if (IsOptions(req)) return Cors(req, HttpStatusCode.OK);
        if (!IsAdmin(req, out var forbidden)) return forbidden!;

        try
        {
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

            var added = 0;
            var updated = 0;

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

            var result = new MessageResponse
            {
                Message = $"Sync complete — added: {added}, updated: {updated}, removed: {removed}, total: {freshCompanies.Count}. {unenriched} companies pending enrichment — use Enrich button."
            };

            return await JsonOk(req, result, AppJsonSerializerContext.Default.MessageResponse);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled exception in AdminReloadSponsors");
            return await ErrorResponse(req, HttpStatusCode.InternalServerError,
                $"Internal error: {ex.GetType().Name}: {ex.Message}");
        }
    }

    // GET /api/admin/sync-logs
    [Function("AdminSyncLogs")]
    public async Task<HttpResponseData> GetSyncLogs(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", "options", Route = "mgmt/sync-logs")]
        HttpRequestData req)
    {
        if (IsOptions(req)) return Cors(req, HttpStatusCode.OK);
        if (!IsAdmin(req, out var forbidden)) return forbidden!;

        try
        {
            var logs = await _sponsorStore.GetSyncLogsAsync();
            return await JsonOk(req, logs.ToArray(), AppJsonSerializerContext.Default.SyncLogArray);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled exception in AdminSyncLogs");
            return await ErrorResponse(req, HttpStatusCode.InternalServerError,
                $"Internal error: {ex.GetType().Name}: {ex.Message}");
        }
    }

    // POST /api/mgmt/enrich-sponsors
    // Enriches the next batch of un-enriched companies and saves progress after every
    // 20-company Gemini batch. Safe to call repeatedly until all companies are enriched.
    [Function("AdminEnrichSponsors")]
    public async Task<HttpResponseData> EnrichSponsors(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", "options", Route = "mgmt/enrich-sponsors")]
        HttpRequestData req)
    {
        if (IsOptions(req)) return Cors(req, HttpStatusCode.OK);
        if (!IsAdmin(req, out var forbidden)) return forbidden!;

        try
        {
            const int PageSize = 500;
            var toEnrich = await _sponsorStore.GetUnEnrichedAsync(PageSize, CompanyEnricher.CurrentVersion);

            if (toEnrich.Count == 0)
            {
                return await JsonOk(req,
                    new MessageResponse { Message = "All companies are already enriched." },
                    AppJsonSerializerContext.Default.MessageResponse);
            }

            var enriched = 0;
            var saveLock = new SemaphoreSlim(1, 1);

            await Parallel.ForEachAsync(
                toEnrich.Chunk(20),
                new ParallelOptions { MaxDegreeOfParallelism = 5 },
                async (batch, ct) =>
                {
                    var batchList = batch.ToList();
                    await _enricher.EnrichBatchAsync(batchList, ct);

                    // Serialize DB saves — ExecuteUpdateAsync bypasses change tracker
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
                    finally
                    {
                        saveLock.Release();
                    }
                });

            var remaining = await _sponsorStore.CountUnEnrichedAsync(CompanyEnricher.CurrentVersion);

            return await JsonOk(req,
                new MessageResponse { Message = $"Enriched {enriched}/{toEnrich.Count} companies. {remaining} remaining." },
                AppJsonSerializerContext.Default.MessageResponse);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled exception in AdminEnrichSponsors");
            return await ErrorResponse(req, HttpStatusCode.InternalServerError,
                $"Internal error: {ex.GetType().Name}: {ex.Message}");
        }
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
