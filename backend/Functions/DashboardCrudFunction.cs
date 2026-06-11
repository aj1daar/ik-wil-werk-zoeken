using System.Collections.Concurrent;
using System.Net;
using System.Text.Json;
using backend.Models;
using backend.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;

namespace backend.Functions;

public sealed class DashboardCrudFunction
{
    private readonly SponsorStore _store;
    private readonly TokenService _tokens;

    public DashboardCrudFunction(SponsorStore store, TokenService tokens)
    {
        _store = store;
        _tokens = tokens;
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
            ("sponsors", "GET")    => await GetSponsors(req),
            ("stages",   "GET")    => await GetStages(req, userId),
            ("stages",   "POST")   => await CreateStage(req, userId),
            ("stages",   "PUT")    => await UpdateStage(req, userId, id),
            ("stages",   "DELETE") => await DeleteStage(req, userId, id),
            _ => await ErrorResponse(req, HttpStatusCode.BadRequest, "Unsupported route or method")
        };

        return WithCors(response);
    }

    // ── sponsors (read-only for all authenticated users) ─────────────────────

    private async Task<HttpResponseData> GetSponsors(HttpRequestData req)
    {
        var response = req.CreateResponse(HttpStatusCode.OK);
        await WriteJson(response, JsonSerializer.Serialize(
            _store.Companies.Values.ToArray(),
            AppJsonSerializerContext.Default.SponsorCompanyArray));
        return response;
    }

    // ── stages (user-scoped) ──────────────────────────────────────────────────

    private async Task<HttpResponseData> GetStages(HttpRequestData req, string userId)
    {
        var userStages = _store.Stages.Values
            .Where(s => s.UserId == userId)
            .ToArray();
        var response = req.CreateResponse(HttpStatusCode.OK);
        await WriteJson(response, JsonSerializer.Serialize(
            userStages, AppJsonSerializerContext.Default.ApplicationStageArray));
        return response;
    }

    private async Task<HttpResponseData> CreateStage(HttpRequestData req, string userId)
    {
        var item = await DeserializeStage(req.Body);
        if (item is null)
            return await ErrorResponse(req, HttpStatusCode.BadRequest, "Invalid payload");

        if (!ValidateStage(item, out var validationError))
            return await ErrorResponse(req, HttpStatusCode.BadRequest, validationError);

        item.UserId = userId;
        _store.Stages[item.Id] = item;

        var response = req.CreateResponse(HttpStatusCode.Created);
        await WriteJson(response, JsonSerializer.Serialize(item, AppJsonSerializerContext.Default.ApplicationStage));
        return response;
    }

    private async Task<HttpResponseData> UpdateStage(HttpRequestData req, string userId, string? id)
    {
        if (string.IsNullOrWhiteSpace(id))
            return await ErrorResponse(req, HttpStatusCode.BadRequest, "id is required for update");

        if (!_store.Stages.TryGetValue(id, out var existing))
            return await ErrorResponse(req, HttpStatusCode.NotFound, "Not found");

        if (existing.UserId != userId)
            return await ErrorResponse(req, HttpStatusCode.Forbidden, "Forbidden");

        var item = await DeserializeStage(req.Body);
        if (item is null)
            return await ErrorResponse(req, HttpStatusCode.BadRequest, "Invalid payload");

        if (!ValidateStage(item, out var validationError))
            return await ErrorResponse(req, HttpStatusCode.BadRequest, validationError);

        var updated = new ApplicationStage
        {
            Id                 = id,
            UserId             = userId,
            SponsorCompanyId   = item.SponsorCompanyId,
            Status             = item.Status,
            Notes              = item.Notes,
            ContactPersonName  = item.ContactPersonName,
            ContactPersonEmail = item.ContactPersonEmail,
            Cities             = item.Cities,
            UpdatedAt          = DateTimeOffset.UtcNow,
        };
        _store.Stages[id] = updated;

        var response = req.CreateResponse(HttpStatusCode.OK);
        await WriteJson(response, JsonSerializer.Serialize(updated, AppJsonSerializerContext.Default.ApplicationStage));
        return response;
    }

    private async Task<HttpResponseData> DeleteStage(HttpRequestData req, string userId, string? id)
    {
        if (string.IsNullOrWhiteSpace(id))
            return await ErrorResponse(req, HttpStatusCode.BadRequest, "id is required for delete");

        if (!_store.Stages.TryGetValue(id, out var existing))
            return await ErrorResponse(req, HttpStatusCode.NotFound, "Not found");

        if (existing.UserId != userId)
            return await ErrorResponse(req, HttpStatusCode.Forbidden, "Forbidden");

        _store.Stages.TryRemove(id, out _);
        return req.CreateResponse(HttpStatusCode.NoContent);
    }

    // ── validation ────────────────────────────────────────────────────────────

    private static readonly string[] ValidStatuses =
    [
        "Bookmarked", "Viewed", "Applied", "Ongoing Interview",
        "Offer Proposed", "Offer Accepted", "Rejected", "Declined Offer", "Abandoned"
    ];

    private static bool ValidateStage(ApplicationStage s, out string error)
    {
        if (string.IsNullOrWhiteSpace(s.SponsorCompanyId))
            { error = "sponsorCompanyId is required"; return false; }

        if (!ValidStatuses.Contains(s.Status))
            { error = $"Invalid status '{s.Status}'"; return false; }

        if (s.Notes?.Length > 5000)
            { error = "notes must not exceed 5000 characters"; return false; }

        if (s.ContactPersonName?.Length > 200)
            { error = "contactPersonName must not exceed 200 characters"; return false; }

        if (s.ContactPersonEmail?.Length > 254)
            { error = "contactPersonEmail must not exceed 254 characters"; return false; }

        if (s.Cities.Length > 20)
            { error = "cities must not exceed 20 entries"; return false; }

        if (s.Cities.Any(c => c.Length > 100))
            { error = "each city must not exceed 100 characters"; return false; }

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
