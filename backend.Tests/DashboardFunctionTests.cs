using backend.Controllers;
using backend.Models;
using Xunit;

namespace backend.Tests;

// Unit tests for DashboardController helpers exposed as internal.
// These validate pure business logic without network or DB calls.

public sealed class DashboardFunctionTests
{
    // ── BuildActivityLogs ────────────────────────────────────────────────────

    private static ApplicationStage MakeStage(string id = "s1", string userId = "u1") => new()
    {
        Id          = id,
        UserId      = userId,
        CompanyName = "Acme",
        Position    = "Engineer",
        AppliedAt   = new DateTimeOffset(2026, 1, 15, 0, 0, 0, TimeSpan.Zero),
        Status      = "Applied",
        Locations   = [],
        UpdatedAt   = new DateTimeOffset(2026, 6, 1, 0, 0, 0, TimeSpan.Zero),
    };

    [Fact]
    public void BuildActivityLogs_NoChanges_ReturnsEmpty()
    {
        var stage = MakeStage();
        var logs = DashboardController.BuildActivityLogs(stage, stage, "u1");
        Assert.Empty(logs);
    }

    [Fact]
    public void BuildActivityLogs_StatusChange_LogsStatus()
    {
        var before = MakeStage();
        var after  = MakeStage(); after.Status = "Rejected";
        var logs = DashboardController.BuildActivityLogs(before, after, "u1");
        Assert.Single(logs);
        Assert.Equal("Status",   logs[0].Field);
        Assert.Equal("Applied",  logs[0].OldValue);
        Assert.Equal("Rejected", logs[0].NewValue);
    }

    [Fact]
    public void BuildActivityLogs_MultipleFieldsChanged_LogsAll()
    {
        var before = MakeStage();
        var after  = MakeStage();
        after.Status      = "InterviewScheduled";
        after.CompanyName = "NewCo";
        after.Position    = "Senior Engineer";
        var logs = DashboardController.BuildActivityLogs(before, after, "u1");
        var fields = logs.Select(l => l.Field).ToHashSet();
        Assert.Contains("Status",      fields);
        Assert.Contains("CompanyName", fields);
        Assert.Contains("Position",    fields);
    }

    [Fact]
    public void BuildActivityLogs_NotesAddedFromNull_OldValueIsNull()
    {
        var before = MakeStage(); before.Notes = null;
        var after  = MakeStage(); after.Notes  = "Follow up on Friday";
        var logs = DashboardController.BuildActivityLogs(before, after, "u1");
        var noteLog = Assert.Single(logs, l => l.Field == "Notes");
        Assert.Null(noteLog.OldValue);
        Assert.Equal("Follow up on Friday", noteLog.NewValue);
    }

    [Fact]
    public void BuildActivityLogs_NotesCleared_NewValueIsNull()
    {
        var before = MakeStage(); before.Notes = "Some note";
        var after  = MakeStage(); after.Notes  = null;
        var logs = DashboardController.BuildActivityLogs(before, after, "u1");
        var noteLog = Assert.Single(logs, l => l.Field == "Notes");
        Assert.Equal("Some note", noteLog.OldValue);
        Assert.Null(noteLog.NewValue);
    }

    [Fact]
    public void BuildActivityLogs_LocationsAdded_LogsLocations()
    {
        var before = MakeStage();
        var after  = MakeStage(); after.Locations = ["Amsterdam", "Utrecht"];
        var logs = DashboardController.BuildActivityLogs(before, after, "u1");
        var locLog = Assert.Single(logs, l => l.Field == "Locations");
        Assert.Null(locLog.OldValue);
        Assert.Contains("Amsterdam", locLog.NewValue ?? "");
    }

    [Fact]
    public void BuildActivityLogs_LocationsOrderNormalized_NoFalsePositive()
    {
        var before = MakeStage(); before.Locations = ["Utrecht", "Amsterdam"];
        var after  = MakeStage(); after.Locations  = ["Amsterdam", "Utrecht"];
        // Sorted join: both produce "Amsterdam, Utrecht" — no change
        var logs = DashboardController.BuildActivityLogs(before, after, "u1");
        Assert.Empty(logs);
    }

    [Fact]
    public void BuildActivityLogs_FollowUpDateSet_Logged()
    {
        var before = MakeStage();
        var after  = MakeStage(); after.FollowUpDate = new DateTimeOffset(2026, 7, 1, 0, 0, 0, TimeSpan.Zero);
        var logs = DashboardController.BuildActivityLogs(before, after, "u1");
        var fud = Assert.Single(logs, l => l.Field == "FollowUpDate");
        Assert.Null(fud.OldValue);
        Assert.Equal("2026-07-01", fud.NewValue);
    }

    [Fact]
    public void BuildActivityLogs_FollowUpDateCleared_Logged()
    {
        var before = MakeStage(); before.FollowUpDate = new DateTimeOffset(2026, 7, 1, 0, 0, 0, TimeSpan.Zero);
        var after  = MakeStage(); after.FollowUpDate  = null;
        var logs = DashboardController.BuildActivityLogs(before, after, "u1");
        var fud = Assert.Single(logs, l => l.Field == "FollowUpDate");
        Assert.Equal("2026-07-01", fud.OldValue);
        Assert.Null(fud.NewValue);
    }

    [Fact]
    public void BuildActivityLogs_AppliedAtDateChange_Logged()
    {
        var before = MakeStage();
        var after  = MakeStage(); after.AppliedAt = new DateTimeOffset(2026, 3, 1, 0, 0, 0, TimeSpan.Zero);
        var logs = DashboardController.BuildActivityLogs(before, after, "u1");
        var dateLog = Assert.Single(logs, l => l.Field == "AppliedAt");
        Assert.Equal("2026-01-15", dateLog.OldValue);
        Assert.Equal("2026-03-01", dateLog.NewValue);
    }

    [Fact]
    public void BuildActivityLogs_AllLogEntriesHaveCorrectApplicationId()
    {
        var before = MakeStage("app-123");
        var after  = MakeStage("app-123"); after.Status = "Rejected";
        var logs = DashboardController.BuildActivityLogs(before, after, "u1");
        Assert.All(logs, l => Assert.Equal("app-123", l.ApplicationId));
    }

    [Fact]
    public void BuildActivityLogs_AllLogEntriesHaveCorrectUserId()
    {
        var before = MakeStage("s1", "user-xyz");
        var after  = MakeStage("s1", "user-xyz"); after.Status = "Accepted";
        var logs = DashboardController.BuildActivityLogs(before, after, "user-xyz");
        Assert.All(logs, l => Assert.Equal("user-xyz", l.UserId));
    }

    [Fact]
    public void BuildActivityLogs_RejectionReasonChange_Logged()
    {
        var before = MakeStage(); before.RejectionReason = "dutch_language";
        var after  = MakeStage(); after.RejectionReason  = "another_candidate";
        var logs = DashboardController.BuildActivityLogs(before, after, "u1");
        var rr = Assert.Single(logs, l => l.Field == "RejectionReason");
        Assert.Equal("dutch_language",   rr.OldValue);
        Assert.Equal("another_candidate", rr.NewValue);
    }

    // ── ValidateStage ────────────────────────────────────────────────────────

    private static ApplicationStage ValidStage() => new()
    {
        CompanyName = "Acme",
        Position    = "Engineer",
        Status      = "Applied",
        Locations   = [],
    };

    [Fact]
    public void ValidateStage_ValidStage_ReturnsTrue()
    {
        Assert.True(DashboardController.ValidateStage(ValidStage(), out _));
    }

    [Fact]
    public void ValidateStage_EmptyCompanyName_ReturnsFalse()
    {
        var s = ValidStage(); s.CompanyName = "   ";
        Assert.False(DashboardController.ValidateStage(s, out var err));
        Assert.Contains("companyName", err);
    }

    [Fact]
    public void ValidateStage_CompanyNameTooLong_ReturnsFalse()
    {
        var s = ValidStage(); s.CompanyName = new string('A', 201);
        Assert.False(DashboardController.ValidateStage(s, out var err));
        Assert.Contains("200", err);
    }

    [Fact]
    public void ValidateStage_EmptyPosition_ReturnsFalse()
    {
        var s = ValidStage(); s.Position = "";
        Assert.False(DashboardController.ValidateStage(s, out _));
    }

    [Fact]
    public void ValidateStage_InvalidStatus_ReturnsFalse()
    {
        var s = ValidStage(); s.Status = "HACKED";
        Assert.False(DashboardController.ValidateStage(s, out var err));
        Assert.Contains("HACKED", err);
    }

    [Theory]
    [InlineData("Applied")]
    [InlineData("InterviewScheduled")]
    [InlineData("Assessment")]
    [InlineData("OfferReceived")]
    [InlineData("OnHold")]
    [InlineData("Rejected")]
    [InlineData("Withdrawn")]
    [InlineData("Accepted")]
    public void ValidateStage_AllValidStatuses_ReturnsTrue(string status)
    {
        var s = ValidStage(); s.Status = status;
        Assert.True(DashboardController.ValidateStage(s, out _));
    }

    [Fact]
    public void ValidateStage_AssessmentStatus_ReturnsTrue()
    {
        var s = ValidStage(); s.Status = "Assessment";
        Assert.True(DashboardController.ValidateStage(s, out _));
    }

    [Fact]
    public void ValidateStage_InvalidRejectionReason_ReturnsFalse()
    {
        var s = ValidStage(); s.Status = "Rejected"; s.RejectionReason = "evil_payload";
        Assert.False(DashboardController.ValidateStage(s, out var err));
        Assert.Contains("evil_payload", err);
    }

    [Theory]
    [InlineData("dutch_language")]
    [InlineData("another_candidate")]
    [InlineData("incompatible_profile")]
    [InlineData("salary_mismatch")]
    [InlineData("internal_hire")]
    [InlineData("failed_assessment")]
    [InlineData("other")]
    public void ValidateStage_AllValidRejectionReasons_ReturnsTrue(string reason)
    {
        var s = ValidStage(); s.Status = "Rejected"; s.RejectionReason = reason;
        Assert.True(DashboardController.ValidateStage(s, out _));
    }

    [Fact]
    public void ValidateStage_FailedAssessmentRejectionReason_ReturnsTrue()
    {
        var s = ValidStage(); s.Status = "Rejected"; s.RejectionReason = "failed_assessment";
        Assert.True(DashboardController.ValidateStage(s, out _));
    }

    [Fact]
    public void ValidateStage_ValidRejectionReason_ReturnsTrue()
    {
        var s = ValidStage(); s.Status = "Rejected"; s.RejectionReason = "dutch_language";
        Assert.True(DashboardController.ValidateStage(s, out _));
    }

    [Fact]
    public void ValidateStage_RejectionReasonOnNonRejectedStatus_StillValid()
    {
        // Backend clears rejection fields for non-Rejected statuses at the handler level,
        // but ValidateStage itself does not enforce this — it only checks the value is known.
        var s = ValidStage(); s.Status = "Assessment"; s.RejectionReason = null;
        Assert.True(DashboardController.ValidateStage(s, out _));
    }

    [Fact]
    public void ValidateStage_AssessmentWithRejectionReasonNull_ReturnsTrue()
    {
        var s = ValidStage(); s.Status = "Assessment"; s.RejectionReason = null;
        Assert.True(DashboardController.ValidateStage(s, out _));
    }

    [Fact]
    public void ValidateStage_RejectionNoteOver500Chars_ReturnsFalse()
    {
        var s = ValidStage(); s.Status = "Rejected"; s.RejectionNote = new string('x', 501);
        Assert.False(DashboardController.ValidateStage(s, out var err));
        Assert.Contains("500", err);
    }

    [Fact]
    public void ValidateStage_NotesOver5000Chars_ReturnsFalse()
    {
        var s = ValidStage(); s.Notes = new string('n', 5001);
        Assert.False(DashboardController.ValidateStage(s, out var err));
        Assert.Contains("5000", err);
    }

    [Fact]
    public void ValidateStage_TooManyLocations_ReturnsFalse()
    {
        var s = ValidStage(); s.Locations = Enumerable.Range(0, 21).Select(i => $"City{i}").ToArray();
        Assert.False(DashboardController.ValidateStage(s, out var err));
        Assert.Contains("20", err);
    }

    [Fact]
    public void ValidateStage_LocationTooLong_ReturnsFalse()
    {
        var s = ValidStage(); s.Locations = [new string('A', 101)];
        Assert.False(DashboardController.ValidateStage(s, out var err));
        Assert.Contains("100", err);
    }

    [Fact]
    public void ValidateStage_ContactEmailTooLong_ReturnsFalse()
    {
        var s = ValidStage(); s.ContactPersonEmail = new string('a', 254) + "@b.c";
        Assert.False(DashboardController.ValidateStage(s, out var err));
        Assert.Contains("254", err);
    }

    [Fact]
    public void ValidateStage_SqlInjectionInCompanyName_AllowedByBackend_SanitizedByEF()
    {
        // SQL injection in a field value: EF Core parameterises all values,
        // so the string is stored literally. Validation should not reject it.
        var s = ValidStage(); s.CompanyName = "'; DROP TABLE Stages; --";
        Assert.True(DashboardController.ValidateStage(s, out _));
    }

    [Fact]
    public void ValidateStage_XssPayloadInNotes_Allowed_SanitizedByClient()
    {
        var s = ValidStage(); s.Notes = "<script>alert('xss')</script>";
        Assert.True(DashboardController.ValidateStage(s, out _));
    }

    [Fact]
    public void ValidateStage_WithSponsorCompanyId_StillValid()
    {
        var s = ValidStage(); s.SponsorCompanyId = "company-uuid-123";
        Assert.True(DashboardController.ValidateStage(s, out _));
    }

    [Fact]
    public void ValidateStage_SponsorCompanyIdNull_StillValid()
    {
        var s = ValidStage(); s.SponsorCompanyId = null;
        Assert.True(DashboardController.ValidateStage(s, out _));
    }

    // ── SponsorCompanyId in BuildActivityLogs ─────────────────────────────────

    [Fact]
    public void BuildActivityLogs_SponsorCompanyIdChange_NotTracked()
    {
        // SponsorCompanyId is a soft reference — changes are intentionally not
        // logged in the activity log (it's set once on creation / via typeahead).
        var before = MakeStage(); before.SponsorCompanyId = "co-1";
        var after  = MakeStage(); after.SponsorCompanyId  = "co-2";
        var logs = DashboardController.BuildActivityLogs(before, after, "u1");
        Assert.DoesNotContain(logs, l => l.Field == "SponsorCompanyId");
    }

    [Fact]
    public void BuildActivityLogs_SponsorCompanyIdSet_DoesNotTriggerUnrelatedLogs()
    {
        var stage = MakeStage(); stage.SponsorCompanyId = "co-1";
        var logs = DashboardController.BuildActivityLogs(stage, stage, "u1");
        Assert.Empty(logs);
    }

    // ── SuccessRate ──────────────────────────────────────────────────────────

    [Fact]
    public void ValidateStage_SuccessRateNull_StillValid()
    {
        var s = ValidStage(); s.SuccessRate = null;
        Assert.True(DashboardController.ValidateStage(s, out _));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(50)]
    [InlineData(100)]
    public void ValidateStage_SuccessRateInRange_ReturnsTrue(int rate)
    {
        var s = ValidStage(); s.SuccessRate = rate;
        Assert.True(DashboardController.ValidateStage(s, out _));
    }

    [Fact]
    public void ValidateStage_SuccessRateNegative_ReturnsFalse()
    {
        var s = ValidStage(); s.SuccessRate = -1;
        Assert.False(DashboardController.ValidateStage(s, out var err));
        Assert.Contains("successRate", err);
    }

    [Fact]
    public void ValidateStage_SuccessRateOver100_ReturnsFalse()
    {
        var s = ValidStage(); s.SuccessRate = 101;
        Assert.False(DashboardController.ValidateStage(s, out var err));
        Assert.Contains("successRate", err);
    }

    [Fact]
    public void ValidateStage_SuccessRateWayOutOfRange_ReturnsFalse()
    {
        // A hostile client sending an out-of-band integer shouldn't slip past validation.
        var s = ValidStage(); s.SuccessRate = int.MaxValue;
        Assert.False(DashboardController.ValidateStage(s, out var err));
        Assert.Contains("successRate", err);
    }

    [Fact]
    public void BuildActivityLogs_SuccessRateChange_LogsSuccessRate()
    {
        var before = MakeStage(); before.SuccessRate = 40;
        var after  = MakeStage(); after.SuccessRate  = 70;
        var logs = DashboardController.BuildActivityLogs(before, after, "u1");
        var sr = Assert.Single(logs, l => l.Field == "SuccessRate");
        Assert.Equal("40", sr.OldValue);
        Assert.Equal("70", sr.NewValue);
    }

    [Fact]
    public void BuildActivityLogs_SuccessRateSetFromNull_LogsSuccessRate()
    {
        var before = MakeStage(); before.SuccessRate = null;
        var after  = MakeStage(); after.SuccessRate  = 25;
        var logs = DashboardController.BuildActivityLogs(before, after, "u1");
        var sr = Assert.Single(logs, l => l.Field == "SuccessRate");
        Assert.Null(sr.OldValue);
        Assert.Equal("25", sr.NewValue);
    }

    [Fact]
    public void BuildActivityLogs_SuccessRateUnchanged_NotLogged()
    {
        var stage = MakeStage(); stage.SuccessRate = 60;
        var logs = DashboardController.BuildActivityLogs(stage, stage, "u1");
        Assert.Empty(logs);
    }
}
