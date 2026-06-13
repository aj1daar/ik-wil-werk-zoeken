using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using backend.Models;

namespace backend.Services;

public sealed class TokenService
{
    private const int TokenLifetimeDays = 7;

    public string? CreateToken(User user)
    {
        var secret = Environment.GetEnvironmentVariable("JWT_SECRET");
        if (string.IsNullOrWhiteSpace(secret)) return null;

        var payload = new JwtPayload
        {
            Sub = user.UserId,
            Email = user.Email,
            FirstName = user.FirstName,
            LastName = user.LastName,
            Role = user.Role,
            Preferences = new PreferencesPayload
            {
                TargetRole = user.TargetRole,
                Location = user.PreferredLocation,
                WorkType = user.WorkType,
            },
            Exp = DateTimeOffset.UtcNow.AddDays(TokenLifetimeDays).ToUnixTimeSeconds(),
        };

        var header = Base64UrlEncode(Encoding.UTF8.GetBytes("""{"alg":"HS256","typ":"JWT"}"""));
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

        var signing = $"{parts[0]}.{parts[1]}";
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
            var parts = token.Split('.');
            var payloadBytes = Base64UrlDecode(parts[1]);
            var parsed = JsonSerializer.Deserialize(payloadBytes, AppJsonSerializerContext.Default.JwtPayload);
            return string.IsNullOrEmpty(parsed?.Email) ? null : parsed.Email;
        }
        catch { return null; }
    }

    public string? GetRole(string? bearerOrToken)
    {
        var token = ExtractToken(bearerOrToken);
        if (token is null) return null;
        try
        {
            var parts = token.Split('.');
            var payloadBytes = Base64UrlDecode(parts[1]);
            var parsed = JsonSerializer.Deserialize(payloadBytes, AppJsonSerializerContext.Default.JwtPayload);
            return string.IsNullOrEmpty(parsed?.Role) ? null : parsed.Role;
        }
        catch { return null; }
    }

    public string? GetUserId(string? bearerOrToken)
    {
        var token = ExtractToken(bearerOrToken);
        if (token is null) return null;
        try
        {
            var parts = token.Split('.');
            var payloadBytes = Base64UrlDecode(parts[1]);
            var parsed = JsonSerializer.Deserialize(payloadBytes, AppJsonSerializerContext.Default.JwtPayload);
            return string.IsNullOrEmpty(parsed?.Sub) ? null : parsed.Sub;
        }
        catch { return null; }
    }

    public string CreateResetToken(string userId)
    {
        var secret = Environment.GetEnvironmentVariable("JWT_SECRET") ?? "";
        var exp = DateTimeOffset.UtcNow.AddHours(1).ToUnixTimeSeconds();
        var data = $"reset.{userId}.{exp}";
        var sig = Base64UrlEncode(HMACSHA256.HashData(
            Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(data)));
        return $"{userId}.{exp}.{sig}";
    }

    // Returns userId if valid and not expired; null otherwise. Constant-time HMAC compare.
    public string? ValidateResetToken(string? token)
    {
        if (string.IsNullOrWhiteSpace(token)) return null;
        var parts = token.Split('.');
        if (parts.Length != 3) return null;

        var userId = parts[0];
        var expStr = parts[1];
        var sig = parts[2];

        if (string.IsNullOrEmpty(userId) || !long.TryParse(expStr, out var exp)) return null;
        if (exp <= DateTimeOffset.UtcNow.ToUnixTimeSeconds()) return null;

        var secret = Environment.GetEnvironmentVariable("JWT_SECRET") ?? "";
        var data = $"reset.{userId}.{exp}";
        var expectedSig = Base64UrlEncode(HMACSHA256.HashData(
            Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(data)));

        return CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(sig), Encoding.UTF8.GetBytes(expectedSig))
            ? userId
            : null;
    }

    // Verification tokens use "verify." prefix in HMAC data so they cannot be swapped with reset tokens.
    // Expiry: 72 hours.
    public string CreateVerificationToken(string userId)
    {
        var secret = Environment.GetEnvironmentVariable("JWT_SECRET") ?? "";
        var exp = DateTimeOffset.UtcNow.AddHours(72).ToUnixTimeSeconds();
        var data = $"verify.{userId}.{exp}";
        var sig = Base64UrlEncode(HMACSHA256.HashData(
            Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(data)));
        return $"{userId}.{exp}.{sig}";
    }

    public string? ValidateVerificationToken(string? token)
    {
        if (string.IsNullOrWhiteSpace(token)) return null;
        var parts = token.Split('.');
        if (parts.Length != 3) return null;

        var userId = parts[0];
        var expStr = parts[1];
        var sig = parts[2];

        if (string.IsNullOrEmpty(userId) || !long.TryParse(expStr, out var exp)) return null;
        if (exp <= DateTimeOffset.UtcNow.ToUnixTimeSeconds()) return null;

        var secret = Environment.GetEnvironmentVariable("JWT_SECRET") ?? "";
        var data = $"verify.{userId}.{exp}";
        var expectedSig = Base64UrlEncode(HMACSHA256.HashData(
            Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(data)));

        return CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(sig), Encoding.UTF8.GetBytes(expectedSig))
            ? userId
            : null;
    }

    // Email-change tokens encode new email as Base64Url so dots in the address don't break splitting.
    // Token: {userId}.{base64UrlEmail}.{exp}.{sig}   HMAC: "email-change.{userId}.{newEmail}.{exp}"
    public string CreateEmailChangeToken(string userId, string newEmail)
    {
        var secret = Environment.GetEnvironmentVariable("JWT_SECRET") ?? "";
        var exp = DateTimeOffset.UtcNow.AddHours(24).ToUnixTimeSeconds();
        var encodedEmail = Base64UrlEncode(Encoding.UTF8.GetBytes(newEmail));
        var data = $"email-change.{userId}.{newEmail}.{exp}";
        var sig = Base64UrlEncode(HMACSHA256.HashData(
            Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(data)));
        return $"{userId}.{encodedEmail}.{exp}.{sig}";
    }

    public (string UserId, string NewEmail)? ValidateEmailChangeToken(string? token)
    {
        if (string.IsNullOrWhiteSpace(token)) return null;
        var parts = token.Split('.');
        if (parts.Length != 4) return null;

        var userId = parts[0];
        var encodedEmail = parts[1];
        var expStr = parts[2];
        var sig = parts[3];

        if (string.IsNullOrEmpty(userId) || !long.TryParse(expStr, out var exp)) return null;
        if (exp <= DateTimeOffset.UtcNow.ToUnixTimeSeconds()) return null;

        string newEmail;
        try { newEmail = Encoding.UTF8.GetString(Base64UrlDecode(encodedEmail)); }
        catch { return null; }

        var secret = Environment.GetEnvironmentVariable("JWT_SECRET") ?? "";
        var data = $"email-change.{userId}.{newEmail}.{exp}";
        var expectedSig = Base64UrlEncode(HMACSHA256.HashData(
            Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(data)));

        return CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(sig), Encoding.UTF8.GetBytes(expectedSig))
            ? (userId, newEmail)
            : null;
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
