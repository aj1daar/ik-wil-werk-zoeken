namespace backend.Models;

public sealed class User
{
    public string UserId { get; set; } = Guid.NewGuid().ToString("N");
    public string Email { get; set; } = string.Empty;
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    // Empty for an account that has only ever signed in with Google. Nothing
    // verifies against an empty hash, so such an account has no password until
    // its owner sets one through the reset flow.
    public string PasswordHash { get; set; } = string.Empty;

    // Google's own immutable id for the account, which is what the link is made
    // on. An address can change hands at a company domain; this cannot.
    public string? GoogleSubject { get; set; }
    public string? TargetRole { get; set; }
    public string? PreferredLocation { get; set; }
    public string WorkType { get; set; } = "any";
    public string GdprConsentAt { get; set; } = string.Empty;

    // Which version of the privacy notice was accepted. A timestamp alone says
    // when somebody agreed, never to what.
    public string PrivacyVersion { get; set; } = string.Empty;
    public bool EmailVerified { get; set; } = false;
    public string Role { get; set; } = "user";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
