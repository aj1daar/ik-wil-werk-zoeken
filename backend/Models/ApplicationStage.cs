namespace backend.Models;

public enum PipelineStage
{
    Bookmarked,
    Applied,
    Interviewing,
    Offered,
    Rejected
}

public sealed class ApplicationStage
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string UserId { get; set; } = string.Empty;
    public string SponsorCompanyId { get; set; } = string.Empty;
    public PipelineStage Stage { get; set; } = PipelineStage.Bookmarked;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
