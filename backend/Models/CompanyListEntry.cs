namespace backend.Models;

// One row per (user, company). Kind is mutually exclusive: a company is either
// on the user's "interested" shortlist or "hidden" from the list, never both.
public sealed class CompanyListEntry
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string UserId { get; set; } = string.Empty;
    public string SponsorCompanyId { get; set; } = string.Empty;
    public string Kind { get; set; } = "interested"; // "interested" | "hidden"
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
