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
[JsonSerializable(typeof(ErrorResponse))]
[JsonSerializable(typeof(JwtPayload))]
[JsonSerializable(typeof(PreferencesPayload))]
[JsonSerializable(typeof(SponsorCompany[]))]
[JsonSerializable(typeof(ApplicationStage[]))]
[JsonSerializable(typeof(string[]))]
internal partial class AppJsonSerializerContext : JsonSerializerContext
{
}
