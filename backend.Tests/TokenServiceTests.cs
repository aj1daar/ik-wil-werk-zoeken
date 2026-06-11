using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using backend.Models;
using backend.Services;
using Xunit;

namespace backend.Tests;

public sealed class TokenServiceTests : IDisposable
{
    private const string Secret = "test-secret-must-be-at-least-32-chars!";

    public TokenServiceTests() =>
        Environment.SetEnvironmentVariable("JWT_SECRET", Secret);

    public void Dispose() =>
        Environment.SetEnvironmentVariable("JWT_SECRET", null);

    // ── CreateToken ──────────────────────────────────────────────────────────

    [Fact]
    public void CreateToken_ReturnsThreePartJwt()
    {
        var token = new TokenService().CreateToken(MakeUser());
        Assert.NotNull(token);
        Assert.Equal(3, token.Split('.').Length);
    }

    [Fact]
    public void CreateToken_WhenSecretMissing_ReturnsNull()
    {
        Environment.SetEnvironmentVariable("JWT_SECRET", null);
        Assert.Null(new TokenService().CreateToken(MakeUser()));
    }

    [Fact]
    public void CreateToken_WhenSecretIsWhitespace_ReturnsNull()
    {
        Environment.SetEnvironmentVariable("JWT_SECRET", "   ");
        Assert.Null(new TokenService().CreateToken(MakeUser()));
    }

    [Fact]
    public void CreateToken_WhenSecretIsEmpty_ReturnsNull()
    {
        Environment.SetEnvironmentVariable("JWT_SECRET", "");
        Assert.Null(new TokenService().CreateToken(MakeUser()));
    }

    [Fact]
    public void CreateToken_ProducedTokenIsImmediatelyValid()
    {
        var svc = new TokenService();
        Assert.True(svc.ValidateToken(svc.CreateToken(MakeUser())!));
    }

    // ── CreateToken – user claims in payload ─────────────────────────────────

    [Fact]
    public void CreateToken_PayloadContainsUserEmail()
    {
        var user  = MakeUser(email: "check@example.nl");
        var token = new TokenService().CreateToken(user)!;
        Assert.Equal("check@example.nl", DecodePayload(token).GetProperty("email").GetString());
    }

    [Fact]
    public void CreateToken_PayloadContainsSubEqualToUserId()
    {
        var user  = MakeUser(userId: "uuid-abc-123");
        var token = new TokenService().CreateToken(user)!;
        Assert.Equal("uuid-abc-123", DecodePayload(token).GetProperty("sub").GetString());
    }

    [Fact]
    public void CreateToken_PayloadContainsFirstAndLastName()
    {
        var user    = MakeUser(firstName: "Piet", lastName: "Janssen");
        var token   = new TokenService().CreateToken(user)!;
        var payload = DecodePayload(token);
        Assert.Equal("Piet",    payload.GetProperty("firstName").GetString());
        Assert.Equal("Janssen", payload.GetProperty("lastName").GetString());
    }

    [Fact]
    public void CreateToken_PayloadHasPositiveExp()
    {
        var token = new TokenService().CreateToken(MakeUser())!;
        var exp   = DecodePayload(token).GetProperty("exp").GetInt64();
        Assert.True(exp > DateTimeOffset.UtcNow.ToUnixTimeSeconds());
    }

    [Fact]
    public void CreateToken_DifferentUsers_ProduceDifferentTokens()
    {
        var svc = new TokenService();
        var t1  = svc.CreateToken(MakeUser(email: "a@example.com"))!;
        var t2  = svc.CreateToken(MakeUser(email: "b@example.com"))!;
        Assert.NotEqual(t1, t2);
    }

    // ── ValidateToken – basic happy path ────────────────────────────────────

    [Fact]
    public void ValidateToken_ValidToken_ReturnsTrue()
    {
        var svc = new TokenService();
        Assert.True(svc.ValidateToken(svc.CreateToken(MakeUser())!));
    }

    [Fact]
    public void ValidateToken_WithBearerPrefix_ReturnsTrue()
    {
        var svc = new TokenService();
        Assert.True(svc.ValidateToken($"Bearer {svc.CreateToken(MakeUser())!}"));
    }

    [Fact]
    public void ValidateToken_BearerCaseInsensitive_ReturnsTrue()
    {
        var svc = new TokenService();
        Assert.True(svc.ValidateToken($"bearer {svc.CreateToken(MakeUser())!}"));
    }

    [Fact]
    public void ValidateToken_BearerMixedCase_ReturnsTrue()
    {
        var svc = new TokenService();
        Assert.True(svc.ValidateToken($"BEARER {svc.CreateToken(MakeUser())!}"));
    }

    // ── ValidateToken – null / empty / whitespace ────────────────────────────

    [Fact]
    public void ValidateToken_Null_ReturnsFalse() =>
        Assert.False(new TokenService().ValidateToken(null));

    [Fact]
    public void ValidateToken_Empty_ReturnsFalse() =>
        Assert.False(new TokenService().ValidateToken(""));

    [Fact]
    public void ValidateToken_WhitespaceOnly_ReturnsFalse() =>
        Assert.False(new TokenService().ValidateToken("   "));

    [Fact]
    public void ValidateToken_WhitespaceOnlyTab_ReturnsFalse() =>
        Assert.False(new TokenService().ValidateToken("\t\t"));

    // ── ValidateToken – malformed structure ──────────────────────────────────

    [Fact]
    public void ValidateToken_WrongNumberOfParts_ReturnsFalse()
    {
        Assert.False(new TokenService().ValidateToken("only.two"));
        Assert.False(new TokenService().ValidateToken("too.many.parts.here"));
        Assert.False(new TokenService().ValidateToken("a"));
    }

    [Fact]
    public void ValidateToken_ThreeEmptyParts_ReturnsFalse() =>
        // ".." splits into ["", "", ""] — valid count but unparseable payload
        Assert.False(new TokenService().ValidateToken(".."));

    [Fact]
    public void ValidateToken_BearerKeywordAlone_ReturnsFalse() =>
        // "Bearer " stripped → "" → 1 part → invalid
        Assert.False(new TokenService().ValidateToken("Bearer "));

    [Fact]
    public void ValidateToken_BearerWithWhitespaceToken_ReturnsFalse() =>
        Assert.False(new TokenService().ValidateToken("Bearer    "));

    [Fact]
    public void ValidateToken_LiteralStringNull_ReturnsFalse() =>
        // Defensive: some HTTP clients send the string "null"
        Assert.False(new TokenService().ValidateToken("null"));

    [Fact]
    public void ValidateToken_TokenWithEmbeddedNewline_ReturnsFalse()
    {
        var svc   = new TokenService();
        var parts = svc.CreateToken(MakeUser())!.Split('.');
        // Injecting a newline into the payload breaks signature binding
        Assert.False(svc.ValidateToken($"{parts[0]}.{parts[1]}\n.{parts[2]}"));
    }

    // ── ValidateToken – tamper detection ────────────────────────────────────

    [Fact]
    public void ValidateToken_TamperedSignature_ReturnsFalse()
    {
        var svc   = new TokenService();
        var parts = svc.CreateToken(MakeUser())!.Split('.');
        Assert.False(svc.ValidateToken($"{parts[0]}.{parts[1]}.invalidsignatureXXX"));
    }

    [Fact]
    public void ValidateToken_TamperedPayload_ReturnsFalse()
    {
        var svc   = new TokenService();
        var parts = svc.CreateToken(MakeUser())!.Split('.');
        // Replace payload with different base64url content, keep original sig
        Assert.False(svc.ValidateToken($"{parts[0]}.dGFtcGVyZWQ.{parts[2]}"));
    }

    [Fact]
    public void ValidateToken_TamperedHeader_ReturnsFalse()
    {
        var svc   = new TokenService();
        var parts = svc.CreateToken(MakeUser())!.Split('.');
        // Change the header — breaks the signature over header.payload
        Assert.False(svc.ValidateToken($"dGFtcGVyZWQ.{parts[1]}.{parts[2]}"));
    }

    // ── ValidateToken – secret missing / mismatch ────────────────────────────

    [Fact]
    public void ValidateToken_WhenSecretMissing_ReturnsFalse()
    {
        var svc   = new TokenService();
        var token = svc.CreateToken(MakeUser())!;
        Environment.SetEnvironmentVariable("JWT_SECRET", null);
        Assert.False(svc.ValidateToken(token));
    }

    [Fact]
    public void ValidateToken_WhenSecretIsEmpty_ReturnsFalse()
    {
        var svc   = new TokenService();
        var token = svc.CreateToken(MakeUser())!;
        Environment.SetEnvironmentVariable("JWT_SECRET", "");
        Assert.False(svc.ValidateToken(token));
    }

    [Fact]
    public void ValidateToken_TokenSignedWithDifferentSecret_ReturnsFalse()
    {
        var svc   = new TokenService();
        var token = svc.CreateToken(MakeUser())!;
        Environment.SetEnvironmentVariable("JWT_SECRET", "completely-different-secret-here!!");
        Assert.False(svc.ValidateToken(token));
    }

    // ── ValidateToken – token expiry ─────────────────────────────────────────

    [Fact]
    public void ValidateToken_ExpiredToken_ReturnsFalse()
    {
        var token = CraftToken(Secret, DateTimeOffset.UtcNow.AddSeconds(-1).ToUnixTimeSeconds());
        Assert.False(new TokenService().ValidateToken(token));
    }

    [Fact]
    public void ValidateToken_ExpiresExactlyNow_ReturnsFalse()
    {
        // exp == now means "just expired" — the check is strictly greater-than
        var token = CraftToken(Secret, DateTimeOffset.UtcNow.ToUnixTimeSeconds());
        Assert.False(new TokenService().ValidateToken(token));
    }

    [Fact]
    public void ValidateToken_ZeroExp_ReturnsFalse()
    {
        // exp = 0 is Unix epoch 1970-01-01 — always in the past
        var token = CraftToken(Secret, 0);
        Assert.False(new TokenService().ValidateToken(token));
    }

    [Fact]
    public void ValidateToken_NegativeExp_ReturnsFalse()
    {
        var token = CraftToken(Secret, -1);
        Assert.False(new TokenService().ValidateToken(token));
    }

    [Fact]
    public void ValidateToken_FutureExp_ReturnsTrue()
    {
        var token = CraftToken(Secret, DateTimeOffset.UtcNow.AddDays(7).ToUnixTimeSeconds());
        Assert.True(new TokenService().ValidateToken(token));
    }

    [Fact]
    public void ValidateToken_ExpiredByLongTime_ReturnsFalse()
    {
        var token = CraftToken(Secret, DateTimeOffset.UtcNow.AddDays(-30).ToUnixTimeSeconds());
        Assert.False(new TokenService().ValidateToken(token));
    }

    // ── GetEmail ─────────────────────────────────────────────────────────────

    [Fact]
    public void GetEmail_ValidToken_ReturnsEmail()
    {
        var svc   = new TokenService();
        var token = svc.CreateToken(MakeUser(email: "jan@example.nl"))!;
        Assert.Equal("jan@example.nl", svc.GetEmail(token));
    }

    [Fact]
    public void GetEmail_BearerPrefixedToken_ReturnsEmail()
    {
        var svc   = new TokenService();
        var token = $"Bearer {svc.CreateToken(MakeUser(email: "user@work.nl"))!}";
        Assert.Equal("user@work.nl", svc.GetEmail(token));
    }

    [Fact]
    public void GetEmail_Null_ReturnsNull() =>
        Assert.Null(new TokenService().GetEmail(null));

    [Fact]
    public void GetEmail_Empty_ReturnsNull() =>
        Assert.Null(new TokenService().GetEmail(""));

    [Fact]
    public void GetEmail_Whitespace_ReturnsNull() =>
        Assert.Null(new TokenService().GetEmail("   "));

    [Fact]
    public void GetEmail_OnePart_ReturnsNull() =>
        Assert.Null(new TokenService().GetEmail("notajwt"));

    [Fact]
    public void GetEmail_MalformedBase64Payload_ReturnsNull()
    {
        var header = B64U(Encoding.UTF8.GetBytes("""{"alg":"HS256","typ":"JWT"}"""));
        Assert.Null(new TokenService().GetEmail($"{header}.!!!notbase64!!!.fakesig"));
    }

    [Fact]
    public void GetEmail_PayloadWithoutEmailField_ReturnsNull()
    {
        var header  = B64U(Encoding.UTF8.GetBytes("""{"alg":"HS256","typ":"JWT"}"""));
        var payload = B64U(Encoding.UTF8.GetBytes("""{"sub":"test","exp":9999999999}"""));
        Assert.Null(new TokenService().GetEmail($"{header}.{payload}.fakesig"));
    }

    [Fact]
    public void GetEmail_PayloadWithEmptyEmail_ReturnsNull()
    {
        var header  = B64U(Encoding.UTF8.GetBytes("""{"alg":"HS256","typ":"JWT"}"""));
        var payload = B64U(Encoding.UTF8.GetBytes("""{"sub":"test","email":"","exp":9999999999}"""));
        Assert.Null(new TokenService().GetEmail($"{header}.{payload}.fakesig"));
    }

    [Fact]
    public void GetEmail_ExpiredToken_StillReturnsEmail()
    {
        // GetEmail does NOT check expiry — it's called after ValidateToken confirms validity
        var header  = B64U(Encoding.UTF8.GetBytes("""{"alg":"HS256","typ":"JWT"}"""));
        var payload = B64U(Encoding.UTF8.GetBytes("""{"sub":"x","email":"old@example.com","exp":1}"""));
        Assert.Equal("old@example.com", new TokenService().GetEmail($"{header}.{payload}.fakesig"));
    }

    [Fact]
    public void GetEmail_InvalidSignature_StillReturnsEmail()
    {
        // GetEmail does NOT verify signature — caller must call ValidateToken first
        var header  = B64U(Encoding.UTF8.GetBytes("""{"alg":"HS256","typ":"JWT"}"""));
        var payload = B64U(Encoding.UTF8.GetBytes("""{"sub":"x","email":"tampered@example.com","exp":9999999999}"""));
        Assert.Equal("tampered@example.com", new TokenService().GetEmail($"{header}.{payload}.wrongsig"));
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private static UserEntity MakeUser(
        string email     = "jan@example.com",
        string firstName = "Jan",
        string lastName  = "de Vries",
        string userId    = "user-test-id") => new UserEntity
    {
        UserId    = userId,
        Email     = email,
        FirstName = firstName,
        LastName  = lastName,
        RowKey    = email.ToLowerInvariant(),
    };

    private static JsonElement DecodePayload(string token)
    {
        var parts  = token.Split('.');
        var padded = parts[1].Replace('-', '+').Replace('_', '/');
        padded = (padded.Length % 4) switch { 2 => padded + "==", 3 => padded + "=", _ => padded };
        var json = Encoding.UTF8.GetString(Convert.FromBase64String(padded));
        return JsonDocument.Parse(json).RootElement.Clone();
    }

    /// <summary>
    /// Crafts a correctly-signed JWT with user claims and a custom exp.
    /// Duplicates TokenService's private Base64Url + HMAC logic intentionally,
    /// so tests are independent of the production implementation.
    /// </summary>
    private static string CraftToken(string secret, long exp)
    {
        var payloadJson = $"{{\"sub\":\"test\",\"email\":\"craft@test.com\",\"firstName\":\"A\",\"lastName\":\"B\",\"exp\":{exp}}}";
        var header  = B64U(Encoding.UTF8.GetBytes("""{"alg":"HS256","typ":"JWT"}"""));
        var payload = B64U(Encoding.UTF8.GetBytes(payloadJson));
        var signing = $"{header}.{payload}";
        var sig     = B64U(HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(signing)));
        return $"{header}.{payload}.{sig}";
    }

    private static string B64U(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
