namespace backend.Models;

public sealed class StatusHistory
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string ApplicationId { get; set; } = string.Empty;
    public string UserId { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public DateOnly StatusDate { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class AddStatusHistoryRequest
{
    public string Status { get; set; } = string.Empty;
    public string StatusDate { get; set; } = string.Empty;
}

public sealed class UpdateStatusHistoryRequest
{
    public string? Status { get; set; }
    public string? StatusDate { get; set; }
}
