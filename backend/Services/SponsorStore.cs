using backend.Data;
using backend.Models;
using Microsoft.EntityFrameworkCore;

namespace backend.Services;

public sealed class SponsorStore(AppDbContext db)
{
    public async Task<IReadOnlyList<SponsorCompany>> GetAllAsync() =>
        await db.Sponsors.ToListAsync();

    public async Task<SponsorCompany?> GetAsync(string id) =>
        await db.Sponsors.FindAsync(id);

    public async Task UpsertAsync(SponsorCompany company)
    {
        var existing = await db.Sponsors.FindAsync(company.Id);
        if (existing is null)
            db.Sponsors.Add(company);
        else
            db.Entry(existing).CurrentValues.SetValues(company);
        await db.SaveChangesAsync();
    }

    public async Task UpsertAllAsync(IEnumerable<SponsorCompany> companies)
    {
        foreach (var company in companies)
        {
            var existing = await db.Sponsors.FindAsync(company.Id);
            if (existing is null)
                db.Sponsors.Add(company);
            else
                db.Entry(existing).CurrentValues.SetValues(company);
        }
        await db.SaveChangesAsync();
    }
}
