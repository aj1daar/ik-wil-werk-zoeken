using backend.Data;
using backend.Models;
using Microsoft.EntityFrameworkCore;

namespace backend.Services;

/// <summary>
/// Collects everything held about one account, for the person it belongs to.
///
/// Scoped to the user id throughout: every query filters on it, and the company
/// list names are the only thing read from a shared table, because a list of
/// company ids is not an answer anyone can use.
/// </summary>
public sealed class MyDataExporter(AppDbContext db)
{
    public async Task<MyDataResponse?> ExportAsync(string userId)
    {
        var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.UserId == userId);
        if (user is null) return null;

        var applications = await db.Stages.AsNoTracking()
            .Where(s => s.UserId == userId)
            .ToListAsync();

        var history = await db.StatusHistories.AsNoTracking()
            .Where(h => h.UserId == userId)
            .ToListAsync();

        var activity = await db.ActivityLogs.AsNoTracking()
            .Where(a => a.UserId == userId)
            .ToListAsync();

        var lists = await db.CompanyLists.AsNoTracking()
            .Where(l => l.UserId == userId)
            .ToListAsync();

        var listedIds = lists.Select(l => l.SponsorCompanyId).ToList();
        var names = await db.Sponsors.AsNoTracking()
            .Where(c => listedIds.Contains(c.Id))
            .Select(c => new { c.Id, c.Name })
            .ToListAsync();
        var nameById = names.ToDictionary(n => n.Id, n => n.Name);

        return new MyDataResponse
        {
            ExportedAt = DateTimeOffset.UtcNow.ToString("o"),
            Account = new MyDataAccount
            {
                UserId         = user.UserId,
                Email          = user.Email,
                FirstName      = user.FirstName,
                LastName       = user.LastName,
                TargetRole     = user.TargetRole,
                Location       = user.PreferredLocation,
                WorkType       = user.WorkType,
                Role           = user.Role,
                EmailVerified  = user.EmailVerified,
                CreatedAt      = user.CreatedAt.ToString("o"),
                GdprConsentAt  = user.GdprConsentAt,
                PrivacyVersion = user.PrivacyVersion,
                GoogleLinked   = user.GoogleSubject is not null,
                // Whether one exists, never the hash itself.
                HasPassword    = user.PasswordHash.Length > 0,
            },
            Applications  = [.. applications.OrderBy(a => a.AppliedAt)],
            StatusHistory = [.. history.OrderBy(h => h.CreatedAt)],
            Activity      = [.. activity.OrderBy(a => a.ChangedAt)],
            CompanyLists  = [.. lists
                .OrderBy(l => l.CreatedAt)
                .Select(l => new MyDataListEntry
                {
                    SponsorCompanyId = l.SponsorCompanyId,
                    CompanyName      = nameById.TryGetValue(l.SponsorCompanyId, out var name) ? name : string.Empty,
                    List             = l.Kind,
                    AddedAt          = l.CreatedAt.ToString("o"),
                })],
        };
    }
}
