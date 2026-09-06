using System.Text.Json.Serialization;

namespace backend.Models;

public sealed class LoginRequest
{
    [JsonPropertyName("email")] public string Email { get; set; } = string.Empty;
    [JsonPropertyName("password")] public string Password { get; set; } = string.Empty;
}

public sealed class LoginResponse
{
    [JsonPropertyName("token")] public string Token { get; set; } = string.Empty;
}

public sealed class RegisterRequest
{
    [JsonPropertyName("firstName")] public string FirstName { get; set; } = string.Empty;
    [JsonPropertyName("lastName")] public string LastName { get; set; } = string.Empty;
    [JsonPropertyName("email")] public string Email { get; set; } = string.Empty;
    [JsonPropertyName("password")] public string Password { get; set; } = string.Empty;
    [JsonPropertyName("preferences")] public PreferencesPayload? Preferences { get; set; }
    [JsonPropertyName("gdprConsentAt")] public string GdprConsentAt { get; set; } = string.Empty;
}

public sealed class UpdateProfileRequest
{
    [JsonPropertyName("firstName")] public string FirstName { get; set; } = string.Empty;
    [JsonPropertyName("lastName")] public string LastName { get; set; } = string.Empty;
    [JsonPropertyName("preferences")] public PreferencesPayload? Preferences { get; set; }
}

public sealed class ChangePasswordRequest
{
    [JsonPropertyName("currentPassword")] public string CurrentPassword { get; set; } = string.Empty;
    [JsonPropertyName("newPassword")] public string NewPassword { get; set; } = string.Empty;
}

public sealed class ForgotPasswordRequest
{
    [JsonPropertyName("email")] public string Email { get; set; } = string.Empty;
}

public sealed class ResetPasswordRequest
{
    [JsonPropertyName("token")] public string Token { get; set; } = string.Empty;
    [JsonPropertyName("newPassword")] public string NewPassword { get; set; } = string.Empty;
}

public sealed class ResendVerificationRequest
{
    [JsonPropertyName("email")] public string Email { get; set; } = string.Empty;
}

public sealed class ChangeEmailRequest
{
    [JsonPropertyName("currentPassword")] public string CurrentPassword { get; set; } = string.Empty;
    [JsonPropertyName("newEmail")] public string NewEmail { get; set; } = string.Empty;
}

public sealed class MessageResponse
{
    [JsonPropertyName("message")] public string Message { get; set; } = string.Empty;
}

public sealed class EnrichResponse
{
    [JsonPropertyName("enriched")]  public int    Enriched  { get; set; }
    [JsonPropertyName("remaining")] public int    Remaining { get; set; }
    [JsonPropertyName("message")]   public string Message   { get; set; } = string.Empty;
}

internal sealed class ResendEmailRequest
{
    [JsonPropertyName("from")] public string From { get; set; } = string.Empty;
    [JsonPropertyName("to")] public string[] To { get; set; } = [];
    [JsonPropertyName("subject")] public string Subject { get; set; } = string.Empty;
    [JsonPropertyName("html")] public string Html { get; set; } = string.Empty;
}

public sealed class PreferencesPayload
{
    [JsonPropertyName("targetRole")] public string? TargetRole { get; set; }
    [JsonPropertyName("location")] public string? Location { get; set; }
    [JsonPropertyName("workType")] public string WorkType { get; set; } = "any";
}

public sealed class ErrorResponse
{
    [JsonPropertyName("message")] public string Message { get; set; } = string.Empty;
}

public sealed class StatsResponse
{
    [JsonPropertyName("total")] public int Total { get; set; }
    [JsonPropertyName("byStatus")] public Dictionary<string, int> ByStatus { get; set; } = new();
}

public sealed class StatusFlowNode
{
    [JsonPropertyName("status")]  public string Status { get; set; } = string.Empty;
    // How many applications ever passed through this status.
    [JsonPropertyName("total")]   public int Total { get; set; }
    // How many applications are currently sitting at this status (their latest entry).
    [JsonPropertyName("current")] public int Current { get; set; }
}

public sealed class StatusFlowEdge
{
    [JsonPropertyName("from")]  public string From { get; set; } = string.Empty;
    [JsonPropertyName("to")]    public string To { get; set; } = string.Empty;
    [JsonPropertyName("count")] public int Count { get; set; }
}

public sealed class StatusFlowResponse
{
    [JsonPropertyName("nodes")] public StatusFlowNode[] Nodes { get; set; } = [];
    [JsonPropertyName("edges")] public StatusFlowEdge[] Edges { get; set; } = [];
}

public sealed class PromoteRequest
{
    [JsonPropertyName("email")] public string Email { get; set; } = string.Empty;
}

public sealed class BulkStatusRequest
{
    [JsonPropertyName("ids")] public string[] Ids { get; set; } = [];
    [JsonPropertyName("status")] public string Status { get; set; } = string.Empty;
}

// Admin manual override of company fields. Every property is optional; a null
// value clears the field, a whitespace-only string clears it too. Array fields
// are trimmed, de-duplicated (case-insensitive, first wins) and empty-filtered.
public sealed class UpdateCompanyRequest
{
    // The display name. Unlike every other field, null or omitted means "leave the
    // name as it is" — a company always needs a name, so it can never be cleared.
    // Renaming keeps the previous name as an alias so applications saved under it
    // still resolve to this company.
    [JsonPropertyName("name")]              public string? Name { get; set; }
    [JsonPropertyName("summary")]           public string? Summary { get; set; }
    [JsonPropertyName("city")]              public string? City { get; set; }
    [JsonPropertyName("locations")]         public string[]? Locations { get; set; }
    [JsonPropertyName("websiteUrl")]        public string? WebsiteUrl { get; set; }
    [JsonPropertyName("coreIndustry")]      public string? CoreIndustry { get; set; }
    [JsonPropertyName("techStackTags")]     public string[]? TechStackTags { get; set; }
    [JsonPropertyName("functionalTags")]    public string[]? FunctionalTags { get; set; }
    [JsonPropertyName("workingLanguage")]   public string? WorkingLanguage { get; set; }
    [JsonPropertyName("companySize")]       public string? CompanySize { get; set; }
    [JsonPropertyName("remotePolicy")]      public string? RemotePolicy { get; set; }
    [JsonPropertyName("parentCompanyName")] public string? ParentCompanyName { get; set; }
    [JsonPropertyName("targetMarket")]      public string? TargetMarket { get; set; }
}

// Normalized, validated result of an UpdateCompanyRequest — every value is the
// final value to persist (null = clear the column).
public sealed record CompanyEdit(
    string? Summary,
    string? City,
    string[]? Locations,
    string? WebsiteUrl,
    string? CoreIndustry,
    string[]? TechStackTags,
    string[]? FunctionalTags,
    string? WorkingLanguage,
    string? CompanySize,
    string? RemotePolicy,
    string? ParentCompanyName,
    string? TargetMarket,
    // null = keep the current name (see UpdateCompanyRequest.Name).
    string? Name = null);

// Admin merge of one or more duplicate companies into a single surviving company.
public sealed class MergeCompaniesRequest
{
    [JsonPropertyName("targetId")]  public string   TargetId  { get; set; } = string.Empty;
    [JsonPropertyName("sourceIds")] public string[] SourceIds { get; set; } = [];
}

public sealed class MergeCompaniesResponse
{
    [JsonPropertyName("target")]              public SponsorCompany? Target { get; set; }
    [JsonPropertyName("mergedIds")]           public string[] MergedIds { get; set; } = [];
    [JsonPropertyName("movedApplications")]   public int MovedApplications { get; set; }
    [JsonPropertyName("movedListEntries")]    public int MovedListEntries { get; set; }
    [JsonPropertyName("droppedListEntries")]  public int DroppedListEntries { get; set; }
    [JsonPropertyName("message")]             public string Message { get; set; } = string.Empty;
}

public sealed class AdminUserSummary
{
    [JsonPropertyName("userId")] public string UserId { get; set; } = string.Empty;
    [JsonPropertyName("email")] public string Email { get; set; } = string.Empty;
    [JsonPropertyName("firstName")] public string FirstName { get; set; } = string.Empty;
    [JsonPropertyName("lastName")] public string LastName { get; set; } = string.Empty;
    [JsonPropertyName("role")] public string Role { get; set; } = string.Empty;
    [JsonPropertyName("emailVerified")] public bool EmailVerified { get; set; }
    [JsonPropertyName("createdAt")] public DateTimeOffset CreatedAt { get; set; }
}

internal sealed class JwtPayload
{
    [JsonPropertyName("sub")] public string Sub { get; set; } = string.Empty;
    [JsonPropertyName("email")] public string Email { get; set; } = string.Empty;
    [JsonPropertyName("firstName")] public string FirstName { get; set; } = string.Empty;
    [JsonPropertyName("lastName")] public string LastName { get; set; } = string.Empty;
    [JsonPropertyName("role")] public string Role { get; set; } = "user";
    [JsonPropertyName("preferences")] public PreferencesPayload? Preferences { get; set; }
    [JsonPropertyName("exp")] public long Exp { get; set; }
}
