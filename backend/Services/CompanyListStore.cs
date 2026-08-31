using backend.Data;
using backend.Models;
using Microsoft.EntityFrameworkCore;

namespace backend.Services;

// The user's per-company shortlist ("interested") and dismissed list ("hidden").
// One row per (user, company); setting one kind replaces the other.
public sealed class CompanyListStore(AppDbContext db)
{
    public const string Interested = "interested";
    public const string Hidden     = "hidden";

    public async Task<(string[] Interested, string[] Hidden)> GetForUserAsync(string userId)
    {
        var rows = await db.CompanyLists
            .Where(x => x.UserId == userId)
            .Select(x => new { x.SponsorCompanyId, x.Kind })
            .ToListAsync();

        return (
            rows.Where(x => x.Kind == Interested).Select(x => x.SponsorCompanyId).ToArray(),
            rows.Where(x => x.Kind == Hidden).Select(x => x.SponsorCompanyId).ToArray()
        );
    }

    public async Task SetAsync(string userId, string companyId, string kind)
    {
        var existing = await db.CompanyLists
            .FirstOrDefaultAsync(x => x.UserId == userId && x.SponsorCompanyId == companyId);

        if (existing is null)
        {
            db.CompanyLists.Add(new CompanyListEntry
            {
                UserId           = userId,
                SponsorCompanyId = companyId,
                Kind             = kind,
            });
        }
        else if (existing.Kind != kind)
        {
            existing.Kind      = kind;
            existing.CreatedAt = DateTimeOffset.UtcNow;
        }

        await db.SaveChangesAsync();
    }

    public async Task ClearAsync(string userId, string companyId) =>
        await db.CompanyLists
            .Where(x => x.UserId == userId && x.SponsorCompanyId == companyId)
            .ExecuteDeleteAsync();
}
