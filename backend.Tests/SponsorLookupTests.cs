using backend.Data;
using backend.Models;
using backend.Services;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace backend.Tests;

/// <summary>
/// The register search behind GET /api/dashboard/sponsors/lookup, which the
/// browser extension uses in place of loading the whole table. SQLite in-memory
/// for the same reason as SponsorStoreTests: a real provider, fresh per test.
/// </summary>
public sealed class SponsorLookupTests : IDisposable
{
    private readonly SqliteConnection _conn;
    private readonly AppDbContext _db;
    private readonly SponsorStore _store;

    public SponsorLookupTests()
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

    private async Task<SponsorCompany> AddAsync(
        string name,
        string? city = null,
        string? industry = null,
        bool removed = false,
        string? mergedInto = null,
        string[]? aliases = null,
        string[]? tags = null)
    {
        var company = new SponsorCompany
        {
            Id                     = Guid.NewGuid().ToString("N"),
            Name                   = name,
            KvKNumber              = "12345678",
            IsIndRecognizedSponsor = true,
            City                   = city,
            CoreIndustry           = industry,
            AliasNames             = aliases,
            TechStackTags          = tags,
            RemovedAt              = removed ? DateTimeOffset.UtcNow : null,
            MergedIntoId           = mergedInto,
        };
        _db.Sponsors.Add(company);
        await _db.SaveChangesAsync();
        return company;
    }

    // ── what counts as a match ───────────────────────────────────────────────

    [Fact]
    public async Task Search_MatchesNameCaseInsensitively()
    {
        await AddAsync("Acme B.V.");
        var found = await _store.SearchAsync("ACME", 10);
        Assert.Single(found);
        Assert.Equal("Acme B.V.", found[0].Name);
    }

    [Fact]
    public async Task Search_MatchesInsideTheName()
    {
        await AddAsync("Royal Dutch Shell");
        Assert.Single(await _store.SearchAsync("dutch", 10));
    }

    [Fact]
    public async Task Search_MatchesCity()
    {
        await AddAsync("Acme B.V.", city: "Utrecht");
        Assert.Single(await _store.SearchAsync("utrecht", 10));
    }

    [Fact]
    public async Task Search_MatchesIndustry()
    {
        await AddAsync("Acme B.V.", industry: "Fintech");
        Assert.Single(await _store.SearchAsync("fintech", 10));
    }

    // Documented limit, not an oversight: the tag columns are text[] on Postgres
    // and a JSON column on SQLite, so no single query searches them on both.
    [Fact]
    public async Task Search_DoesNotMatchTags()
    {
        await AddAsync("Acme B.V.", tags: ["Kubernetes"]);
        Assert.Empty(await _store.SearchAsync("kubernetes", 10));
    }

    [Fact]
    public async Task Search_UnrelatedQueryFindsNothing()
    {
        await AddAsync("Acme B.V.", city: "Amsterdam", industry: "Fintech");
        Assert.Empty(await _store.SearchAsync("zzzzz", 10));
    }

    // ── what is hidden ───────────────────────────────────────────────────────

    [Fact]
    public async Task Search_SkipsCompaniesGoneFromTheRegister()
    {
        await AddAsync("Acme B.V.", removed: true);
        Assert.Empty(await _store.SearchAsync("acme", 10));
    }

    [Fact]
    public async Task Search_SkipsCompaniesMergedAway()
    {
        var target = await AddAsync("Acme Holding");
        await AddAsync("Acme B.V.", mergedInto: target.Id);

        var found = await _store.SearchAsync("acme", 10);
        Assert.Single(found);
        Assert.Equal("Acme Holding", found[0].Name);
    }

    // ── order and size ───────────────────────────────────────────────────────

    [Fact]
    public async Task Search_RanksStartsWithAboveContains()
    {
        await AddAsync("Studio Acme");
        await AddAsync("Acme B.V.");

        var found = await _store.SearchAsync("acme", 10);
        Assert.Equal("Acme B.V.", found[0].Name);
        Assert.Equal("Studio Acme", found[1].Name);
    }

    [Fact]
    public async Task Search_SortsAlphabeticallyWithinTheSameRank()
    {
        await AddAsync("Acme Zebra");
        await AddAsync("Acme Alpha");

        var found = await _store.SearchAsync("acme", 10);
        Assert.Equal(["Acme Alpha", "Acme Zebra"], found.Select(c => c.Name));
    }

    [Fact]
    public async Task Search_NeverReturnsMoreThanTheLimit()
    {
        for (var i = 0; i < 12; i++) await AddAsync($"Acme {i:00}");
        Assert.Equal(5, (await _store.SearchAsync("acme", 5)).Count);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public async Task Search_NonPositiveLimitReturnsNothing(int limit)
    {
        await AddAsync("Acme B.V.");
        Assert.Empty(await _store.SearchAsync("acme", limit));
    }

    // ── input the user can type ──────────────────────────────────────────────

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("\t")]
    public async Task Search_BlankQueryReturnsNothing(string query)
    {
        await AddAsync("Acme B.V.");
        Assert.Empty(await _store.SearchAsync(query, 10));
    }

    [Fact]
    public async Task Search_TrimsTheQuery()
    {
        await AddAsync("Acme B.V.");
        Assert.Single(await _store.SearchAsync("  acme  ", 10));
    }

    // A LIKE wildcard is a literal character here, or one keystroke would return
    // the whole register.
    [Theory]
    [InlineData("%")]
    [InlineData("_")]
    [InlineData("%%")]
    public async Task Search_TreatsLikeWildcardsAsText(string query)
    {
        await AddAsync("Acme B.V.");
        Assert.Empty(await _store.SearchAsync(query, 10));
    }

    [Fact]
    public async Task Search_FindsAWildcardThatIsReallyInTheName()
    {
        await AddAsync("100% Design B.V.");
        Assert.Single(await _store.SearchAsync("100%", 10));
    }

    [Fact]
    public async Task Search_HandlesQuotesWithoutBreakingTheQuery()
    {
        await AddAsync("O'Neill Sports");
        Assert.Single(await _store.SearchAsync("o'neill", 10));
    }

    [Fact]
    public async Task Search_HandlesAQueryThatLooksLikeAnInjection()
    {
        await AddAsync("Acme B.V.");
        Assert.Empty(await _store.SearchAsync("'; DROP TABLE Sponsors; --", 10));
        Assert.Single(await _store.SearchAsync("acme", 10));
    }

    // ── the sponsor verdict ──────────────────────────────────────────────────

    [Fact]
    public async Task Exact_ResolvesAFormerName()
    {
        await AddAsync("Acme Holding", aliases: ["Acme B.V."]);
        var found = await _store.FindByNameAsync("acme b.v.");
        Assert.NotNull(found);
        Assert.Equal("Acme Holding", found!.Name);
    }

    [Fact]
    public async Task Exact_IsNullForACompanyNotInTheRegister()
    {
        await AddAsync("Acme B.V.");
        Assert.Null(await _store.FindByNameAsync("Some Startup"));
    }

    [Fact]
    public async Task Exact_IsNullForAPartialName()
    {
        await AddAsync("Acme B.V.");
        Assert.Null(await _store.FindByNameAsync("Acme"));
    }

    // ── the shape that goes over the wire ────────────────────────────────────

    [Fact]
    public void Match_CarriesOnlyWhatThePanelNeeds()
    {
        var company = new SponsorCompany
        {
            Id           = "c1",
            Name         = "Acme B.V.",
            City         = "Amsterdam",
            CoreIndustry = "Fintech",
            Summary      = "A long enrichment summary nobody needs in a dropdown.",
        };

        var match = SponsorLookupMatch.From(company);
        Assert.Equal("c1", match.Id);
        Assert.Equal("Acme B.V.", match.Name);
        Assert.Equal("Amsterdam", match.City);
        Assert.Equal("Fintech", match.CoreIndustry);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Match_BlankCityBecomesNull(string? city)
    {
        var match = SponsorLookupMatch.From(new SponsorCompany { Name = "Acme", City = city });
        Assert.Null(match.City);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Match_BlankIndustryBecomesNull(string? industry)
    {
        var match = SponsorLookupMatch.From(new SponsorCompany { Name = "Acme", CoreIndustry = industry });
        Assert.Null(match.CoreIndustry);
    }
}
