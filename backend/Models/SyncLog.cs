namespace backend.Models;

public sealed class SyncLog
{
    public int Id { get; set; }
    public DateTimeOffset SyncedAt { get; set; } = DateTimeOffset.UtcNow;
    public string TriggerSource { get; set; } = string.Empty; // "monthly" | "admin"
    public int Added { get; set; }
    public int Updated { get; set; }
    public int Removed { get; set; }
    public int Enriched { get; set; }
    public int TotalAfterSync { get; set; }
}
