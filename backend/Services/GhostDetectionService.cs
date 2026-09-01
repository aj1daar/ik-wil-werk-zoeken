using backend.Data;
using backend.Models;
using Microsoft.EntityFrameworkCore;

namespace backend.Services;

// An application left in "Applied" for 2 months with no activity (no status
// change, no edit — UpdatedAt never moved) is treated as ghosted by the
// company. Sweeping this into a real, persisted status keeps stats, filters,
// and bulk actions correct everywhere without every read path needing to
// know about staleness.
public sealed class GhostDetectionService
{
    public const string GhostedStatus = "Ghosted";
    private const string AppliedStatus = "Applied";
    public static readonly TimeSpan MinRunInterval = TimeSpan.FromHours(12);

    public async Task<int> SweepAsync(AppDbContext db, DateTimeOffset now, CancellationToken ct = default)
    {
        var cutoff = now.AddMonths(-2);
        // Filter by UpdatedAt in memory: SQLite (used in tests) can't translate
        // ordering comparisons on DateTimeOffset, and the Applied set is small
        // enough that a server-side status filter plus a client-side date check
        // is cheap on Postgres too.
        var stale = (await db.Stages
                .Where(s => s.Status == AppliedStatus)
                .ToListAsync(ct))
            .Where(s => s.UpdatedAt <= cutoff)
            .ToList();

        if (stale.Count == 0) return 0;

        var today = DateOnly.FromDateTime(now.UtcDateTime);
        foreach (var stage in stale)
        {
            stage.Status = GhostedStatus;
            stage.UpdatedAt = now;

            db.StatusHistories.Add(new StatusHistory
            {
                ApplicationId = stage.Id,
                UserId        = stage.UserId,
                Status        = GhostedStatus,
                StatusDate    = today,
            });

            db.ActivityLogs.Add(new ActivityLog
            {
                ApplicationId = stage.Id,
                UserId        = stage.UserId,
                Field         = "Status",
                OldValue      = AppliedStatus,
                NewValue      = GhostedStatus,
                ChangedAt     = now,
            });
        }

        await db.SaveChangesAsync(ct);
        return stale.Count;
    }
}
