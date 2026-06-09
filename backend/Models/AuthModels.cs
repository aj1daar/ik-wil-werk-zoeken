using System.Text.Json.Serialization;

namespace backend.Models;

public sealed class LoginRequest
{
    [JsonPropertyName("password")] public string Password { get; set; } = string.Empty;
}

public sealed class LoginResponse
{
    [JsonPropertyName("token")] public string Token { get; set; } = string.Empty;
}

internal sealed class JwtPayload
{
    [JsonPropertyName("exp")] public long Exp { get; set; }
}
