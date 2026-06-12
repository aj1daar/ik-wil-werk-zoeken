namespace backend.Models;

public sealed class User
{
    public string UserId { get; set; } = Guid.NewGuid().ToString("N");
    public string Email { get; set; } = string.Empty;
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string? TargetRole { get; set; }
    public string? PreferredLocation { get; set; }
    public string WorkType { get; set; } = "any";
    public string GdprConsentAt { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
