using System.Text.Json;
using backend.Data;
using backend.Models;
using backend.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace backend.Controllers;

[Route("api/dashboard")]
public sealed class DashboardController : ApiControllerBase
{
    private readonly SponsorStore _sponsors;
    private readonly StageStore _stages;
    private readonly TokenService _tokens;
    private readonly AppDbContext _db;
    private readonly ILogger<DashboardController> _logger;

    public DashboardController(SponsorStore sponsors, StageStore stages, TokenService tokens, AppDbContext db, ILogger<DashboardController> logger)
    {
        _sponsors = sponsors;
        _stages = stages;
        _tokens = tokens;
        _db = db;
        _logger = logger;
    }

    private IActionResult? CheckAuth(out string userId)
    {
        var rawToken = GetBearerToken();
        if (!_tokens.ValidateToken(rawToken))
        { userId = ""; return Error(401, "Unauthorized"); }
        userId = _tokens.GetUserId(rawToken) ?? "";
        if (string.IsNullOrWhiteSpace(userId))
            return Error(401, "Unauthorized");
        return null;
    }

    [HttpGet("sponsors")]
    public async Task<IActionResult> GetSponsors()
    {
        if (CheckAuth(out _) is { } err) return err;
        return Ok((await _sponsors.GetActiveAsync()).ToArray());
    }

    [HttpGet("stats")]
    public async Task<IActionResult> GetStats([FromQuery] string? from, [FromQuery] string? to)
    {
        if (CheckAuth(out var userId) is { } err) return err;

        DateTimeOffset? fromDate = DateTimeOffset.TryParse(from, out var f) ? f : null;
        DateTimeOffset? toDate   = DateTimeOffset.TryParse(to,   out var t) ? t : null;

        var all = await _stages.GetByUserIdAsync(userId);
        var filtered = all
            .Where(s => fromDate == null || s.AppliedAt >= fromDate.Value)
            .Where(s => toDate   == null || s.AppliedAt <= toDate.Value)
            .ToList();

        return Ok(new StatsResponse
        {
            Total    = filtered.Count,
            ByStatus = filtered.GroupBy(s => s.Status).ToDictionary(g => g.Key, g => g.Count())
        });
    }

    [HttpGet("applications")]
    public async Task<IActionResult> GetApplications()
    {
        if (CheckAuth(out var userId) is { } err) return err;
        return Ok((await _stages.GetByUserIdAsync(userId)).ToArray());
    }

    [HttpPost("applications")]
    public async Task<IActionResult> CreateApplication([FromBody] ApplicationStage? item)
    {
        if (CheckAuth(out var userId) is { } err) return err;
        if (item is null) return Error(400, "Invalid payload");
        if (!ValidateStage(item, out var validErr)) return Error(400, validErr);

        item.UserId    = userId;
        item.Status    = "Applied";
        item.UpdatedAt = DateTimeOffset.UtcNow;
        await _stages.UpsertAsync(item);

        _db.StatusHistories.Add(new StatusHistory
        {
            ApplicationId = item.Id,
            UserId        = userId,
            Status        = "Applied",
            StatusDate    = DateOnly.FromDateTime(item.AppliedAt.UtcDateTime),
        });
        await _db.SaveChangesAsync();

        return StatusCode(201, item);
    }

    [HttpPut("applications/{id}")]
    public async Task<IActionResult> UpdateApplication(string id, [FromBody] JsonElement bodyElement)
    {
        if (CheckAuth(out var userId) is { } err) return err;

        var existing = await _stages.GetAsync(userId, id);
        if (existing is null) return Error(404, "Not found");

        ApplicationStage? item;
        try { item = JsonSerializer.Deserialize(bodyElement, AppJsonSerializerContext.Default.ApplicationStage); }
        catch { item = null; }

        if (item is null) return Error(400, "Invalid payload");
        if (!ValidateStage(item, out var validErr)) return Error(400, validErr);

        DateOnly? statusDate = null;
        if (bodyElement.TryGetProperty("statusDate", out var sdProp) &&
            DateOnly.TryParse(sdProp.GetString(), out var sd))
            statusDate = sd;

        var updated = new ApplicationStage
        {
            Id                  = id,
            UserId              = userId,
            CompanyName         = item.CompanyName,
            Position            = item.Position,
            AppliedAt           = item.AppliedAt,
            Status              = item.Status,
            RejectionReason     = item.Status == "Rejected" ? item.RejectionReason : null,
            RejectionNote       = item.Status == "Rejected" ? item.RejectionNote   : null,
            Notes               = item.Notes,
            ContactPersonName   = item.ContactPersonName,
            ContactPersonEmail  = item.ContactPersonEmail,
            Locations           = item.Locations,
            FollowUpDate        = item.FollowUpDate,
            SponsorCompanyId    = item.SponsorCompanyId,
            JobUrl              = item.JobUrl,
            UpdatedAt           = DateTimeOffset.UtcNow,
        };

        var logs = BuildActivityLogs(existing, updated, userId);
        await _stages.UpsertAsync(updated);

        if (existing.Status != updated.Status && statusDate.HasValue)
        {
            _db.StatusHistories.Add(new StatusHistory
            {
                ApplicationId = id,
                UserId        = userId,
                Status        = updated.Status,
                StatusDate    = statusDate.Value,
            });
        }

        if (logs.Count > 0) _db.ActivityLogs.AddRange(logs);
        if (logs.Count > 0 || existing.Status != updated.Status) await _db.SaveChangesAsync();

        return Ok(updated);
    }

    [HttpPatch("applications")]
    public async Task<IActionResult> BulkUpdateStatus([FromBody] BulkStatusRequest? body)
    {
        if (CheckAuth(out var userId) is { } err) return err;
        if (body is null || body.Ids.Length == 0) return Error(400, "ids must not be empty");
        if (body.Ids.Length > 100) return Error(400, "ids must not exceed 100 entries");
        if (!ValidStatuses.Contains(body.Status)) return Error(400, $"Invalid status '{body.Status}'");

        var ownedIds = new HashSet<string>(body.Ids);
        var stages = await _db.Stages
            .Where(s => s.UserId == userId && ownedIds.Contains(s.Id))
            .ToListAsync();

        if (stages.Count == 0) return Error(404, "No matching applications found");

        var now   = DateTimeOffset.UtcNow;
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var logs  = new List<ActivityLog>();
        var historyEntries = new List<StatusHistory>();

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
            historyEntries.Add(new StatusHistory
            {
                ApplicationId = stage.Id,
                UserId        = userId,
                Status        = body.Status,
                StatusDate    = today,
            });
            stage.Status    = body.Status;
            stage.UpdatedAt = now;
            if (body.Status != "Rejected")
            {
                stage.RejectionReason = null;
                stage.RejectionNote   = null;
            }
        }

        if (logs.Count > 0)           _db.ActivityLogs.AddRange(logs);
        if (historyEntries.Count > 0) _db.StatusHistories.AddRange(historyEntries);
        await _db.SaveChangesAsync();

        return Ok(stages.ToArray());
    }

    [HttpDelete("applications/{id}")]
    public async Task<IActionResult> DeleteApplication(string id)
    {
        if (CheckAuth(out var userId) is { } err) return err;
        if (await _stages.GetAsync(userId, id) is null) return Error(404, "Not found");
        await _stages.DeleteAsync(userId, id);
        return NoContent();
    }

    [HttpGet("activity/{applicationId}")]
    public async Task<IActionResult> GetActivity(string applicationId)
    {
        if (CheckAuth(out var userId) is { } err) return err;
        if (await _stages.GetAsync(userId, applicationId) is null) return Error(404, "Not found");

        var logs = await _db.ActivityLogs
            .Where(l => l.ApplicationId == applicationId)
            .OrderByDescending(l => l.ChangedAt)
            .ToListAsync();

        return Ok(logs.ToArray());
    }

    [HttpGet("status-history/{applicationId}")]
    public async Task<IActionResult> GetStatusHistory(string applicationId)
    {
        if (CheckAuth(out var userId) is { } err) return err;
        if (await _stages.GetAsync(userId, applicationId) is null) return Error(404, "Not found");

        var history = await _db.StatusHistories
            .Where(h => h.ApplicationId == applicationId)
            .OrderByDescending(h => h.StatusDate)
            .ThenByDescending(h => h.CreatedAt)
            .ToListAsync();

        return Ok(history.ToArray());
    }

    [HttpPost("status-history/{applicationId}")]
    public async Task<IActionResult> AddStatusHistoryEntry(string applicationId, [FromBody] AddStatusHistoryRequest? body)
    {
        if (CheckAuth(out var userId) is { } err) return err;
        if (await _stages.GetAsync(userId, applicationId) is null) return Error(404, "Not found");

        if (body is null || string.IsNullOrWhiteSpace(body.Status) || string.IsNullOrWhiteSpace(body.StatusDate))
            return Error(400, "status and statusDate are required");

        if (!ValidStatuses.Contains(body.Status)) return Error(400, $"Invalid status '{body.Status}'");
        if (!DateOnly.TryParse(body.StatusDate, out var date))
            return Error(400, "Invalid statusDate format (expected YYYY-MM-DD)");

        var entry = new StatusHistory
        {
            ApplicationId = applicationId,
            UserId        = userId,
            Status        = body.Status,
            StatusDate    = date,
        };

        _db.StatusHistories.Add(entry);
        await _db.SaveChangesAsync();
        return StatusCode(201, entry);
    }

    [HttpPut("status-history-item/{historyId}")]
    public async Task<IActionResult> UpdateStatusHistoryItem(string historyId, [FromBody] UpdateStatusHistoryRequest? body)
    {
        if (CheckAuth(out var userId) is { } err) return err;

        var entry = await _db.StatusHistories.FirstOrDefaultAsync(h => h.Id == historyId);
        if (entry is null) return Error(404, "Not found");
        if (await _stages.GetAsync(userId, entry.ApplicationId) is null) return Error(404, "Not found");
        if (body is null) return Error(400, "Invalid payload");

        if (body.Status is not null)
        {
            if (!ValidStatuses.Contains(body.Status)) return Error(400, $"Invalid status '{body.Status}'");
            entry.Status = body.Status;
        }

        if (body.StatusDate is not null)
        {
            if (!DateOnly.TryParse(body.StatusDate, out var date))
                return Error(400, "Invalid statusDate format (expected YYYY-MM-DD)");
            entry.StatusDate = date;
        }

        await _db.SaveChangesAsync();
        return Ok(entry);
    }

    [HttpDelete("status-history-item/{historyId}")]
    public async Task<IActionResult> DeleteStatusHistoryItem(string historyId)
    {
        if (CheckAuth(out var userId) is { } err) return err;

        var entry = await _db.StatusHistories.FirstOrDefaultAsync(h => h.Id == historyId);
        if (entry is null) return Error(404, "Not found");
        if (await _stages.GetAsync(userId, entry.ApplicationId) is null) return Error(404, "Not found");

        _db.StatusHistories.Remove(entry);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // ── validation ────────────────────────────────────────────────────────────

    private static readonly string[] ValidStatuses =
    [
        "Applied", "InterviewScheduled", "Assessment", "OfferReceived",
        "OnHold", "Rejected", "Withdrawn", "Accepted"
    ];

    private static readonly string[] ValidRejectionReasons =
    [
        "dutch_language", "another_candidate", "incompatible_profile",
        "salary_mismatch", "internal_hire", "failed_assessment", "other"
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
        if (s.JobUrl?.Length > 2000)
        { error = "jobUrl must not exceed 2000 characters"; return false; }
        if (s.Locations.Length > 20)
        { error = "locations must not exceed 20 entries"; return false; }
        if (s.Locations.Any(l => l.Length > 100))
        { error = "each location must not exceed 100 characters"; return false; }
        error = string.Empty; return true;
    }

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

        Check("Status",              before.Status,              after.Status);
        Check("CompanyName",         before.CompanyName,         after.CompanyName);
        Check("Position",            before.Position,            after.Position);
        Check("AppliedAt",           before.AppliedAt.ToString("yyyy-MM-dd"), after.AppliedAt.ToString("yyyy-MM-dd"));
        Check("RejectionReason",     before.RejectionReason,     after.RejectionReason);
        Check("Notes",               before.Notes,               after.Notes);
        Check("ContactPersonName",   before.ContactPersonName,   after.ContactPersonName);
        Check("ContactPersonEmail",  before.ContactPersonEmail,  after.ContactPersonEmail);
        Check("JobUrl",              before.JobUrl,              after.JobUrl);
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
}
