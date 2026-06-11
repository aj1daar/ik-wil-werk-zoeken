using System.Text.Json.Serialization;

namespace backend.Models;

public sealed class LoginRequest
{
    [JsonPropertyName("email")]    public string Email    { get; set; } = string.Empty;
    [JsonPropertyName("password")] public string Password { get; set; } = string.Empty;
}

public sealed class LoginResponse
{
    [JsonPropertyName("token")] public string Token { get; set; } = string.Empty;
}

public sealed class RegisterRequest
{
    [JsonPropertyName("firstName")]     public string FirstName    { get; set; } = string.Empty;
    [JsonPropertyName("lastName")]      public string LastName     { get; set; } = string.Empty;
    [JsonPropertyName("email")]         public string Email        { get; set; } = string.Empty;
    [JsonPropertyName("password")]      public string Password     { get; set; } = string.Empty;
    [JsonPropertyName("preferences")]   public PreferencesPayload? Preferences  { get; set; }
    [JsonPropertyName("gdprConsentAt")] public string GdprConsentAt { get; set; } = string.Empty;
}

public sealed class UpdateProfileRequest
{
    [JsonPropertyName("firstName")]   public string FirstName  { get; set; } = string.Empty;
    [JsonPropertyName("lastName")]    public string LastName   { get; set; } = string.Empty;
    [JsonPropertyName("preferences")] public PreferencesPayload? Preferences { get; set; }
}

public sealed class ChangePasswordRequest
{
    [JsonPropertyName("currentPassword")] public string CurrentPassword { get; set; } = string.Empty;
    [JsonPropertyName("newPassword")]     public string NewPassword     { get; set; } = string.Empty;
}

public sealed class ForgotPasswordRequest
{
    [JsonPropertyName("email")] public string Email { get; set; } = string.Empty;
}

public sealed class ResetPasswordRequest
{
    [JsonPropertyName("token")]       public string Token       { get; set; } = string.Empty;
    [JsonPropertyName("newPassword")] public string NewPassword { get; set; } = string.Empty;
}

internal sealed class ResendEmailRequest
{
    [JsonPropertyName("from")]    public string   From    { get; set; } = string.Empty;
    [JsonPropertyName("to")]      public string[] To      { get; set; } = [];
    [JsonPropertyName("subject")] public string   Subject { get; set; } = string.Empty;
    [JsonPropertyName("html")]    public string   Html    { get; set; } = string.Empty;
}

public sealed class PreferencesPayload
{
    [JsonPropertyName("targetRole")] public string? TargetRole { get; set; }
    [JsonPropertyName("location")]   public string? Location   { get; set; }
    [JsonPropertyName("workType")]   public string  WorkType   { get; set; } = "any";
}

public sealed class ErrorResponse
{
    [JsonPropertyName("message")] public string Message { get; set; } = string.Empty;
}

internal sealed class JwtPayload
{
    [JsonPropertyName("sub")]         public string Sub       { get; set; } = string.Empty;
    [JsonPropertyName("email")]       public string Email     { get; set; } = string.Empty;
    [JsonPropertyName("firstName")]   public string FirstName { get; set; } = string.Empty;
    [JsonPropertyName("lastName")]    public string LastName  { get; set; } = string.Empty;
    [JsonPropertyName("preferences")] public PreferencesPayload? Preferences { get; set; }
    [JsonPropertyName("exp")]         public long   Exp       { get; set; }
}
