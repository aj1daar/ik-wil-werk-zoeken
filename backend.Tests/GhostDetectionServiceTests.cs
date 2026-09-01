using backend.Data;
using backend.Models;
using backend.Services;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace backend.Tests;

/// <summary>
/// Uses SQLite in-memory, same rationale as StageStoreTests: a fresh
/// connection per test, foreign keys off so stages don't need a seeded User.
/// </summary>
public sealed class GhostDetectionServiceTests : IDisposable
{
    private readonly SqliteConnection _conn;
    private readonly AppDbContext _db;
    private readonly GhostDetectionService _service = new();
    private static readonly DateTimeOffset Now = new(2026, 9, 1, 12, 0, 0, TimeSpan.Zero);

    public GhostDetectionServiceTests()
    {
        _conn = new SqliteConnection("DataSource=:memory:");
        _conn.Open();
        using var cmd = _conn.CreateCommand();
        cmd.CommandText = "PRAGMA foreign_keys = OFF;";
        cmd.ExecuteNonQuery();

        _db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite(_conn)
            .Options);
        _db.Database.EnsureCreated();
    }

    public void Dispose() { _db.Dispose(); _conn.Dispose(); }

    private static ApplicationStage MakeStage(
        string userId, string status, DateTimeOffset updatedAt, string? id = null) => new()
    {
        Id          = id ?? Guid.NewGuid().ToString("N"),
        UserId      = userId,
        CompanyName = "Acme",
        Position    = "Engineer",
        AppliedAt   = updatedAt,
        UpdatedAt   = updatedAt,
        Status      = status,
        Locations   = [],
    };

    // ── ghosting eligible stages ─────────────────────────────────────────────

    [Fact]
    public async Task SweepAsync_AppliedOlderThanTwoMonths_BecomesGhosted()
    {
        _db.Stages.Add(MakeStage("u1", "Applied", Now.AddMonths(-3), "s1"));
        await _db.SaveChangesAsync();

        var count = await _service.SweepAsync(_db, Now);

        Assert.Equal(1, count);
        Assert.Equal("Ghosted", (await _db.Stages.FindAsync("s1"))!.Status);
    }

    [Fact]
    public async Task SweepAsync_ExactlyTwoMonthsOld_BecomesGhosted()
    {
        _db.Stages.Add(MakeStage("u1", "Applied", Now.AddMonths(-2), "s1"));
        await _db.SaveChangesAsync();

        var count = await _service.SweepAsync(_db, Now);

        Assert.Equal(1, count);
        Assert.Equal("Ghosted", (await _db.Stages.FindAsync("s1"))!.Status);
    }

    [Fact]
    public async Task SweepAsync_GhostedStage_BumpsUpdatedAt()
    {
        _db.Stages.Add(MakeStage("u1", "Applied", Now.AddMonths(-3), "s1"));
        await _db.SaveChangesAsync();

        await _service.SweepAsync(_db, Now);

        Assert.Equal(Now, (await _db.Stages.FindAsync("s1"))!.UpdatedAt);
    }

    [Fact]
    public async Task SweepAsync_GhostedStage_AddsStatusHistoryEntry()
    {
        _db.Stages.Add(MakeStage("u1", "Applied", Now.AddMonths(-3), "s1"));
        await _db.SaveChangesAsync();

        await _service.SweepAsync(_db, Now);

        var entry = await _db.StatusHistories.SingleAsync(h => h.ApplicationId == "s1");
        Assert.Equal("Ghosted", entry.Status);
        Assert.Equal("u1", entry.UserId);
        Assert.Equal(DateOnly.FromDateTime(Now.UtcDateTime), entry.StatusDate);
    }

    [Fact]
    public async Task SweepAsync_GhostedStage_AddsActivityLogEntry()
    {
        _db.Stages.Add(MakeStage("u1", "Applied", Now.AddMonths(-3), "s1"));
        await _db.SaveChangesAsync();

        await _service.SweepAsync(_db, Now);

        var log = await _db.ActivityLogs.SingleAsync(l => l.ApplicationId == "s1");
        Assert.Equal("Status", log.Field);
        Assert.Equal("Applied", log.OldValue);
        Assert.Equal("Ghosted", log.NewValue);
        Assert.Equal("u1", log.UserId);
    }

    [Fact]
    public async Task SweepAsync_MultipleStaleStagesAcrossUsers_AllGhosted()
    {
        _db.Stages.AddRange(
            MakeStage("u1", "Applied", Now.AddMonths(-3), "s1"),
            MakeStage("u2", "Applied", Now.AddMonths(-4), "s2"),
            MakeStage("u1", "Applied", Now.AddMonths(-6), "s3"));
        await _db.SaveChangesAsync();

        var count = await _service.SweepAsync(_db, Now);

        Assert.Equal(3, count);
        Assert.All(await _db.Stages.ToListAsync(), s => Assert.Equal("Ghosted", s.Status));
    }

    // ── stages that must NOT be touched ──────────────────────────────────────

    [Fact]
    public async Task SweepAsync_AppliedUnderTwoMonths_IsUntouched()
    {
        _db.Stages.Add(MakeStage("u1", "Applied", Now.AddMonths(-1), "s1"));
        await _db.SaveChangesAsync();

        var count = await _service.SweepAsync(_db, Now);

        Assert.Equal(0, count);
        Assert.Equal("Applied", (await _db.Stages.FindAsync("s1"))!.Status);
    }

    [Fact]
    public async Task SweepAsync_RecentlyTouchedApplied_IsUntouched()
    {
        // Would be stale by AppliedAt alone, but UpdatedAt (an edit) is recent.
        var stage = MakeStage("u1", "Applied", Now.AddMonths(-1), "s1");
        stage.AppliedAt = Now.AddMonths(-5);
        _db.Stages.Add(stage);
        await _db.SaveChangesAsync();

        var count = await _service.SweepAsync(_db, Now);

        Assert.Equal(0, count);
    }

    [Theory]
    [InlineData("InterviewScheduled")]
    [InlineData("Assessment")]
    [InlineData("OfferReceived")]
    [InlineData("OnHold")]
    [InlineData("Rejected")]
    [InlineData("Withdrawn")]
    [InlineData("Accepted")]
    [InlineData("Ghosted")]
    public async Task SweepAsync_NonAppliedStatus_NeverTouchedRegardlessOfAge(string status)
    {
        _db.Stages.Add(MakeStage("u1", status, Now.AddMonths(-12), "s1"));
        await _db.SaveChangesAsync();

        var count = await _service.SweepAsync(_db, Now);

        Assert.Equal(0, count);
        Assert.Equal(status, (await _db.Stages.FindAsync("s1"))!.Status);
    }

    [Fact]
    public async Task SweepAsync_AlreadyGhosted_DoesNotDuplicateHistoryOrLogs()
    {
        _db.Stages.Add(MakeStage("u1", "Ghosted", Now.AddMonths(-12), "s1"));
        await _db.SaveChangesAsync();

        await _service.SweepAsync(_db, Now);

        Assert.Empty(await _db.StatusHistories.ToListAsync());
        Assert.Empty(await _db.ActivityLogs.ToListAsync());
    }

    // ── no-op cases ───────────────────────────────────────────────────────────

    [Fact]
    public async Task SweepAsync_EmptyDatabase_ReturnsZeroAndDoesNotThrow() =>
        Assert.Equal(0, await _service.SweepAsync(_db, Now));

    [Fact]
    public async Task SweepAsync_NoEligibleStages_LeavesHistoryAndLogsEmpty()
    {
        _db.Stages.Add(MakeStage("u1", "Applied", Now, "s1"));
        await _db.SaveChangesAsync();

        await _service.SweepAsync(_db, Now);

        Assert.Empty(await _db.StatusHistories.ToListAsync());
        Assert.Empty(await _db.ActivityLogs.ToListAsync());
    }
}
