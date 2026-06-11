using Azure;
using Azure.Data.Tables;

namespace backend.Models;

public sealed class StageEntity : ITableEntity
{
    // PartitionKey = userId  |  RowKey = stage Id
    public string PartitionKey { get; set; } = string.Empty;
    public string RowKey       { get; set; } = string.Empty;
    public DateTimeOffset? Timestamp { get; set; }
    public ETag ETag { get; set; } = ETag.All;

    public string  SponsorCompanyId   { get; set; } = string.Empty;
    public string  Status             { get; set; } = "Bookmarked";
    public string? Notes              { get; set; }
    public string? ContactPersonName  { get; set; }
    public string? ContactPersonEmail { get; set; }
    public string  CitiesJson         { get; set; } = "[]";
    public DateTimeOffset UpdatedAt   { get; set; } = DateTimeOffset.UtcNow;
}
