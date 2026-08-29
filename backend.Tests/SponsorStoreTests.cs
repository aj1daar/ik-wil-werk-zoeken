using backend.Data;
using backend.Models;
using backend.Services;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace backend.Tests;

/// <summary>
/// Uses SQLite in-memory so that ExecuteUpdateAsync (unsupported by the EF
/// InMemory provider) works. xUnit creates a new class instance per test, so
/// the connection/context is always fresh and tests never share state.
/// </summary>
public sealed class SponsorStoreTests : IDisposable
{
    private readonly SqliteConnection _conn;
    private readonly AppDbContext _db;
    private readonly SponsorStore _store;

    public SponsorStoreTests()
    {
        _conn = new SqliteConnection("DataSource=:memory:");
        _conn.Open();

        _db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite(_conn)
            .Options);
        _db.Database.EnsureCreated();
        _store = new SponsorStore(_db);
    }

    public void Dispose() { _db.Dispose(); _conn.Dispose(); }

    private static SponsorCompany MakeCompany(string? id = null) => new()
    {
        Id        = id ?? Guid.NewGuid().ToString("N"),
        Name      = "Acme B.V.",
        KvKNumber = "12345678",
        City      = "Amsterdam",
        Summary   = "Original LLM-generated summary.",
        EnrichmentVersion = 1,
        EnrichedAt = DateTimeOffset.UtcNow.AddDays(-30),
    };

    // ── UpdateCompanyAsync ───────────────────────────────────────────────────

    private static CompanyEdit Edit(
        string? summary = null,
        string? city = null,
        string[]? locations = null,
        string? websiteUrl = null,
        string? coreIndustry = null,
        string[]? techStackTags = null,
        string[]? functionalTags = null,
        string? workingLanguage = null,
        string? companySize = null,
        string? remotePolicy = null,
        string? parentCompanyName = null,
        string? targetMarket = null) =>
        new(summary, city, locations, websiteUrl, coreIndustry, techStackTags, functionalTags,
            workingLanguage, companySize, remotePolicy, parentCompanyName, targetMarket);

    [Fact]
    public async Task UpdateCompanyAsync_ExistingCompany_UpdatesSummary()
    {
        _db.Sponsors.Add(MakeCompany("co-1"));
        await _db.SaveChangesAsync();

        var result = await _store.UpdateCompanyAsync("co-1", Edit(summary: "A hand-written description."));

        Assert.NotNull(result);
        Assert.Equal("A hand-written description.", result!.Summary);
        var stored = await _db.Sponsors.FindAsync("co-1");
        Assert.Equal("A hand-written description.", stored!.Summary);
    }

    [Fact]
    public async Task UpdateCompanyAsync_PersistsEveryField()
    {
        _db.Sponsors.Add(MakeCompany("co-1"));
        await _db.SaveChangesAsync();

        await _store.UpdateCompanyAsync("co-1", Edit(
            summary: "S", city: "Rotterdam",
            locations: ["Rotterdam", "Delft"],
            websiteUrl: "https://acme.example/",
            coreIndustry: "Logistics",
            techStackTags: ["Go", "Kafka"],
            functionalTags: ["B2B"],
            workingLanguage: "English", companySize: "scaleup", remotePolicy: "hybrid",
            parentCompanyName: "Acme Holding", targetMarket: "EU"));

        var stored = await _db.Sponsors.FindAsync("co-1");
        Assert.Equal("Rotterdam", stored!.City);
        Assert.Equal(["Rotterdam", "Delft"], stored.Locations!);
        Assert.Equal("https://acme.example/", stored.WebsiteUrl);
        Assert.Equal("Logistics", stored.CoreIndustry);
        Assert.Equal(["Go", "Kafka"], stored.TechStackTags!);
        Assert.Equal(["B2B"], stored.FunctionalTags!);
        Assert.Equal("English", stored.WorkingLanguage);
        Assert.Equal("scaleup", stored.CompanySize);
        Assert.Equal("hybrid", stored.RemotePolicy);
        Assert.Equal("Acme Holding", stored.ParentCompanyName);
        Assert.Equal("EU", stored.TargetMarket);
    }

    [Fact]
    public async Task UpdateCompanyAsync_NullFields_ClearThoseColumns()
    {
        var seeded = MakeCompany("co-1");
        seeded.City = "Amsterdam";
        seeded.TechStackTags = ["Java"];
        _db.Sponsors.Add(seeded);
        await _db.SaveChangesAsync();

        await _store.UpdateCompanyAsync("co-1", Edit());

        var stored = await _db.Sponsors.FindAsync("co-1");
        Assert.Null(stored!.Summary);
        Assert.Null(stored.City);
        Assert.Null(stored.TechStackTags);
        Assert.Null(stored.Locations);
    }

    [Fact]
    public async Task UpdateCompanyAsync_DoesNotChangeIdentityColumns()
    {
        _db.Sponsors.Add(MakeCompany("co-1"));
        await _db.SaveChangesAsync();

        await _store.UpdateCompanyAsync("co-1", Edit(summary: "New."));

        var stored = await _db.Sponsors.FindAsync("co-1");
        Assert.Equal("Acme B.V.", stored!.Name);
        Assert.Equal("12345678", stored.KvKNumber);
    }

    [Fact]
    public async Task UpdateCompanyAsync_MarksAsCurrentlyEnriched_SoAutoEnrichmentDoesNotOverwriteIt()
    {
        _db.Sponsors.Add(MakeCompany("co-1"));
        await _db.SaveChangesAsync();

        await _store.UpdateCompanyAsync("co-1", Edit(summary: "Manual description."));

        var stored = await _db.Sponsors.FindAsync("co-1");
        Assert.Equal(CompanyEnricher.CurrentVersion, stored!.EnrichmentVersion);
        Assert.NotNull(stored.EnrichedAt);
        Assert.True(stored.EnrichedAt > DateTimeOffset.UtcNow.AddMinutes(-1));
    }

    [Fact]
    public async Task UpdateCompanyAsync_UnknownId_ReturnsNull()
    {
        var result = await _store.UpdateCompanyAsync("no-such-id", Edit(summary: "text"));
        Assert.Null(result);
    }

    [Fact]
    public async Task UpdateCompanyAsync_UnknownId_DoesNotCreateARow()
    {
        await _store.UpdateCompanyAsync("no-such-id", Edit(summary: "text"));
        Assert.Equal(0, await _db.Sponsors.CountAsync());
    }

    // ── FindByNameAsync ──────────────────────────────────────────────────────

    [Fact]
    public async Task FindByNameAsync_ExactMatch_ReturnsCompany()
    {
        _db.Sponsors.Add(MakeCompany("co-1"));
        await _db.SaveChangesAsync();

        var result = await _store.FindByNameAsync("Acme B.V.");
        Assert.NotNull(result);
        Assert.Equal("co-1", result!.Id);
    }

    [Fact]
    public async Task FindByNameAsync_IsCaseInsensitive()
    {
        _db.Sponsors.Add(MakeCompany("co-1"));
        await _db.SaveChangesAsync();

        Assert.NotNull(await _store.FindByNameAsync("acme b.v."));
    }

    [Fact]
    public async Task FindByNameAsync_TrimsWhitespace()
    {
        _db.Sponsors.Add(MakeCompany("co-1"));
        await _db.SaveChangesAsync();

        Assert.NotNull(await _store.FindByNameAsync("  Acme B.V.  "));
    }

    [Fact]
    public async Task FindByNameAsync_NoMatch_ReturnsNull()
    {
        _db.Sponsors.Add(MakeCompany("co-1"));
        await _db.SaveChangesAsync();

        Assert.Null(await _store.FindByNameAsync("Totally Different Co"));
    }

    [Fact]
    public async Task FindByNameAsync_IgnoresRemovedSponsors()
    {
        var removed = MakeCompany("co-1");
        removed.RemovedAt = DateTimeOffset.UtcNow;
        _db.Sponsors.Add(removed);
        await _db.SaveChangesAsync();

        Assert.Null(await _store.FindByNameAsync("Acme B.V."));
    }

    [Fact]
    public async Task UpdateCompanyAsync_OnlyUpdatesTargetedCompany()
    {
        _db.Sponsors.AddRange(MakeCompany("co-1"), MakeCompany("co-2"));
        await _db.SaveChangesAsync();

        await _store.UpdateCompanyAsync("co-1", Edit(summary: "Edited."));

        var other = await _db.Sponsors.FindAsync("co-2");
        Assert.Equal("Original LLM-generated summary.", other!.Summary);
    }
}
