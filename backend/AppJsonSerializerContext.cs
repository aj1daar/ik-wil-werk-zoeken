using System.Text.Json.Serialization;
using backend.Models;

namespace backend;

[JsonSerializable(typeof(User))]
[JsonSerializable(typeof(SponsorCompany))]
[JsonSerializable(typeof(ApplicationStage))]
internal partial class AppJsonSerializerContext : JsonSerializerContext
{
}
