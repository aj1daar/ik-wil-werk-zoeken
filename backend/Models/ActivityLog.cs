namespace backend.Models;

public sealed class ActivityLog
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string ApplicationId { get; set; } = string.Empty;
    public string UserId { get; set; } = string.Empty;
    public string Field { get; set; } = string.Empty;
    public string? OldValue { get; set; }
    public string? NewValue { get; set; }
    public DateTimeOffset ChangedAt { get; set; } = DateTimeOffset.UtcNow;
}
