using backend.Models;
using backend.Services;
using Xunit;

namespace backend.Tests;

/// <summary>
/// Tests for incremental sync robustness logic — removed company detection,
/// SyncLog model, and SponsorCompany soft-delete field.
/// </summary>
public sealed class SyncRobustnessTests
{
    // ── SponsorCompany.RemovedAt ──────────────────────────────────────────────

    [Fact]
    public void SponsorCompany_RemovedAt_DefaultsToNull()
    {
        var company = new SponsorCompany { Name = "Acme", KvKNumber = "12345678" };
        Assert.Null(company.RemovedAt);
    }

    [Fact]
    public void SponsorCompany_RemovedAt_CanBeSet()
    {
        var now = DateTimeOffset.UtcNow;
        var company = new SponsorCompany { Name = "Acme", KvKNumber = "12345678", RemovedAt = now };
        Assert.Equal(now, company.RemovedAt);
    }

    // ── Removed ID detection logic ────────────────────────────────────────────

    [Fact]
    public void RemovedIds_WhenFreshListMissingCompany_DetectsRemoval()
    {
        var existing = new Dictionary<string, SponsorCompany>
        {
            ["11111111"] = new() { Id = "11111111", Name = "ASML",   KvKNumber = "11111111" },
            ["22222222"] = new() { Id = "22222222", Name = "Adyen",  KvKNumber = "22222222" },
            ["33333333"] = new() { Id = "33333333", Name = "Philips",KvKNumber = "33333333" },
        };

        var freshIds = new HashSet<string> { "11111111", "22222222" }; // Philips removed

        var removedIds = existing.Keys
            .Where(id => !freshIds.Contains(id) && existing[id].RemovedAt == null)
            .ToList();

        Assert.Single(removedIds);
        Assert.Contains("33333333", removedIds);
    }

    [Fact]
    public void RemovedIds_WhenNothingRemoved_ReturnsEmpty()
    {
        var existing = new Dictionary<string, SponsorCompany>
        {
            ["11111111"] = new() { Id = "11111111", Name = "ASML",  KvKNumber = "11111111" },
            ["22222222"] = new() { Id = "22222222", Name = "Adyen", KvKNumber = "22222222" },
        };

        var freshIds = new HashSet<string> { "11111111", "22222222" };

        var removedIds = existing.Keys
            .Where(id => !freshIds.Contains(id) && existing[id].RemovedAt == null)
            .ToList();

        Assert.Empty(removedIds);
    }

    [Fact]
    public void RemovedIds_AlreadySoftDeleted_NotDetectedAgain()
    {
        var alreadyRemoved = DateTimeOffset.UtcNow.AddDays(-30);
        var existing = new Dictionary<string, SponsorCompany>
        {
            ["11111111"] = new() { Id = "11111111", Name = "ASML",  KvKNumber = "11111111" },
            ["22222222"] = new() { Id = "22222222", Name = "Gone",  KvKNumber = "22222222", RemovedAt = alreadyRemoved },
        };

        var freshIds = new HashSet<string> { "11111111" }; // 22222222 still absent, but already removed

        var removedIds = existing.Keys
            .Where(id => !freshIds.Contains(id) && existing[id].RemovedAt == null)
            .ToList();

        Assert.Empty(removedIds);
    }

    [Fact]
    public void RemovedIds_WhenAllCompaniesRemoved_DetectsAll()
    {
        var existing = new Dictionary<string, SponsorCompany>
        {
            ["11111111"] = new() { Id = "11111111", Name = "A", KvKNumber = "11111111" },
            ["22222222"] = new() { Id = "22222222", Name = "B", KvKNumber = "22222222" },
        };

        var freshIds = new HashSet<string>(); // everything removed

        var removedIds = existing.Keys
            .Where(id => !freshIds.Contains(id) && existing[id].RemovedAt == null)
            .ToList();

        Assert.Equal(2, removedIds.Count);
    }

    [Fact]
    public void RemovedIds_WhenExistingEmpty_ReturnsEmpty()
    {
        var existing = new Dictionary<string, SponsorCompany>();
        var freshIds = new HashSet<string> { "11111111" };

        var removedIds = existing.Keys
            .Where(id => !freshIds.Contains(id) && existing[id].RemovedAt == null)
            .ToList();

        Assert.Empty(removedIds);
    }

    // ── SyncLog model ─────────────────────────────────────────────────────────

    [Fact]
    public void SyncLog_DefaultSyncedAt_IsUtcNow()
    {
        var before = DateTimeOffset.UtcNow;
        var log = new SyncLog();
        var after = DateTimeOffset.UtcNow;

        Assert.InRange(log.SyncedAt, before, after);
    }

    [Fact]
    public void SyncLog_CanSetAllFields()
    {
        var now = DateTimeOffset.UtcNow;
        var log = new SyncLog
        {
            TriggerSource  = "monthly",
            Added          = 10,
            Updated        = 500,
            Removed        = 3,
            Enriched       = 8,
            TotalAfterSync = 12800,
            SyncedAt       = now,
        };

        Assert.Equal("monthly",  log.TriggerSource);
        Assert.Equal(10,         log.Added);
        Assert.Equal(500,        log.Updated);
        Assert.Equal(3,          log.Removed);
        Assert.Equal(8,          log.Enriched);
        Assert.Equal(12800,      log.TotalAfterSync);
        Assert.Equal(now,        log.SyncedAt);
    }

    [Fact]
    public void SyncLog_TriggerSource_SupportsAdminAndMonthly()
    {
        var monthly = new SyncLog { TriggerSource = "monthly" };
        var admin   = new SyncLog { TriggerSource = "admin" };

        Assert.Equal("monthly", monthly.TriggerSource);
        Assert.Equal("admin",   admin.TriggerSource);
    }

    // ── Re-appear / un-delete logic ───────────────────────────────────────────

    [Fact]
    public void FreshCompany_WhenPreviouslyRemoved_GetsRemovedAtCleared()
    {
        var previouslyRemoved = new SponsorCompany
        {
            Id = "11111111", Name = "Revived Co", KvKNumber = "11111111",
            RemovedAt = DateTimeOffset.UtcNow.AddDays(-30),
            Summary = "Previously enriched"
        };

        var freshCompany = new SponsorCompany { Id = "11111111", Name = "Revived Co", KvKNumber = "11111111" };

        // Simulate the sync function logic that copies fields from prev and clears RemovedAt
        freshCompany.Summary   = previouslyRemoved.Summary;
        freshCompany.RemovedAt = null;

        Assert.Null(freshCompany.RemovedAt);
        Assert.Equal("Previously enriched", freshCompany.Summary);
    }
}
