using System.Text.Json.Serialization;
using backend.Models;

namespace backend;

[JsonSerializable(typeof(User))]
[JsonSerializable(typeof(SponsorCompany))]
[JsonSerializable(typeof(ApplicationStage))]
[JsonSerializable(typeof(LoginRequest))]
[JsonSerializable(typeof(LoginResponse))]
[JsonSerializable(typeof(JwtPayload))]
internal partial class AppJsonSerializerContext : JsonSerializerContext
{
}
