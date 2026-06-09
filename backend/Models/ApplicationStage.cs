namespace backend.Models;

public sealed class ApplicationStage
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string SponsorCompanyId { get; set; } = string.Empty;
    public string Status { get; set; } = "Bookmarked";
    public string? Notes { get; set; }
    public string? ContactPersonName { get; set; }
    public string? ContactPersonEmail { get; set; }
    public string[] Cities { get; set; } = [];
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
