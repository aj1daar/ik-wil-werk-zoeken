using System.Text.Json.Serialization;
using backend.Models;

namespace backend;

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(User))]
[JsonSerializable(typeof(SponsorCompany))]
[JsonSerializable(typeof(ApplicationStage))]
[JsonSerializable(typeof(LoginRequest))]
[JsonSerializable(typeof(LoginResponse))]
[JsonSerializable(typeof(JwtPayload))]
[JsonSerializable(typeof(User[]))]
[JsonSerializable(typeof(SponsorCompany[]))]
[JsonSerializable(typeof(ApplicationStage[]))]
internal partial class AppJsonSerializerContext : JsonSerializerContext
{
}
