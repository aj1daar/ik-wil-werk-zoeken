using System.Net;
using System.Text.Json;
using backend.Data;
using backend.Models;
using backend.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.EntityFrameworkCore;

namespace backend.Functions;

public sealed class DashboardCrudFunction
{
    private readonly SponsorStore _sponsors;
    private readonly StageStore   _stages;
    private readonly TokenService _tokens;
    private readonly AppDbContext _db;

    public DashboardCrudFunction(SponsorStore sponsors, StageStore stages, TokenService tokens, AppDbContext db)
    {
        _sponsors = sponsors;
        _stages   = stages;
        _tokens   = tokens;
        _db       = db;
    }

    [Function("DashboardCrud")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", "post", "put", "patch", "delete", "options",
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
            ("applications", "PATCH")  => await BulkUpdateStatus(req, userId),
            ("applications", "DELETE") => await DeleteApplication(req, userId, id),
            ("activity",     "GET")    => await GetActivity(req, userId, id),
            ("stats",        "GET")    => await GetStats(req, userId),
            _ => await ErrorResponse(req, HttpStatusCode.BadRequest, "Unsupported route or method")
        };

        return WithCors(response);
    }

    // ── sponsors ──────────────────────────────────────────────────────────────

    private async Task<HttpResponseData> GetSponsors(HttpRequestData req)
    {
        var companies = await _sponsors.GetAllAsync();
        var response = req.CreateResponse(HttpStatusCode.OK);
        await WriteJson(response, JsonSerializer.Serialize(
            companies.ToArray(),
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

        item.UserId     = userId;
        item.Status     = "Applied";
        item.UpdatedAt  = DateTimeOffset.UtcNow;
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
            FollowUpDate       = item.FollowUpDate,
            UpdatedAt          = DateTimeOffset.UtcNow,
        };

        var logs = BuildActivityLogs(existing, updated, userId);
        await _stages.UpsertAsync(updated);

        if (logs.Count > 0)
        {
            _db.ActivityLogs.AddRange(logs);
            await _db.SaveChangesAsync();
        }

        var response = req.CreateResponse(HttpStatusCode.OK);
        await WriteJson(response, JsonSerializer.Serialize(updated, AppJsonSerializerContext.Default.ApplicationStage));
        return response;
    }

    private async Task<HttpResponseData> BulkUpdateStatus(HttpRequestData req, string userId)
    {
        var body = await JsonSerializer.DeserializeAsync(req.Body, AppJsonSerializerContext.Default.BulkStatusRequest);
        if (body is null || body.Ids.Length == 0)
            return await ErrorResponse(req, HttpStatusCode.BadRequest, "ids must not be empty");

        if (body.Ids.Length > 100)
            return await ErrorResponse(req, HttpStatusCode.BadRequest, "ids must not exceed 100 entries");

        if (!ValidStatuses.Contains(body.Status))
            return await ErrorResponse(req, HttpStatusCode.BadRequest, $"Invalid status '{body.Status}'");

        // Fetch all matching stages owned by this user
        var ownedIds = new HashSet<string>(body.Ids);
        var stages = await _db.Stages
            .Where(s => s.UserId == userId && ownedIds.Contains(s.Id))
            .ToListAsync();

        if (stages.Count == 0)
            return await ErrorResponse(req, HttpStatusCode.NotFound, "No matching applications found");

        var now  = DateTimeOffset.UtcNow;
        var logs = new List<ActivityLog>();
        foreach (var stage in stages)
        {
            if (stage.Status == body.Status) continue;
            logs.Add(new ActivityLog
            {
                ApplicationId = stage.Id,
                UserId        = userId,
                Field         = "Status",
                OldValue      = stage.Status,
                NewValue      = body.Status,
                ChangedAt     = now,
            });
            stage.Status    = body.Status;
            stage.UpdatedAt = now;
            if (body.Status != "Rejected")
            {
                stage.RejectionReason = null;
                stage.RejectionNote   = null;
            }
        }

        if (logs.Count > 0)
            _db.ActivityLogs.AddRange(logs);

        await _db.SaveChangesAsync();

        var response = req.CreateResponse(HttpStatusCode.OK);
        await WriteJson(response, JsonSerializer.Serialize(
            stages.ToArray(), AppJsonSerializerContext.Default.ApplicationStageArray));
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

    // ── activity log ──────────────────────────────────────────────────────────

    private async Task<HttpResponseData> GetActivity(HttpRequestData req, string userId, string? applicationId)
    {
        if (string.IsNullOrWhiteSpace(applicationId))
            return await ErrorResponse(req, HttpStatusCode.BadRequest, "application id is required");

        // Verify ownership
        var stage = await _stages.GetAsync(userId, applicationId);
        if (stage is null)
            return await ErrorResponse(req, HttpStatusCode.NotFound, "Not found");

        var logs = await _db.ActivityLogs
            .Where(l => l.ApplicationId == applicationId)
            .OrderByDescending(l => l.ChangedAt)
            .ToListAsync();

        var response = req.CreateResponse(HttpStatusCode.OK);
        await WriteJson(response, JsonSerializer.Serialize(
            logs.ToArray(), AppJsonSerializerContext.Default.ActivityLogArray));
        return response;
    }

    // ── diff helper ───────────────────────────────────────────────────────────

    internal static List<ActivityLog> BuildActivityLogs(ApplicationStage before, ApplicationStage after, string userId)
    {
        var logs = new List<ActivityLog>();
        var now  = after.UpdatedAt;

        void Check(string field, string? oldVal, string? newVal)
        {
            var o = oldVal ?? string.Empty;
            var n = newVal ?? string.Empty;
            if (o != n)
                logs.Add(new ActivityLog
                {
                    ApplicationId = after.Id,
                    UserId        = userId,
                    Field         = field,
                    OldValue      = string.IsNullOrEmpty(o) ? null : o,
                    NewValue      = string.IsNullOrEmpty(n) ? null : n,
                    ChangedAt     = now,
                });
        }

        Check("Status",             before.Status,             after.Status);
        Check("CompanyName",        before.CompanyName,        after.CompanyName);
        Check("Position",           before.Position,           after.Position);
        Check("AppliedAt",          before.AppliedAt.ToString("yyyy-MM-dd"), after.AppliedAt.ToString("yyyy-MM-dd"));
        Check("RejectionReason",    before.RejectionReason,    after.RejectionReason);
        Check("Notes",              before.Notes,              after.Notes);
        Check("ContactPersonName",  before.ContactPersonName,  after.ContactPersonName);
        Check("ContactPersonEmail", before.ContactPersonEmail, after.ContactPersonEmail);
        Check("FollowUpDate",
            before.FollowUpDate?.ToString("yyyy-MM-dd"),
            after.FollowUpDate?.ToString("yyyy-MM-dd"));

        var oldLoc = string.Join(", ", before.Locations.OrderBy(l => l));
        var newLoc = string.Join(", ", after.Locations.OrderBy(l => l));
        if (oldLoc != newLoc)
            logs.Add(new ActivityLog
            {
                ApplicationId = after.Id,
                UserId        = userId,
                Field         = "Locations",
                OldValue      = string.IsNullOrEmpty(oldLoc) ? null : oldLoc,
                NewValue      = string.IsNullOrEmpty(newLoc) ? null : newLoc,
                ChangedAt     = now,
            });

        return logs;
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

    internal static bool ValidateStage(ApplicationStage s, out string error)
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
