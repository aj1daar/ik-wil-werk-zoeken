namespace backend.Models;

public sealed class ApplicationStage
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string UserId { get; set; } = string.Empty;
    public string CompanyName { get; set; } = string.Empty;
    public string Position { get; set; } = string.Empty;
    public DateTimeOffset AppliedAt { get; set; } = DateTimeOffset.UtcNow;
    public string Status { get; set; } = "Applied";
    public string? RejectionReason { get; set; }
    public string? RejectionNote { get; set; }
    public string? Notes { get; set; }
    public string? ContactPersonName { get; set; }
    public string? ContactPersonEmail { get; set; }
    public string[] Locations { get; set; } = [];
    public DateTimeOffset? FollowUpDate { get; set; }
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public string? SponsorCompanyId { get; set; }
    public string? JobUrl { get; set; }
}
