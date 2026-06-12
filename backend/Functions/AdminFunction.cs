using System.Net;
using System.Text.Json;
using backend.Models;
using backend.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;

namespace backend.Functions;

public sealed class AdminFunction
{
    private readonly TokenService       _tokens;
    private readonly UserStore          _users;
    private readonly SponsorStore       _sponsorStore;
    private readonly IndSponsorScraper  _scraper;
    private readonly CompanyEnricher    _enricher;

    public AdminFunction(
        TokenService tokens,
        UserStore users,
        SponsorStore sponsorStore,
        IndSponsorScraper scraper,
        CompanyEnricher enricher)
    {
        _tokens       = tokens;
        _users        = users;
        _sponsorStore = sponsorStore;
        _scraper      = scraper;
        _enricher     = enricher;
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

        var added   = 0;
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

        await _sponsorStore.UpsertAllAsync(freshCompanies);

        var toEnrich = freshCompanies.Where(c => c.EnrichedAt is null).ToList();
        var enriched = 0;

        if (toEnrich.Count > 0)
        {
            await Parallel.ForEachAsync(
                toEnrich,
                new ParallelOptions { MaxDegreeOfParallelism = 5 },
                async (company, ct) =>
                {
                    if (await _enricher.EnrichAsync(company, ct))
                        Interlocked.Increment(ref enriched);
                });

            foreach (var company in toEnrich.Where(c => c.EnrichedAt is not null))
                await _sponsorStore.UpsertAsync(company);
        }

        var result = new MessageResponse
        {
            Message = $"Sync complete — added: {added}, updated: {updated}, total: {freshCompanies.Count}, enriched: {enriched}"
        };

        return await JsonOk(req, result, AppJsonSerializerContext.Default.MessageResponse);
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
