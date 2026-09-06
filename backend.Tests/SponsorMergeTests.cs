using backend.Data;
using backend.Models;
using backend.Services;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace backend.Tests;

/// <summary>
/// Admin rename + merge behaviour of <see cref="SponsorStore"/>. SQLite in-memory
/// is used because ExecuteUpdateAsync and transactions are unsupported by the EF
/// InMemory provider. xUnit builds a fresh instance per test, so no shared state.
/// </summary>
public sealed class SponsorMergeTests : IDisposable
{
    private readonly SqliteConnection _conn;
    private readonly AppDbContext _db;
    private readonly SponsorStore _store;

    public SponsorMergeTests()
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

    private async Task<SponsorCompany> AddCompany(
        string id, string name, string[]? aliases = null,
        DateTimeOffset? removedAt = null, string? mergedIntoId = null)
    {
        var company = new SponsorCompany
        {
            Id           = id,
            Name         = name,
            KvKNumber    = id.PadLeft(8, '0')[..8],
            City         = "Amsterdam",
            AliasNames   = aliases,
            RemovedAt    = removedAt,
            MergedIntoId = mergedIntoId,
        };
        _db.Sponsors.Add(company);
        await _db.SaveChangesAsync();
        return company;
    }

    private async Task AddStage(string id, string userId, string companyName, string? sponsorId)
    {
        _db.Users.Add(new User { UserId = userId, Email = $"{userId}@example.com", PasswordHash = "x" });
        _db.Stages.Add(new ApplicationStage
        {
            Id               = id,
            UserId           = userId,
            CompanyName      = companyName,
            Position         = "Engineer",
            AppliedAt        = DateTimeOffset.UtcNow,
            Status           = "Applied",
            SponsorCompanyId = sponsorId,
        });
        await _db.SaveChangesAsync();
    }

    private async Task AddListEntry(string userId, string companyId, string kind)
    {
        if (!await _db.Users.AnyAsync(u => u.UserId == userId))
            _db.Users.Add(new User { UserId = userId, Email = $"{userId}@example.com", PasswordHash = "x" });
        _db.CompanyLists.Add(new CompanyListEntry
        {
            UserId = userId, SponsorCompanyId = companyId, Kind = kind,
        });
        await _db.SaveChangesAsync();
    }

    private static CompanyEdit Rename(string? name) =>
        new(null, null, null, null, null, null, null, null, null, null, null, null, Name: name);

    // ── rename ───────────────────────────────────────────────────────────────

    [Fact]
    public async Task Rename_SetsNewNameAndKeepsOldNameAsAlias()
    {
        await AddCompany("c1", "Old Name");

        var updated = await _store.UpdateCompanyAsync("c1", Rename("New Name"));

        Assert.Equal("New Name", updated!.Name);
        Assert.Equal(["Old Name"], updated.AliasNames!);
    }

    [Fact]
    public async Task Rename_SameNameAddsNoAlias()
    {
        await AddCompany("c1", "Acme");

        var updated = await _store.UpdateCompanyAsync("c1", Rename("Acme"));

        Assert.Equal("Acme", updated!.Name);
        Assert.Null(updated.AliasNames);
    }

    [Fact]
    public async Task Rename_NullNameKeepsCurrentName()
    {
        await AddCompany("c1", "Acme");

        var updated = await _store.UpdateCompanyAsync("c1", Rename(null));

        Assert.Equal("Acme", updated!.Name);
        Assert.Null(updated.AliasNames);
    }

    [Fact]
    public async Task Rename_TwiceKeepsBothPreviousNames()
    {
        await AddCompany("c1", "First");

        await _store.UpdateCompanyAsync("c1", Rename("Second"));
        var updated = await _store.UpdateCompanyAsync("c1", Rename("Third"));

        Assert.Equal("Third", updated!.Name);
        Assert.Equal(["First", "Second"], updated.AliasNames!);
    }

    [Fact]
    public async Task Rename_BackToOriginalDropsItFromAliases()
    {
        await AddCompany("c1", "First");

        await _store.UpdateCompanyAsync("c1", Rename("Second"));
        var updated = await _store.UpdateCompanyAsync("c1", Rename("First"));

        Assert.Equal("First", updated!.Name);
        Assert.Equal(["Second"], updated.AliasNames!);
    }

    [Fact]
    public async Task Rename_CaseOnlyChangeStillRecordsOldSpelling()
    {
        await AddCompany("c1", "acme");

        var updated = await _store.UpdateCompanyAsync("c1", Rename("ACME"));

        Assert.Equal("ACME", updated!.Name);
        // "acme" differs only by case from the new name, so it is not kept as an alias.
        Assert.Null(updated.AliasNames);
    }

    [Fact]
    public async Task Rename_KeepsApplicationsResolvableUnderOldName()
    {
        await AddCompany("c1", "Old Name");
        await _store.UpdateCompanyAsync("c1", Rename("New Name"));

        var byOld = await _store.FindByNameAsync("Old Name");
        var byNew = await _store.FindByNameAsync("New Name");

        Assert.Equal("c1", byOld!.Id);
        Assert.Equal("c1", byNew!.Id);
    }

    // ── name lookup ──────────────────────────────────────────────────────────

    [Fact]
    public async Task FindByName_MatchesAliasCaseInsensitivelyAndTrimmed()
    {
        await AddCompany("c1", "New Name", aliases: ["Old Name"]);

        Assert.Equal("c1", (await _store.FindByNameAsync("  oLd nAmE  "))!.Id);
    }

    [Fact]
    public async Task FindByName_PrefersExactNameOverSomeoneElsesAlias()
    {
        await AddCompany("c1", "Shared", aliases: ["Other"]);
        await AddCompany("c2", "Other");

        Assert.Equal("c2", (await _store.FindByNameAsync("Other"))!.Id);
    }

    [Fact]
    public async Task FindByName_IgnoresMergedAndRemovedCompanies()
    {
        await AddCompany("c1", "Ghost", removedAt: DateTimeOffset.UtcNow);
        await AddCompany("c2", "Target");
        await AddCompany("c3", "Dupe", mergedIntoId: "c2");

        Assert.Null(await _store.FindByNameAsync("Ghost"));
        Assert.Null(await _store.FindByNameAsync("Dupe"));
    }

    [Fact]
    public async Task FindByName_BlankReturnsNull()
    {
        await AddCompany("c1", "Acme");

        Assert.Null(await _store.FindByNameAsync("   "));
        Assert.Null(await _store.FindByNameAsync(""));
    }

    [Fact]
    public async Task FindByName_SeesARenameThatHappenedAfterAnEarlierLookup()
    {
        await AddCompany("c1", "First");
        await AddCompany("c2", "Other", aliases: ["Something"]);
        Assert.Null(await _store.FindByNameAsync("Second"));   // primes the alias cache

        await _store.UpdateCompanyAsync("c1", Rename("Second"));

        Assert.Equal("c1", (await _store.FindByNameAsync("First"))!.Id);
    }

    [Fact]
    public async Task FindByName_SeesAMergeThatHappenedAfterAnEarlierLookup()
    {
        await AddCompany("keep", "Acme");
        await AddCompany("dupe", "Acme BV");
        Assert.Null(await _store.FindByNameAsync("Nothing"));  // primes the alias cache

        await _store.MergeCompaniesAsync("keep", ["dupe"]);

        Assert.Equal("keep", (await _store.FindByNameAsync("Acme BV"))!.Id);
    }

    [Fact]
    public async Task FindByName_SeesAnUnmergeThatHappenedAfterAnEarlierLookup()
    {
        await AddCompany("keep", "Acme");
        await AddCompany("dupe", "Acme BV");
        await _store.MergeCompaniesAsync("keep", ["dupe"]);
        Assert.Equal("keep", (await _store.FindByNameAsync("Acme BV"))!.Id);  // primes the alias cache

        await _store.UnmergeCompanyAsync("dupe");

        Assert.Equal("dupe", (await _store.FindByNameAsync("Acme BV"))!.Id);
    }

    // ── merge ────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Merge_HidesSourceAndAbsorbsItsNameAsAlias()
    {
        await AddCompany("keep", "Acme");
        await AddCompany("dupe", "Acme Netherlands");

        var (result, error) = await _store.MergeCompaniesAsync("keep", ["dupe"]);

        Assert.Null(error);
        Assert.Equal(["dupe"], result!.MergedIds);
        Assert.Equal(["Acme Netherlands"], result.Target.AliasNames!);

        var source = await _db.Sponsors.FindAsync("dupe");
        Assert.Equal("keep", source!.MergedIntoId);

        var active = await _store.GetActiveAsync();
        Assert.Equal(["Acme"], active.Select(c => c.Name));
    }

    [Fact]
    public async Task Merge_ResolvesTheMergedNameToTheSurvivingCompany()
    {
        await AddCompany("keep", "Acme");
        await AddCompany("dupe", "Acme Netherlands");

        await _store.MergeCompaniesAsync("keep", ["dupe"]);

        Assert.Equal("keep", (await _store.FindByNameAsync("Acme Netherlands"))!.Id);
    }

    [Fact]
    public async Task Merge_AbsorbsSourceAliasesToo()
    {
        await AddCompany("keep", "Acme");
        await AddCompany("dupe", "Acme NL", aliases: ["Acme Holland"]);

        var (result, _) = await _store.MergeCompaniesAsync("keep", ["dupe"]);

        Assert.Equal(["Acme NL", "Acme Holland"], result!.Target.AliasNames!);
    }

    [Fact]
    public async Task Merge_DoesNotAddTheTargetsOwnNameAsAlias()
    {
        await AddCompany("keep", "Acme");
        await AddCompany("dupe", "acme");

        var (result, _) = await _store.MergeCompaniesAsync("keep", ["dupe"]);

        Assert.Null(result!.Target.AliasNames);
    }

    [Fact]
    public async Task Merge_DeduplicatesAliasesCaseInsensitively()
    {
        await AddCompany("keep", "Acme", aliases: ["Acme NL"]);
        await AddCompany("d1", "acme nl");
        await AddCompany("d2", "ACME NL");

        var (result, _) = await _store.MergeCompaniesAsync("keep", ["d1", "d2"]);

        Assert.Equal(["Acme NL"], result!.Target.AliasNames!);
    }

    [Fact]
    public async Task Merge_MultipleSourcesAtOnce()
    {
        await AddCompany("keep", "Acme");
        await AddCompany("d1", "Acme BV");
        await AddCompany("d2", "Acme Group");

        var (result, error) = await _store.MergeCompaniesAsync("keep", ["d1", "d2"]);

        Assert.Null(error);
        Assert.Equal(2, result!.MergedIds.Length);
        Assert.Equal(["Acme BV", "Acme Group"], result.Target.AliasNames!);
        Assert.Single(await _store.GetActiveAsync());
    }

    [Fact]
    public async Task Merge_RepointsApplicationLinks()
    {
        await AddCompany("keep", "Acme");
        await AddCompany("dupe", "Acme BV");
        await AddStage("s1", "u1", "Acme BV", "dupe");

        var (result, _) = await _store.MergeCompaniesAsync("keep", ["dupe"]);

        Assert.Equal(1, result!.MovedApplications);
        // ExecuteUpdateAsync writes straight to the database, so read the row back
        // untracked rather than trusting the copy this context already loaded.
        var stage = await _db.Stages.AsNoTracking().SingleAsync(s => s.Id == "s1");
        Assert.Equal("keep", stage.SponsorCompanyId);
    }

    [Fact]
    public async Task Merge_MovesUserListEntries()
    {
        await AddCompany("keep", "Acme");
        await AddCompany("dupe", "Acme BV");
        await AddListEntry("u1", "dupe", "interested");

        var (result, _) = await _store.MergeCompaniesAsync("keep", ["dupe"]);

        Assert.Equal(1, result!.MovedListEntries);
        Assert.Equal(0, result.DroppedListEntries);
        var entry = await _db.CompanyLists.SingleAsync();
        Assert.Equal("keep", entry.SponsorCompanyId);
        Assert.Equal("interested", entry.Kind);
    }

    [Fact]
    public async Task Merge_DropsListEntryWhenUserAlreadyHasTheTarget()
    {
        await AddCompany("keep", "Acme");
        await AddCompany("dupe", "Acme BV");
        await AddListEntry("u1", "keep", "interested");
        await AddListEntry("u1", "dupe", "hidden");

        var (result, error) = await _store.MergeCompaniesAsync("keep", ["dupe"]);

        Assert.Null(error);
        Assert.Equal(0, result!.MovedListEntries);
        Assert.Equal(1, result.DroppedListEntries);
        var entry = await _db.CompanyLists.SingleAsync();
        Assert.Equal("keep", entry.SponsorCompanyId);
        Assert.Equal("interested", entry.Kind);
    }

    [Fact]
    public async Task Merge_KeepsOnlyOneEntryWhenUserHasTwoOfTheSources()
    {
        await AddCompany("keep", "Acme");
        await AddCompany("d1", "Acme BV");
        await AddCompany("d2", "Acme Group");
        await AddListEntry("u1", "d1", "interested");
        await AddListEntry("u1", "d2", "hidden");

        var (result, error) = await _store.MergeCompaniesAsync("keep", ["d1", "d2"]);

        Assert.Null(error);
        Assert.Equal(1, result!.MovedListEntries);
        Assert.Equal(1, result.DroppedListEntries);
        Assert.Equal("keep", (await _db.CompanyLists.SingleAsync()).SponsorCompanyId);
    }

    [Fact]
    public async Task Merge_LeavesOtherUsersEntriesAlone()
    {
        await AddCompany("keep", "Acme");
        await AddCompany("dupe", "Acme BV");
        await AddCompany("other", "Unrelated");
        await AddListEntry("u1", "dupe", "interested");
        await AddListEntry("u2", "other", "hidden");

        await _store.MergeCompaniesAsync("keep", ["dupe"]);

        var untouched = await _db.CompanyLists.SingleAsync(x => x.UserId == "u2");
        Assert.Equal("other", untouched.SponsorCompanyId);
    }

    [Fact]
    public async Task Merge_PullsAlreadyMergedCompaniesOfTheSourceAcross()
    {
        await AddCompany("a", "A");
        await AddCompany("b", "B");
        await AddCompany("c", "C");

        await _store.MergeCompaniesAsync("b", ["c"]);        // C into B
        var (result, error) = await _store.MergeCompaniesAsync("a", ["b"]); // then B into A

        Assert.Null(error);
        // No MergedIntoId chain is left behind — C points straight at A.
        Assert.Equal("a", (await _db.Sponsors.FindAsync("c"))!.MergedIntoId);
        Assert.Equal("a", (await _db.Sponsors.FindAsync("b"))!.MergedIntoId);
        Assert.Equal(["B", "C"], result!.Target.AliasNames!);
        Assert.Equal("a", (await _store.FindByNameAsync("C"))!.Id);
    }

    [Fact]
    public async Task Merge_RepeatOfTheSameMergeIsHarmless()
    {
        await AddCompany("keep", "Acme");
        await AddCompany("dupe", "Acme BV");

        await _store.MergeCompaniesAsync("keep", ["dupe"]);
        var (result, error) = await _store.MergeCompaniesAsync("keep", ["dupe"]);

        Assert.Null(error);
        Assert.Equal(["Acme BV"], result!.Target.AliasNames!);
        Assert.Equal("keep", (await _db.Sponsors.FindAsync("dupe"))!.MergedIntoId);
    }

    [Fact]
    public async Task Merge_UnknownTargetIsRejected()
    {
        await AddCompany("dupe", "Acme BV");

        var (result, error) = await _store.MergeCompaniesAsync("nope", ["dupe"]);

        Assert.Null(result);
        Assert.Equal("Target company not found", error);
        Assert.Null((await _db.Sponsors.FindAsync("dupe"))!.MergedIntoId);
    }

    [Fact]
    public async Task Merge_UnknownSourceIsRejectedAndNothingChanges()
    {
        await AddCompany("keep", "Acme");
        await AddCompany("dupe", "Acme BV");

        var (result, error) = await _store.MergeCompaniesAsync("keep", ["dupe", "nope"]);

        Assert.Null(result);
        Assert.Contains("not found", error);
        Assert.Null((await _db.Sponsors.FindAsync("dupe"))!.MergedIntoId);
        Assert.Null((await _db.Sponsors.FindAsync("keep"))!.AliasNames);
    }

    [Fact]
    public async Task Merge_TargetThatIsItselfMergedIsRejected()
    {
        await AddCompany("keep", "Acme");
        await AddCompany("mid", "Acme BV", mergedIntoId: "keep");
        await AddCompany("dupe", "Acme Group");

        var (result, error) = await _store.MergeCompaniesAsync("mid", ["dupe"]);

        Assert.Null(result);
        Assert.Contains("unmerge", error);
    }

    [Fact]
    public async Task Merge_RemovedTargetIsRejected()
    {
        await AddCompany("keep", "Acme", removedAt: DateTimeOffset.UtcNow);
        await AddCompany("dupe", "Acme BV");

        var (result, error) = await _store.MergeCompaniesAsync("keep", ["dupe"]);

        Assert.Null(result);
        Assert.Contains("no longer in the IND register", error);
    }

    [Fact]
    public async Task Merge_SourceAlreadyMergedElsewhereIsRejected()
    {
        await AddCompany("keep", "Acme");
        await AddCompany("other", "Other");
        await AddCompany("dupe", "Acme BV", mergedIntoId: "other");

        var (result, error) = await _store.MergeCompaniesAsync("keep", ["dupe"]);

        Assert.Null(result);
        Assert.Contains("already merged", error);
    }

    [Fact]
    public async Task Merge_RemovedSourceIsAllowed()
    {
        await AddCompany("keep", "Acme");
        await AddCompany("dupe", "Acme BV", removedAt: DateTimeOffset.UtcNow);

        var (result, error) = await _store.MergeCompaniesAsync("keep", ["dupe"]);

        Assert.Null(error);
        Assert.Equal(["Acme BV"], result!.Target.AliasNames!);
    }

    [Fact]
    public async Task Merge_MergedCompanyIsSkippedByEnrichmentSweeps()
    {
        await AddCompany("keep", "Acme");
        await AddCompany("dupe", "Acme BV");

        await _store.MergeCompaniesAsync("keep", ["dupe"]);

        var unenriched = await _store.GetUnEnrichedAsync(10, 1);
        Assert.Equal(["keep"], unenriched.Select(c => c.Id));
        Assert.Equal(1, await _store.CountUnEnrichedAsync(1));
    }

    [Fact]
    public async Task GetMergedInto_ListsOnlyTheCompaniesFoldedIntoTheTarget()
    {
        await AddCompany("keep", "Acme");
        await AddCompany("d1", "Acme BV");
        await AddCompany("d2", "Acme Group");
        await AddCompany("other", "Unrelated");

        await _store.MergeCompaniesAsync("keep", ["d1", "d2"]);

        var merged = await _store.GetMergedIntoAsync("keep");
        Assert.Equal(["d1", "d2"], merged.Select(c => c.Id).OrderBy(x => x));
        Assert.Empty(await _store.GetMergedIntoAsync("other"));
    }

    // ── unmerge ──────────────────────────────────────────────────────────────

    [Fact]
    public async Task Unmerge_RestoresCompanyAndDropsItsAlias()
    {
        await AddCompany("keep", "Acme");
        await AddCompany("dupe", "Acme BV");
        await _store.MergeCompaniesAsync("keep", ["dupe"]);

        var (restored, error) = await _store.UnmergeCompanyAsync("dupe");

        Assert.Null(error);
        Assert.Null(restored!.MergedIntoId);
        Assert.Null((await _db.Sponsors.FindAsync("keep"))!.AliasNames);
        Assert.Equal(2, (await _store.GetActiveAsync()).Count);
        Assert.Equal("dupe", (await _store.FindByNameAsync("Acme BV"))!.Id);
    }

    [Fact]
    public async Task Unmerge_KeepsAliasesStillContributedByAnotherMergedCompany()
    {
        await AddCompany("keep", "Acme");
        await AddCompany("d1", "Acme BV");
        await AddCompany("d2", "acme bv");
        await _store.MergeCompaniesAsync("keep", ["d1", "d2"]);

        await _store.UnmergeCompanyAsync("d1");

        // d2 still carries that name, so the alias has to survive.
        Assert.Equal(["Acme BV"], (await _db.Sponsors.FindAsync("keep"))!.AliasNames!);
    }

    [Fact]
    public async Task Unmerge_KeepsTheTargetsOwnRenameHistory()
    {
        await AddCompany("keep", "Old Name");
        await _store.UpdateCompanyAsync("keep", Rename("New Name"));
        await AddCompany("dupe", "Acme BV");
        await _store.MergeCompaniesAsync("keep", ["dupe"]);

        await _store.UnmergeCompanyAsync("dupe");

        Assert.Equal(["Old Name"], (await _db.Sponsors.FindAsync("keep"))!.AliasNames!);
    }

    [Fact]
    public async Task Unmerge_LeavesApplicationsAndListsWithTheTarget()
    {
        await AddCompany("keep", "Acme");
        await AddCompany("dupe", "Acme BV");
        await AddStage("s1", "u1", "Acme BV", "dupe");
        await AddListEntry("u2", "dupe", "interested");
        await _store.MergeCompaniesAsync("keep", ["dupe"]);

        await _store.UnmergeCompanyAsync("dupe");

        Assert.Equal("keep", (await _db.Stages.AsNoTracking().SingleAsync(s => s.Id == "s1")).SponsorCompanyId);
        Assert.Equal("keep", (await _db.CompanyLists.SingleAsync()).SponsorCompanyId);
    }

    [Fact]
    public async Task Unmerge_UnknownCompanyIsRejected()
    {
        var (restored, error) = await _store.UnmergeCompanyAsync("nope");

        Assert.Null(restored);
        Assert.Equal("Company not found", error);
    }

    [Fact]
    public async Task Unmerge_CompanyThatWasNeverMergedIsRejected()
    {
        await AddCompany("c1", "Acme");

        var (restored, error) = await _store.UnmergeCompanyAsync("c1");

        Assert.Null(restored);
        Assert.Equal("Company is not merged into anything", error);
    }

    // ── MergeAliases helper ──────────────────────────────────────────────────

    [Fact]
    public void MergeAliases_TrimsBlankFiltersAndDeduplicates()
    {
        var result = SponsorStore.MergeAliases(["  Alpha "], ["", "   ", "alpha", "Beta", "beta"], "Acme");

        Assert.Equal(["Alpha", "Beta"], result!);
    }

    [Fact]
    public void MergeAliases_NeverIncludesTheCompanysOwnName()
    {
        Assert.Null(SponsorStore.MergeAliases(null, ["  acme  "], "Acme"));
    }

    [Fact]
    public void MergeAliases_EmptyResultIsNullNotEmptyArray()
    {
        Assert.Null(SponsorStore.MergeAliases(null, [], "Acme"));
        Assert.Null(SponsorStore.MergeAliases([], ["  "], "Acme"));
    }
}
