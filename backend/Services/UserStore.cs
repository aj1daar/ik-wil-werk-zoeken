using backend.Data;
using backend.Models;
using Microsoft.EntityFrameworkCore;

namespace backend.Services;

public sealed class UserStore(AppDbContext db)
{
    public async Task<User?> GetByEmailAsync(string email) =>
        await db.Users.FirstOrDefaultAsync(u => u.Email == email.ToLowerInvariant());

    public async Task<User?> GetByUserIdAsync(string userId) =>
        await db.Users.FirstOrDefaultAsync(u => u.UserId == userId);

    public async Task CreateAsync(User user)
    {
        db.Users.Add(user);
        await db.SaveChangesAsync();
    }

    public async Task UpdateAsync(User user)
    {
        db.Users.Update(user);
        await db.SaveChangesAsync();
    }

    public async Task DeleteAsync(User user)
    {
        db.Users.Remove(user);
        await db.SaveChangesAsync();
    }

    // Ordered in memory on purpose: SQLite can't ORDER BY a DateTimeOffset,
    // which the tests run on, and this table holds a handful of accounts.
    public async Task<IReadOnlyList<User>> GetAllAsync() =>
        (await db.Users.ToListAsync()).OrderBy(u => u.CreatedAt).ToList();
}
