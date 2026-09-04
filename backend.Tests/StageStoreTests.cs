using backend.Data;
using backend.Models;
using backend.Services;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace backend.Tests;

/// <summary>
/// Uses SQLite in-memory so that ExecuteDeleteAsync (unsupported by the EF
/// InMemory provider) works. xUnit creates a new class instance per test, so
/// the connection/context is always fresh and tests never share state.
/// </summary>
public sealed class StageStoreTests : IDisposable
{
    private readonly SqliteConnection _conn;
    private readonly AppDbContext _db;
    private readonly StageStore _store;

    public StageStoreTests()
    {
        _conn = new SqliteConnection("DataSource=:memory:");
        _conn.Open();
        // Disable FK enforcement so stage tests don't need to seed a User row first.
        using var cmd = _conn.CreateCommand();
        cmd.CommandText = "PRAGMA foreign_keys = OFF;";
        cmd.ExecuteNonQuery();

        _db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite(_conn)
            .Options);
        _db.Database.EnsureCreated();
        _store = new StageStore(_db);
    }

    public void Dispose() { _db.Dispose(); _conn.Dispose(); }

    private static ApplicationStage MakeStage(string userId, string? id = null) => new()
    {
        Id          = id ?? Guid.NewGuid().ToString("N"),
        UserId      = userId,
        CompanyName = "Acme",
        Position    = "Engineer",
        AppliedAt   = DateTimeOffset.UtcNow,
        Status      = "Applied",
        Locations   = [],
    };

    // ── GetByUserIdAsync ──────────────────────────────────────────────────────

    [Fact]
    public async Task GetByUserId_ReturnsOnlyUserStages()
    {
        _db.Stages.AddRange(MakeStage("user-1"), MakeStage("user-2"), MakeStage("user-1"));
        await _db.SaveChangesAsync();

        var result = await _store.GetByUserIdAsync("user-1");
        Assert.Equal(2, result.Count);
        Assert.All(result, s => Assert.Equal("user-1", s.UserId));
    }

    [Fact]
    public async Task GetByUserId_UnknownUser_ReturnsEmpty()
    {
        _db.Stages.Add(MakeStage("user-1"));
        await _db.SaveChangesAsync();

        Assert.Empty(await _store.GetByUserIdAsync("nobody"));
    }

    [Fact]
    public async Task GetByUserId_NoStages_ReturnsEmpty() =>
        Assert.Empty(await _store.GetByUserIdAsync("user-1"));

    // ── GetAsync ──────────────────────────────────────────────────────────────

    [Fact]
    public async Task GetAsync_ReturnsMatchingStage()
    {
        _db.Stages.Add(MakeStage("user-1", "id-abc"));
        await _db.SaveChangesAsync();

        var result = await _store.GetAsync("user-1", "id-abc");
        Assert.NotNull(result);
        Assert.Equal("id-abc", result.Id);
    }

    [Fact]
    public async Task GetAsync_WrongUser_ReturnsNull()
    {
        _db.Stages.Add(MakeStage("user-1", "id-abc"));
        await _db.SaveChangesAsync();

        Assert.Null(await _store.GetAsync("user-2", "id-abc"));
    }

    [Fact]
    public async Task GetAsync_WrongId_ReturnsNull()
    {
        _db.Stages.Add(MakeStage("user-1", "id-abc"));
        await _db.SaveChangesAsync();

        Assert.Null(await _store.GetAsync("user-1", "id-XXXX"));
    }

    // ── UpsertAsync – create ──────────────────────────────────────────────────

    [Fact]
    public async Task UpsertAsync_NewStage_IsInserted()
    {
        await _store.UpsertAsync(MakeStage("user-1", "new-id"));

        Assert.Equal(1, await _db.Stages.CountAsync());
        Assert.Equal("new-id", (await _db.Stages.FirstAsync()).Id);
    }

    [Fact]
    public async Task UpsertAsync_TwoNewStages_BothInserted()
    {
        await _store.UpsertAsync(MakeStage("user-1", "id-1"));
        await _store.UpsertAsync(MakeStage("user-1", "id-2"));

        Assert.Equal(2, await _db.Stages.CountAsync());
    }

    // ── UpsertAsync – update ──────────────────────────────────────────────────

    [Fact]
    public async Task UpsertAsync_ExistingStage_IsUpdated()
    {
        _db.Stages.Add(MakeStage("user-1", "id-1"));
        await _db.SaveChangesAsync();

        var updated = MakeStage("user-1", "id-1");
        updated.CompanyName = "NewCorp";
        await _store.UpsertAsync(updated);

        var stored = await _db.Stages.FindAsync("id-1");
        Assert.Equal("NewCorp", stored!.CompanyName);
    }

    [Fact]
    public async Task UpsertAsync_ExistingStage_DoesNotDuplicate()
    {
        _db.Stages.Add(MakeStage("user-1", "id-1"));
        await _db.SaveChangesAsync();

        await _store.UpsertAsync(MakeStage("user-1", "id-1"));
        Assert.Equal(1, await _db.Stages.CountAsync());
    }

    [Fact]
    public async Task UpsertAsync_MutatesTheCallersTrackedReferenceInPlace()
    {
        // Documents a real gotcha DashboardController.UpdateApplication hit: because
        // GetAsync and UpsertAsync share the same DbContext, EF's identity map hands
        // both callers the SAME tracked ApplicationStage instance. UpsertAsync's
        // CurrentValues.SetValues therefore overwrites fields on whatever the caller
        // is still holding — a caller that fetched "existing" via GetAsync and then
        // diffs existing.Status against the new status AFTER calling UpsertAsync will
        // always see them as equal, because existing was quietly rewritten too. Any
        // before/after comparison has to capture the old value before calling Upsert.
        _db.Stages.Add(MakeStage("user-1", "id-1"));
        await _db.SaveChangesAsync();

        var existing = await _store.GetAsync("user-1", "id-1");
        var previousStatus = existing!.Status;

        var updated = MakeStage("user-1", "id-1");
        updated.Status = "InterviewScheduled";
        await _store.UpsertAsync(updated);

        Assert.Equal("Applied", previousStatus);           // captured before the upsert — still correct
        Assert.Equal("InterviewScheduled", existing.Status); // same reference — silently mutated
    }

    // ── DeleteAsync ───────────────────────────────────────────────────────────

    [Fact]
    public async Task DeleteAsync_ExistingStage_ReturnsTrueAndRemoves()
    {
        _db.Stages.Add(MakeStage("user-1", "id-1"));
        await _db.SaveChangesAsync();

        Assert.True(await _store.DeleteAsync("user-1", "id-1"));
        Assert.Equal(0, await _db.Stages.CountAsync());
    }

    [Fact]
    public async Task DeleteAsync_WrongUser_ReturnsFalseAndKeepsStage()
    {
        _db.Stages.Add(MakeStage("user-1", "id-1"));
        await _db.SaveChangesAsync();

        Assert.False(await _store.DeleteAsync("user-2", "id-1"));
        Assert.Equal(1, await _db.Stages.CountAsync());
    }

    [Fact]
    public async Task DeleteAsync_NonExistentId_ReturnsFalse() =>
        Assert.False(await _store.DeleteAsync("user-1", "no-such-id"));

    [Fact]
    public async Task DeleteAsync_OnlyDeletesTargetedStage()
    {
        _db.Stages.AddRange(MakeStage("user-1", "id-1"), MakeStage("user-1", "id-2"));
        await _db.SaveChangesAsync();

        await _store.DeleteAsync("user-1", "id-1");

        Assert.Equal(1, await _db.Stages.CountAsync());
        Assert.Equal("id-2", (await _db.Stages.SingleAsync()).Id);
    }

    // ── DeleteAllByUserIdAsync ────────────────────────────────────────────────

    [Fact]
    public async Task DeleteAllByUserId_RemovesOnlyUserStages()
    {
        _db.Stages.AddRange(MakeStage("user-1"), MakeStage("user-1"), MakeStage("user-2"));
        await _db.SaveChangesAsync();

        await _store.DeleteAllByUserIdAsync("user-1");

        var remaining = await _db.Stages.ToListAsync();
        Assert.Single(remaining);
        Assert.Equal("user-2", remaining[0].UserId);
    }

    [Fact]
    public async Task DeleteAllByUserId_NoStages_DoesNotThrow()
    {
        await _store.DeleteAllByUserIdAsync("ghost-user");
        Assert.Equal(0, await _db.Stages.CountAsync());
    }
}
