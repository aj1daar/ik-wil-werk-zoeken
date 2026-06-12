using System.Text.Json.Serialization;
using backend.Models;

namespace backend;

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(SponsorCompany))]
[JsonSerializable(typeof(ApplicationStage))]
[JsonSerializable(typeof(LoginRequest))]
[JsonSerializable(typeof(LoginResponse))]
[JsonSerializable(typeof(RegisterRequest))]
[JsonSerializable(typeof(UpdateProfileRequest))]
[JsonSerializable(typeof(ChangePasswordRequest))]
[JsonSerializable(typeof(ForgotPasswordRequest))]
[JsonSerializable(typeof(ResetPasswordRequest))]
[JsonSerializable(typeof(ResendVerificationRequest))]
[JsonSerializable(typeof(ChangeEmailRequest))]
[JsonSerializable(typeof(PromoteRequest))]
[JsonSerializable(typeof(AdminUserSummary))]
[JsonSerializable(typeof(AdminUserSummary[]), TypeInfoPropertyName = "AdminUserSummaryArray")]
[JsonSerializable(typeof(MessageResponse))]
[JsonSerializable(typeof(ResendEmailRequest))]
[JsonSerializable(typeof(ErrorResponse))]
[JsonSerializable(typeof(JwtPayload))]
[JsonSerializable(typeof(PreferencesPayload))]
[JsonSerializable(typeof(SponsorCompany[]))]
[JsonSerializable(typeof(ApplicationStage[]))]
[JsonSerializable(typeof(StatsResponse))]
[JsonSerializable(typeof(Dictionary<string, int>))]
[JsonSerializable(typeof(string[]))]
internal partial class AppJsonSerializerContext : JsonSerializerContext
{
}
