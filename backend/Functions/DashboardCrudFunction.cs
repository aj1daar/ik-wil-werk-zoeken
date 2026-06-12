using System.Net;
using System.Text.Json;
using backend.Models;
using backend.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;

namespace backend.Functions;

public sealed class DashboardCrudFunction
{
    private readonly SponsorStore _sponsors;
    private readonly StageStore   _stages;
    private readonly TokenService _tokens;

    public DashboardCrudFunction(SponsorStore sponsors, StageStore stages, TokenService tokens)
    {
        _sponsors = sponsors;
        _stages   = stages;
        _tokens   = tokens;
    }

    [Function("DashboardCrud")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", "post", "put", "delete", "options",
            Route = "dashboard/{entity}/{id?}")]
        HttpRequestData req,
        string entity,
        string? id)
    {
        if (req.Method.Equals("OPTIONS", StringComparison.OrdinalIgnoreCase))
            return WithCors(req.CreateResponse(HttpStatusCode.OK));

        req.Headers.TryGetValues("Authorization", out var authHeader);
        var rawToken = authHeader?.FirstOrDefault();
        if (!_tokens.ValidateToken(rawToken))
            return WithCors(await ErrorResponse(req, HttpStatusCode.Unauthorized, "Unauthorized"));

        var userId = _tokens.GetUserId(rawToken);
        if (string.IsNullOrWhiteSpace(userId))
            return WithCors(await ErrorResponse(req, HttpStatusCode.Unauthorized, "Unauthorized"));

        var response = (entity.ToLowerInvariant(), req.Method.ToUpperInvariant()) switch
        {
            ("sponsors",     "GET")    => await GetSponsors(req),
            ("applications", "GET")    => await GetApplications(req, userId),
            ("applications", "POST")   => await CreateApplication(req, userId),
            ("applications", "PUT")    => await UpdateApplication(req, userId, id),
            ("applications", "DELETE") => await DeleteApplication(req, userId, id),
            ("stats",        "GET")    => await GetStats(req, userId),
            _ => await ErrorResponse(req, HttpStatusCode.BadRequest, "Unsupported route or method")
        };

        return WithCors(response);
    }

    // ── sponsors ──────────────────────────────────────────────────────────────

    private async Task<HttpResponseData> GetSponsors(HttpRequestData req)
    {
        var response = req.CreateResponse(HttpStatusCode.OK);
        await WriteJson(response, JsonSerializer.Serialize(
            _sponsors.Companies.Values.ToArray(),
            AppJsonSerializerContext.Default.SponsorCompanyArray));
        return response;
    }

    // ── stats ─────────────────────────────────────────────────────────────────

    private async Task<HttpResponseData> GetStats(HttpRequestData req, string userId)
    {
        var query = System.Web.HttpUtility.ParseQueryString(req.Url.Query);
        DateTimeOffset? from = DateTimeOffset.TryParse(query["from"], out var f) ? f : null;
        DateTimeOffset? to   = DateTimeOffset.TryParse(query["to"],   out var t) ? t : null;

        var all = await _stages.GetByUserIdAsync(userId);
        var filtered = all
            .Where(s => from == null || s.AppliedAt >= from.Value)
            .Where(s => to   == null || s.AppliedAt <= to.Value)
            .ToList();

        var stats = new StatsResponse
        {
            Total    = filtered.Count,
            ByStatus = filtered
                .GroupBy(s => s.Status)
                .ToDictionary(g => g.Key, g => g.Count())
        };

        var response = req.CreateResponse(HttpStatusCode.OK);
        await WriteJson(response, JsonSerializer.Serialize(stats, AppJsonSerializerContext.Default.StatsResponse));
        return response;
    }

    // ── applications ──────────────────────────────────────────────────────────

    private async Task<HttpResponseData> GetApplications(HttpRequestData req, string userId)
    {
        var stages = await _stages.GetByUserIdAsync(userId);
        var response = req.CreateResponse(HttpStatusCode.OK);
        await WriteJson(response, JsonSerializer.Serialize(
            stages.ToArray(), AppJsonSerializerContext.Default.ApplicationStageArray));
        return response;
    }

    private async Task<HttpResponseData> CreateApplication(HttpRequestData req, string userId)
    {
        var item = await DeserializeStage(req.Body);
        if (item is null)
            return await ErrorResponse(req, HttpStatusCode.BadRequest, "Invalid payload");

        if (!ValidateStage(item, out var err))
            return await ErrorResponse(req, HttpStatusCode.BadRequest, err);

        item.UserId    = userId;
        item.Status    = "Applied";
        item.UpdatedAt = DateTimeOffset.UtcNow;
        await _stages.UpsertAsync(item);

        var response = req.CreateResponse(HttpStatusCode.Created);
        await WriteJson(response, JsonSerializer.Serialize(item, AppJsonSerializerContext.Default.ApplicationStage));
        return response;
    }

    private async Task<HttpResponseData> UpdateApplication(HttpRequestData req, string userId, string? id)
    {
        if (string.IsNullOrWhiteSpace(id))
            return await ErrorResponse(req, HttpStatusCode.BadRequest, "id is required for update");

        var existing = await _stages.GetAsync(userId, id);
        if (existing is null)
            return await ErrorResponse(req, HttpStatusCode.NotFound, "Not found");

        var item = await DeserializeStage(req.Body);
        if (item is null)
            return await ErrorResponse(req, HttpStatusCode.BadRequest, "Invalid payload");

        if (!ValidateStage(item, out var err))
            return await ErrorResponse(req, HttpStatusCode.BadRequest, err);

        var updated = new ApplicationStage
        {
            Id                 = id,
            UserId             = userId,
            CompanyName        = item.CompanyName,
            Position           = item.Position,
            AppliedAt          = item.AppliedAt,
            Status             = item.Status,
            RejectionReason    = item.Status == "Rejected" ? item.RejectionReason : null,
            RejectionNote      = item.Status == "Rejected" ? item.RejectionNote   : null,
            Notes              = item.Notes,
            ContactPersonName  = item.ContactPersonName,
            ContactPersonEmail = item.ContactPersonEmail,
            Locations          = item.Locations,
            UpdatedAt          = DateTimeOffset.UtcNow,
        };
        await _stages.UpsertAsync(updated);

        var response = req.CreateResponse(HttpStatusCode.OK);
        await WriteJson(response, JsonSerializer.Serialize(updated, AppJsonSerializerContext.Default.ApplicationStage));
        return response;
    }

    private async Task<HttpResponseData> DeleteApplication(HttpRequestData req, string userId, string? id)
    {
        if (string.IsNullOrWhiteSpace(id))
            return await ErrorResponse(req, HttpStatusCode.BadRequest, "id is required for delete");

        var existing = await _stages.GetAsync(userId, id);
        if (existing is null)
            return await ErrorResponse(req, HttpStatusCode.NotFound, "Not found");

        await _stages.DeleteAsync(userId, id);
        return req.CreateResponse(HttpStatusCode.NoContent);
    }

    // ── validation ────────────────────────────────────────────────────────────

    private static readonly string[] ValidStatuses =
    [
        "Applied", "InterviewScheduled", "OfferReceived",
        "OnHold", "Rejected", "Withdrawn", "Accepted"
    ];

    private static readonly string[] ValidRejectionReasons =
    [
        "dutch_language", "another_candidate", "incompatible_profile",
        "salary_mismatch", "internal_hire", "other"
    ];

    private static bool ValidateStage(ApplicationStage s, out string error)
    {
        if (string.IsNullOrWhiteSpace(s.CompanyName))
            { error = "companyName is required"; return false; }
        if (s.CompanyName.Length > 200)
            { error = "companyName must not exceed 200 characters"; return false; }

        if (string.IsNullOrWhiteSpace(s.Position))
            { error = "position is required"; return false; }
        if (s.Position.Length > 200)
            { error = "position must not exceed 200 characters"; return false; }

        if (!ValidStatuses.Contains(s.Status))
            { error = $"Invalid status '{s.Status}'"; return false; }

        if (s.Status == "Rejected" && s.RejectionReason is not null
            && !ValidRejectionReasons.Contains(s.RejectionReason))
            { error = $"Invalid rejectionReason '{s.RejectionReason}'"; return false; }

        if (s.RejectionNote?.Length > 500)
            { error = "rejectionNote must not exceed 500 characters"; return false; }

        if (s.Notes?.Length > 5000)
            { error = "notes must not exceed 5000 characters"; return false; }

        if (s.ContactPersonName?.Length > 200)
            { error = "contactPersonName must not exceed 200 characters"; return false; }

        if (s.ContactPersonEmail?.Length > 254)
            { error = "contactPersonEmail must not exceed 254 characters"; return false; }

        if (s.Locations.Length > 20)
            { error = "locations must not exceed 20 entries"; return false; }

        if (s.Locations.Any(l => l.Length > 100))
            { error = "each location must not exceed 100 characters"; return false; }

        error = string.Empty;
        return true;
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private static HttpResponseData WithCors(HttpResponseData res)
    {
        AuthFunction.AddCors(res);
        return res;
    }

    private static async Task<HttpResponseData> ErrorResponse(
        HttpRequestData req, HttpStatusCode statusCode, string message)
    {
        var response = req.CreateResponse(statusCode);
        await response.WriteStringAsync(message);
        return response;
    }

    private static async Task WriteJson(HttpResponseData response, string json)
    {
        response.Headers.TryAddWithoutValidation("Content-Type", "application/json; charset=utf-8");
        await response.WriteStringAsync(json);
    }

    private static async Task<ApplicationStage?> DeserializeStage(Stream body) =>
        await JsonSerializer.DeserializeAsync(body, AppJsonSerializerContext.Default.ApplicationStage);
}
