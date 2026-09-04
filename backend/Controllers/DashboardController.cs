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
    private readonly JobLinkParser _jobLinks;
    private readonly CompanyListStore _companyLists;
    private readonly RateLimiterService _rateLimiter;
    private readonly ILogger<DashboardController> _logger;

    public DashboardController(
        SponsorStore sponsors,
        StageStore stages,
        TokenService tokens,
        AppDbContext db,
        JobLinkParser jobLinks,
        CompanyListStore companyLists,
        RateLimiterService rateLimiter,
        ILogger<DashboardController> logger)
    {
        _sponsors = sponsors;
        _stages = stages;
        _tokens = tokens;
        _db = db;
        _jobLinks = jobLinks;
        _companyLists = companyLists;
        _rateLimiter = rateLimiter;
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

    // The user's per-company shortlist ("interested") and dismissed list
    // ("hidden") — a company is on at most one of them.
    [HttpGet("company-lists")]
    public async Task<IActionResult> GetCompanyLists()
    {
        if (CheckAuth(out var userId) is { } err) return err;
        var (interested, hidden) = await _companyLists.GetForUserAsync(userId);
        return Ok(new CompanyListsResponse { Interested = interested, Hidden = hidden });
    }

    [HttpPut("company-lists/{companyId}")]
    public async Task<IActionResult> SetCompanyList(string companyId, [FromBody] SetCompanyListRequest? body)
    {
        if (CheckAuth(out var userId) is { } err) return err;
        if (string.IsNullOrWhiteSpace(companyId) || companyId.Length > 64)
            return Error(400, "invalid companyId");
        if (body is null || !ValidCompanyListKinds.Contains(body.Kind))
            return Error(400, "kind must be one of: interested, hidden, none");

        if (body.Kind != "none" && await _sponsors.GetAsync(companyId) is null)
            return Error(404, "Unknown company");

        if (body.Kind == "none")
            await _companyLists.ClearAsync(userId, companyId);
        else
            await _companyLists.SetAsync(userId, companyId, body.Kind);

        var (interested, hidden) = await _companyLists.GetForUserAsync(userId);
        return Ok(new CompanyListsResponse { Interested = interested, Hidden = hidden });
    }

    private static readonly string[] ValidCompanyListKinds = ["interested", "hidden", "none"];

    [HttpGet("stats")]
    public async Task<IActionResult> GetStats([FromQuery] string? from, [FromQuery] string? to)
    {
        if (CheckAuth(out var userId) is { } err) return err;

        var filtered = await GetFilteredStagesAsync(userId, from, to);

        return Ok(new StatsResponse
        {
            Total    = filtered.Count,
            ByStatus = filtered.GroupBy(s => s.Status).ToDictionary(g => g.Key, g => g.Count())
        });
    }

    // Real branch/transition data for the status tree: for each application in
    // range, walk its StatusHistory in chronological order (StatusDate, then
    // CreatedAt to break same-day ties) and turn consecutive status changes
    // into edges. Node "total" is how many apps ever passed through a status;
    // "current" is how many are sitting there right now (path's last stop).
    [HttpGet("status-flow")]
    public async Task<IActionResult> GetStatusFlow([FromQuery] string? from, [FromQuery] string? to)
    {
        if (CheckAuth(out var userId) is { } err) return err;

        var filtered = await GetFilteredStagesAsync(userId, from, to);
        if (filtered.Count == 0) return Ok(new StatusFlowResponse());

        var idsInRange = filtered.Select(s => s.Id).ToHashSet();
        var statusById = filtered.ToDictionary(s => s.Id, s => s.Status);

        var history = await _db.StatusHistories
            .Where(h => h.UserId == userId && idsInRange.Contains(h.ApplicationId))
            .OrderBy(h => h.ApplicationId)
            .ThenBy(h => h.StatusDate)
            .ThenBy(h => h.CreatedAt)
            .ToListAsync();

        return Ok(BuildStatusFlow(history, statusById));
    }

    // Pure aggregation: chronological history (already ordered per-app by
    // StatusDate then CreatedAt, so same-day changes land in the order they
    // actually happened) becomes a per-app path of distinct consecutive
    // statuses, which is then folded into node totals/currents and edge
    // counts. Exposed as internal so it can be unit tested without a DB.
    internal static StatusFlowResponse BuildStatusFlow(
        IEnumerable<StatusHistory> historyInRange,
        IReadOnlyDictionary<string, string> currentStatusById)
    {
        var totals   = new Dictionary<string, int>();
        var currents = new Dictionary<string, int>();
        var edges    = new Dictionary<(string From, string To), int>();

        void Bump(Dictionary<string, int> d, string key) => d[key] = d.GetValueOrDefault(key) + 1;

        foreach (var group in historyInRange.GroupBy(h => h.ApplicationId))
        {
            var path = new List<string>();
            foreach (var h in group)
                if (path.Count == 0 || path[^1] != h.Status) path.Add(h.Status);

            // Guard against a stage whose Status never got a matching history row.
            if (currentStatusById.TryGetValue(group.Key, out var currentStatus) &&
                (path.Count == 0 || path[^1] != currentStatus))
                path.Add(currentStatus);

            if (path.Count == 0) continue;

            foreach (var status in path.Distinct()) Bump(totals, status);
            Bump(currents, path[^1]);
            for (var i = 0; i < path.Count - 1; i++)
            {
                var key = (path[i], path[i + 1]);
                edges[key] = edges.GetValueOrDefault(key) + 1;
            }
        }

        var nodes = totals.Keys
            .Select(s => new StatusFlowNode { Status = s, Total = totals[s], Current = currents.GetValueOrDefault(s) })
            .ToArray();
        var edgeArray = edges
            .Select(kv => new StatusFlowEdge { From = kv.Key.From, To = kv.Key.To, Count = kv.Value })
            .ToArray();

        return new StatusFlowResponse { Nodes = nodes, Edges = edgeArray };
    }

    private async Task<List<ApplicationStage>> GetFilteredStagesAsync(string userId, string? from, string? to)
    {
        DateTimeOffset? fromDate = DateTimeOffset.TryParse(from, out var f) ? f : null;
        DateTimeOffset? toDate   = DateTimeOffset.TryParse(to,   out var t) ? t : null;

        var all = await _stages.GetByUserIdAsync(userId);
        return all
            .Where(s => fromDate == null || s.AppliedAt >= fromDate.Value)
            .Where(s => toDate   == null || s.AppliedAt <= toDate.Value)
            .ToList();
    }

    [HttpGet("applications")]
    public async Task<IActionResult> GetApplications()
    {
        if (CheckAuth(out var userId) is { } err) return err;
        return Ok(await WithLiveSponsorLink(await _stages.GetByUserIdAsync(userId)));
    }

    [HttpPost("applications")]
    public async Task<IActionResult> CreateApplication([FromBody] ApplicationStage? item)
    {
        if (CheckAuth(out var userId) is { } err) return err;
        if (item is null) return Error(400, "Invalid payload");
        if (!ValidateStage(item, out var validErr)) return Error(400, validErr);

        item.UserId          = userId;
        item.Status          = "Applied";
        item.UpdatedAt       = DateTimeOffset.UtcNow;
        item.SponsorCompanyId = await ResolveSponsorId(item.CompanyName, item.SponsorCompanyId);
        await _stages.UpsertAsync(item);

        _db.StatusHistories.Add(new StatusHistory
        {
            ApplicationId = item.Id,
            UserId        = userId,
            Status        = "Applied",
            StatusDate    = DateOnly.FromDateTime(item.AppliedAt.UtcDateTime),
        });
        await _db.SaveChangesAsync();

        await WithLiveSponsorLink([item]);
        return StatusCode(201, item);
    }

    // Best-effort extraction of company + position from a pasted job-posting link.
    // Always 200 on a well-formed URL — an empty result just means nothing could
    // be read. The fetch is SSRF-hardened inside JobLinkParser.
    [HttpPost("parse-job-link")]
    public async Task<IActionResult> ParseJobLink([FromBody] ParseJobLinkRequest? body)
    {
        if (CheckAuth(out var userId) is { } err) return err;
        if (body is null || string.IsNullOrWhiteSpace(body.Url))
            return Error(400, "url is required");
        if (body.Url.Length > 2000)
            return Error(400, "url must not exceed 2000 characters");
        if (!JobLinkParser.TryNormalizeUrl(body.Url, out _))
            return Error(400, "url must be a valid http(s) link");
        if (!_rateLimiter.IsAllowed($"parse-job-link:{userId}", 20, 60))
            return Error(429, "Too many link lookups — please wait a minute.");

        var result = await _jobLinks.ParseAsync(body.Url, HttpContext.RequestAborted);
        return Ok(new ParseJobLinkResponse
        {
            Company   = result.Company,
            Position  = result.Position,
            Locations = result.Locations.ToArray(),
            Source    = result.Source,
        });
    }

    [HttpPut("applications/{id}")]
    public async Task<IActionResult> UpdateApplication(string id, [FromBody] JsonElement bodyElement)
    {
        if (CheckAuth(out var userId) is { } err) return err;

        var existing = await _stages.GetAsync(userId, id);
        if (existing is null) return Error(404, "Not found");
        // StageStore.UpsertAsync mutates this same tracked instance in place (EF's
        // identity map hands back the identical object for both queries on this
        // DbContext), so its Status has to be captured now — comparing existing.Status
        // after the upsert would always read the *new* value and never write history.
        var previousStatus = existing.Status;

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
            SponsorCompanyId    = await ResolveSponsorId(item.CompanyName, item.SponsorCompanyId),
            JobUrl              = item.JobUrl,
            SuccessRate         = item.SuccessRate,
            UpdatedAt           = DateTimeOffset.UtcNow,
        };

        var logs = BuildActivityLogs(existing, updated, userId);
        await _stages.UpsertAsync(updated);

        if (previousStatus != updated.Status && statusDate.HasValue)
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
        if (logs.Count > 0 || previousStatus != updated.Status) await _db.SaveChangesAsync();

        await WithLiveSponsorLink([updated]);
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

        return Ok(await WithLiveSponsorLink(stages));
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

    // If the form's autocomplete wasn't used to pick a sponsor (typed the name
    // manually, or the record predates the link), fall back to a name match
    // against the sponsor register — otherwise two applications to the same
    // company can silently disagree on "HSM sponsor" depending only on which
    // one happened to be saved through the dropdown. Never overrides a link
    // the user already made or cleared on purpose.
    private async Task<string?> ResolveSponsorId(string companyName, string? provided)
    {
        if (!string.IsNullOrEmpty(provided)) return provided;
        return (await _sponsors.FindByNameAsync(companyName))?.Id;
    }

    // The "HSM sponsor" tag is a live fact about the company, not the application —
    // it must reflect the current sponsor register regardless of the stored link,
    // the application's status, or whether that specific record was ever saved
    // through the autocomplete. Overwrites SponsorCompanyId on the way out of every
    // endpoint that returns applications; never persisted from here.
    private async Task<ApplicationStage[]> WithLiveSponsorLink(IReadOnlyCollection<ApplicationStage> stages)
    {
        foreach (var stage in stages)
            stage.SponsorCompanyId = (await _sponsors.FindByNameAsync(stage.CompanyName))?.Id;
        return stages as ApplicationStage[] ?? stages.ToArray();
    }

    // ── validation ────────────────────────────────────────────────────────────

    private static readonly string[] ValidStatuses =
    [
        "Applied", "InterviewScheduled", "Assessment", "OfferReceived",
        "OnHold", "Rejected", "Withdrawn", "Accepted", "Ghosted"
    ];

    private static readonly string[] ValidRejectionReasons =
    [
        "dutch_language", "another_candidate", "incompatible_profile",
        "salary_mismatch", "internal_hire", "failed_assessment", "no_vacancies", "other"
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
        if (s.SuccessRate is < 0 or > 100)
        { error = "successRate must be between 0 and 100"; return false; }
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
        Check("SuccessRate",         before.SuccessRate?.ToString(), after.SuccessRate?.ToString());
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
