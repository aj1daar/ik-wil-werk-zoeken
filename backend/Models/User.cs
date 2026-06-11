using Azure;
using Azure.Data.Tables;

namespace backend.Models;

public sealed class UserEntity : ITableEntity
{
    public string PartitionKey { get; set; } = "users";
    public string RowKey       { get; set; } = string.Empty; // email lowercased
    public DateTimeOffset? Timestamp { get; set; }
    public ETag ETag { get; set; } = ETag.All;

    public string UserId    { get; set; } = Guid.NewGuid().ToString();
    public string Email     { get; set; } = string.Empty;
    public string FirstName { get; set; } = string.Empty;
    public string LastName  { get; set; } = string.Empty;

    // "SHA256.<iterations>.<base64salt>.<base64hash>"
    public string PasswordHash { get; set; } = string.Empty;

    public string? TargetRole        { get; set; }
    public string? PreferredLocation { get; set; }
    public string  WorkType          { get; set; } = "any";

    public string GdprConsentAt { get; set; } = string.Empty;
    public string CreatedAt     { get; set; } = string.Empty;
}
