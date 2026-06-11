using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using backend.Models;

namespace backend.Services;

public sealed class TokenService
{
    private const int TokenLifetimeDays = 7;

    public string? CreateToken(UserEntity user)
    {
        var secret = Environment.GetEnvironmentVariable("JWT_SECRET");
        if (string.IsNullOrWhiteSpace(secret)) return null;

        var payload = new JwtPayload
        {
            Sub       = user.UserId,
            Email     = user.Email,
            FirstName = user.FirstName,
            LastName  = user.LastName,
            Preferences = new PreferencesPayload
            {
                TargetRole = user.TargetRole,
                Location   = user.PreferredLocation,
                WorkType   = user.WorkType,
            },
            Exp = DateTimeOffset.UtcNow.AddDays(TokenLifetimeDays).ToUnixTimeSeconds(),
        };

        var header  = Base64UrlEncode(Encoding.UTF8.GetBytes("""{"alg":"HS256","typ":"JWT"}"""));
        var payloadEncoded = Base64UrlEncode(JsonSerializer.SerializeToUtf8Bytes(
            payload, AppJsonSerializerContext.Default.JwtPayload));
        var signing = $"{header}.{payloadEncoded}";
        var sig = Base64UrlEncode(HMACSHA256.HashData(
            Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(signing)));
        return $"{header}.{payloadEncoded}.{sig}";
    }

    public bool ValidateToken(string? bearerOrToken)
    {
        var token = ExtractToken(bearerOrToken);
        if (token is null) return false;

        var secret = Environment.GetEnvironmentVariable("JWT_SECRET");
        if (string.IsNullOrWhiteSpace(secret)) return false;

        var parts = token.Split('.');
        if (parts.Length != 3) return false;

        var signing     = $"{parts[0]}.{parts[1]}";
        var expectedSig = Base64UrlEncode(HMACSHA256.HashData(
            Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(signing)));

        if (!CryptographicOperations.FixedTimeEquals(
                Encoding.UTF8.GetBytes(parts[2]),
                Encoding.UTF8.GetBytes(expectedSig)))
            return false;

        try
        {
            var payloadBytes = Base64UrlDecode(parts[1]);
            var parsed = JsonSerializer.Deserialize(payloadBytes, AppJsonSerializerContext.Default.JwtPayload);
            return parsed?.Exp > DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        }
        catch { return false; }
    }

    public string? GetEmail(string? bearerOrToken)
    {
        var token = ExtractToken(bearerOrToken);
        if (token is null) return null;
        try
        {
            var parts        = token.Split('.');
            var payloadBytes = Base64UrlDecode(parts[1]);
            var parsed = JsonSerializer.Deserialize(payloadBytes, AppJsonSerializerContext.Default.JwtPayload);
            return string.IsNullOrEmpty(parsed?.Email) ? null : parsed.Email;
        }
        catch { return null; }
    }

    private static string? ExtractToken(string? bearerOrToken)
    {
        if (string.IsNullOrWhiteSpace(bearerOrToken)) return null;
        return bearerOrToken.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)
            ? bearerOrToken[7..]
            : bearerOrToken;
    }

    private static string Base64UrlEncode(byte[] input) =>
        Convert.ToBase64String(input).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static byte[] Base64UrlDecode(string input)
    {
        var s = input.Replace('-', '+').Replace('_', '/');
        s = (s.Length % 4) switch { 2 => s + "==", 3 => s + "=", _ => s };
        return Convert.FromBase64String(s);
    }
}
