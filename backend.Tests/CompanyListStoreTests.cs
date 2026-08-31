using backend.Data;
using backend.Services;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace backend.Tests;

// SQLite in-memory so ExecuteDeleteAsync works. Fresh context per test.
public sealed class CompanyListStoreTests : IDisposable
{
    private readonly SqliteConnection _conn;
    private readonly AppDbContext _db;
    private readonly CompanyListStore _store;

    public CompanyListStoreTests()
    {
        _conn = new SqliteConnection("DataSource=:memory:");
        _conn.Open();
        using (var cmd = _conn.CreateCommand())
        {
            cmd.CommandText = "PRAGMA foreign_keys = OFF;";
            cmd.ExecuteNonQuery();
        }
        _db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(_conn).Options);
        _db.Database.EnsureCreated();
        _store = new CompanyListStore(_db);
    }

    public void Dispose() { _db.Dispose(); _conn.Dispose(); }

    [Fact]
    public async Task GetForUser_Empty_ReturnsEmptyLists()
    {
        var (interested, hidden) = await _store.GetForUserAsync("u1");
        Assert.Empty(interested);
        Assert.Empty(hidden);
    }

    [Fact]
    public async Task Set_Interested_ThenGet_ReturnsIt()
    {
        await _store.SetAsync("u1", "c1", CompanyListStore.Interested);
        var (interested, hidden) = await _store.GetForUserAsync("u1");
        Assert.Equal(["c1"], interested);
        Assert.Empty(hidden);
    }

    [Fact]
    public async Task Set_Hidden_ThenInterested_MovesItAcross_NoDuplicateRow()
    {
        await _store.SetAsync("u1", "c1", CompanyListStore.Hidden);
        await _store.SetAsync("u1", "c1", CompanyListStore.Interested);

        var (interested, hidden) = await _store.GetForUserAsync("u1");
        Assert.Equal(["c1"], interested);
        Assert.Empty(hidden);
        Assert.Equal(1, await _db.CompanyLists.CountAsync(x => x.UserId == "u1" && x.SponsorCompanyId == "c1"));
    }

    [Fact]
    public async Task Set_SameKindTwice_IsIdempotent()
    {
        await _store.SetAsync("u1", "c1", CompanyListStore.Interested);
        await _store.SetAsync("u1", "c1", CompanyListStore.Interested);
        Assert.Equal(1, await _db.CompanyLists.CountAsync());
    }

    [Fact]
    public async Task Clear_RemovesTheEntry()
    {
        await _store.SetAsync("u1", "c1", CompanyListStore.Interested);
        await _store.ClearAsync("u1", "c1");
        var (interested, hidden) = await _store.GetForUserAsync("u1");
        Assert.Empty(interested);
        Assert.Empty(hidden);
    }

    [Fact]
    public async Task Clear_NonExistent_DoesNotThrow()
    {
        await _store.ClearAsync("u1", "nope");
    }

    [Fact]
    public async Task Clear_OnlyTouchesTheGivenUserAndCompany()
    {
        await _store.SetAsync("u1", "c1", CompanyListStore.Interested);
        await _store.SetAsync("u1", "c2", CompanyListStore.Hidden);
        await _store.SetAsync("u2", "c1", CompanyListStore.Interested);

        await _store.ClearAsync("u1", "c1");

        var (i1, h1) = await _store.GetForUserAsync("u1");
        Assert.Empty(i1);
        Assert.Equal(["c2"], h1);
        var (i2, _) = await _store.GetForUserAsync("u2");
        Assert.Equal(["c1"], i2);
    }

    [Fact]
    public async Task GetForUser_IsScopedToTheUser()
    {
        await _store.SetAsync("u1", "c1", CompanyListStore.Interested);
        await _store.SetAsync("u2", "c2", CompanyListStore.Interested);

        var (interested, _) = await _store.GetForUserAsync("u1");
        Assert.Equal(["c1"], interested);
    }

    [Fact]
    public async Task GetForUser_SeparatesInterestedFromHidden()
    {
        await _store.SetAsync("u1", "a", CompanyListStore.Interested);
        await _store.SetAsync("u1", "b", CompanyListStore.Interested);
        await _store.SetAsync("u1", "c", CompanyListStore.Hidden);

        var (interested, hidden) = await _store.GetForUserAsync("u1");
        Assert.Equal(["a", "b"], interested.OrderBy(x => x));
        Assert.Equal(["c"], hidden);
    }

    [Fact]
    public async Task Set_TwoDifferentCompanies_BothKept()
    {
        await _store.SetAsync("u1", "c1", CompanyListStore.Interested);
        await _store.SetAsync("u1", "c2", CompanyListStore.Interested);
        var (interested, _) = await _store.GetForUserAsync("u1");
        Assert.Equal(2, interested.Length);
    }
}
