using backend.Data;
using backend.Models;
using Microsoft.EntityFrameworkCore;

namespace backend.Services;

public sealed class StageStore(AppDbContext db)
{
    public async Task<IReadOnlyList<ApplicationStage>> GetByUserIdAsync(string userId) =>
        await db.Stages.Where(s => s.UserId == userId).ToListAsync();

    public async Task<ApplicationStage?> GetAsync(string userId, string id) =>
        await db.Stages.FirstOrDefaultAsync(s => s.UserId == userId && s.Id == id);

    public async Task UpsertAsync(ApplicationStage stage)
    {
        var existing = await db.Stages.FindAsync(stage.Id);
        if (existing is null)
            db.Stages.Add(stage);
        else
            db.Entry(existing).CurrentValues.SetValues(stage);
        await db.SaveChangesAsync();
    }

    public async Task<bool> DeleteAsync(string userId, string id)
    {
        var entity = await db.Stages.FirstOrDefaultAsync(s => s.UserId == userId && s.Id == id);
        if (entity is null) return false;
        db.Stages.Remove(entity);
        await db.SaveChangesAsync();
        return true;
    }

    public async Task DeleteAllByUserIdAsync(string userId) =>
        await db.Stages.Where(s => s.UserId == userId).ExecuteDeleteAsync();
}
