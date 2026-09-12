using backend.Data;
using backend.Models;
using backend.Services;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace backend.Tests;

/// <summary>
/// SQLite in-memory, like the other store tests, so the unique index on Email
/// and real query translation are exercised. xUnit builds a new instance per
/// test, so each one starts from an empty Users table.
/// </summary>
public sealed class UserStoreTests : IDisposable
{
    private readonly SqliteConnection _conn;
    private readonly AppDbContext _db;
    private readonly UserStore _store;

    public UserStoreTests()
    {
        _conn = new SqliteConnection("DataSource=:memory:");
        _conn.Open();
        _db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(_conn).Options);
        _db.Database.EnsureCreated();
        _store = new UserStore(_db);
    }

    public void Dispose() { _db.Dispose(); _conn.Dispose(); }

    private static User MakeUser(string email = "someone@example.com", string? id = null) => new()
    {
        UserId       = id ?? Guid.NewGuid().ToString("N"),
        Email        = email,
        FirstName    = "Jan",
        LastName     = "de Vries",
        PasswordHash = PasswordHasher.Hash("correct horse battery staple"),
        GdprConsentAt = "2026-09-12T00:00:00Z",
    };

    // ── lookup by email ──────────────────────────────────────────────────────

    [Fact]
    public async Task GetByEmail_FindsAStoredUser()
    {
        await _store.CreateAsync(MakeUser());
        Assert.NotNull(await _store.GetByEmailAsync("someone@example.com"));
    }

    [Theory]
    [InlineData("SOMEONE@EXAMPLE.COM")]
    [InlineData("Someone@Example.Com")]
    public async Task GetByEmail_LowercasesWhatItIsGiven(string lookup)
    {
        await _store.CreateAsync(MakeUser());
        Assert.NotNull(await _store.GetByEmailAsync(lookup));
    }

    [Fact]
    public async Task GetByEmail_DoesNotLowercaseWhatIsStored()
    {
        // Only the argument is lowercased, so a row written with capitals is
        // unreachable. Registration normalises before saving; anything else
        // that writes a user has to do the same.
        await _store.CreateAsync(MakeUser(email: "Someone@Example.com"));
        Assert.Null(await _store.GetByEmailAsync("someone@example.com"));
    }

    [Fact]
    public async Task GetByEmail_DoesNotTrim()
        => Assert.Null(await _store.GetByEmailAsync("  someone@example.com  "));

    [Theory]
    [InlineData("")]
    [InlineData("nobody@example.com")]
    public async Task GetByEmail_UnknownAddress_ReturnsNull(string email)
    {
        await _store.CreateAsync(MakeUser());
        Assert.Null(await _store.GetByEmailAsync(email));
    }

    // ── lookup by id ─────────────────────────────────────────────────────────

    [Fact]
    public async Task GetByUserId_FindsAStoredUser()
    {
        await _store.CreateAsync(MakeUser(id: "user-1"));
        var found = await _store.GetByUserIdAsync("user-1");
        Assert.Equal("someone@example.com", found?.Email);
    }

    [Theory]
    [InlineData("")]
    [InlineData("USER-1")]
    [InlineData("' OR 1=1 --")]
    public async Task GetByUserId_UnknownId_ReturnsNull(string id)
    {
        await _store.CreateAsync(MakeUser(id: "user-1"));
        Assert.Null(await _store.GetByUserIdAsync(id));
    }

    // ── writes ───────────────────────────────────────────────────────────────

    [Fact]
    public async Task Create_KeepsEveryFieldItWasGiven()
    {
        var user = MakeUser();
        user.TargetRole = "Frontend Engineer";
        user.WorkType   = "hybrid";
        user.Role       = "admin";
        await _store.CreateAsync(user);

        var found = await _store.GetByUserIdAsync(user.UserId);
        Assert.Equal("Frontend Engineer", found!.TargetRole);
        Assert.Equal("hybrid", found.WorkType);
        Assert.Equal("admin", found.Role);
        Assert.False(found.EmailVerified);
    }

    [Fact]
    public async Task Create_SecondUserWithTheSameEmail_IsRejectedByTheIndex()
    {
        await _store.CreateAsync(MakeUser());
        await Assert.ThrowsAnyAsync<DbUpdateException>(() => _store.CreateAsync(MakeUser()));
    }

    [Fact]
    public async Task Create_SameEmailInDifferentCase_IsNotCaughtByTheIndex()
    {
        // The index is case-sensitive, which is why registration lowercases
        // first. Without that step two accounts could share an address.
        await _store.CreateAsync(MakeUser());
        await _store.CreateAsync(MakeUser(email: "SOMEONE@EXAMPLE.COM"));
        Assert.Equal(2, (await _store.GetAllAsync()).Count);
    }

    [Fact]
    public async Task Update_PersistsChanges()
    {
        var user = MakeUser();
        await _store.CreateAsync(user);

        user.EmailVerified = true;
        user.FirstName     = "Janneke";
        await _store.UpdateAsync(user);

        var found = await _store.GetByUserIdAsync(user.UserId);
        Assert.True(found!.EmailVerified);
        Assert.Equal("Janneke", found.FirstName);
    }

    [Fact]
    public async Task Delete_RemovesTheUser()
    {
        var user = MakeUser();
        await _store.CreateAsync(user);
        await _store.DeleteAsync(user);

        Assert.Null(await _store.GetByUserIdAsync(user.UserId));
        Assert.Empty(await _store.GetAllAsync());
    }

    [Fact]
    public async Task Delete_LeavesOtherUsersAlone()
    {
        var keep = MakeUser("keep@example.com");
        var drop = MakeUser("drop@example.com");
        await _store.CreateAsync(keep);
        await _store.CreateAsync(drop);

        await _store.DeleteAsync(drop);

        var all = await _store.GetAllAsync();
        Assert.Single(all);
        Assert.Equal("keep@example.com", all[0].Email);
    }

    // ── listing ──────────────────────────────────────────────────────────────

    [Fact]
    public async Task GetAll_IsOrderedOldestFirst()
    {
        var older = MakeUser("older@example.com");
        older.CreatedAt = new DateTimeOffset(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);
        var newer = MakeUser("newer@example.com");
        newer.CreatedAt = new DateTimeOffset(2026, 6, 1, 0, 0, 0, TimeSpan.Zero);

        await _store.CreateAsync(newer);
        await _store.CreateAsync(older);

        var all = await _store.GetAllAsync();
        Assert.Equal(["older@example.com", "newer@example.com"], all.Select(u => u.Email));
    }

    [Fact]
    public async Task GetAll_EmptyTable_ReturnsEmpty()
        => Assert.Empty(await _store.GetAllAsync());
}
