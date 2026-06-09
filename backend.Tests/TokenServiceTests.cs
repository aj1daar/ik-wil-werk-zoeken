using System.Security.Cryptography;
using System.Text;
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
        var token = new TokenService().CreateToken();
        Assert.NotNull(token);
        Assert.Equal(3, token.Split('.').Length);
    }

    [Fact]
    public void CreateToken_WhenSecretMissing_ReturnsNull()
    {
        Environment.SetEnvironmentVariable("JWT_SECRET", null);
        Assert.Null(new TokenService().CreateToken());
    }

    [Fact]
    public void CreateToken_WhenSecretIsWhitespace_ReturnsNull()
    {
        Environment.SetEnvironmentVariable("JWT_SECRET", "   ");
        Assert.Null(new TokenService().CreateToken());
    }

    [Fact]
    public void CreateToken_WhenSecretIsEmpty_ReturnsNull()
    {
        Environment.SetEnvironmentVariable("JWT_SECRET", "");
        Assert.Null(new TokenService().CreateToken());
    }

    [Fact]
    public void CreateToken_ProducedTokenIsImmediatelyValid()
    {
        var svc = new TokenService();
        Assert.True(svc.ValidateToken(svc.CreateToken()!));
    }

    // ── ValidateToken – basic happy path ────────────────────────────────────

    [Fact]
    public void ValidateToken_ValidToken_ReturnsTrue()
    {
        var svc = new TokenService();
        Assert.True(svc.ValidateToken(svc.CreateToken()!));
    }

    [Fact]
    public void ValidateToken_WithBearerPrefix_ReturnsTrue()
    {
        var svc = new TokenService();
        Assert.True(svc.ValidateToken($"Bearer {svc.CreateToken()!}"));
    }

    [Fact]
    public void ValidateToken_BearerCaseInsensitive_ReturnsTrue()
    {
        var svc = new TokenService();
        Assert.True(svc.ValidateToken($"bearer {svc.CreateToken()!}"));
    }

    [Fact]
    public void ValidateToken_BearerMixedCase_ReturnsTrue()
    {
        var svc = new TokenService();
        Assert.True(svc.ValidateToken($"BEARER {svc.CreateToken()!}"));
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
        var svc = new TokenService();
        var parts = svc.CreateToken()!.Split('.');
        // Injecting a newline into the payload breaks signature binding
        Assert.False(svc.ValidateToken($"{parts[0]}.{parts[1]}\n.{parts[2]}"));
    }

    // ── ValidateToken – tamper detection ────────────────────────────────────

    [Fact]
    public void ValidateToken_TamperedSignature_ReturnsFalse()
    {
        var svc = new TokenService();
        var parts = svc.CreateToken()!.Split('.');
        Assert.False(svc.ValidateToken($"{parts[0]}.{parts[1]}.invalidsignatureXXX"));
    }

    [Fact]
    public void ValidateToken_TamperedPayload_ReturnsFalse()
    {
        var svc = new TokenService();
        var parts = svc.CreateToken()!.Split('.');
        // Replace payload with different base64url content, keep original sig
        Assert.False(svc.ValidateToken($"{parts[0]}.dGFtcGVyZWQ.{parts[2]}"));
    }

    [Fact]
    public void ValidateToken_TamperedHeader_ReturnsFalse()
    {
        var svc = new TokenService();
        var parts = svc.CreateToken()!.Split('.');
        // Change the header — breaks the signature over header.payload
        Assert.False(svc.ValidateToken($"dGFtcGVyZWQ.{parts[1]}.{parts[2]}"));
    }

    // ── ValidateToken – secret missing / mismatch ────────────────────────────

    [Fact]
    public void ValidateToken_WhenSecretMissing_ReturnsFalse()
    {
        var svc = new TokenService();
        var token = svc.CreateToken()!;
        Environment.SetEnvironmentVariable("JWT_SECRET", null);
        Assert.False(svc.ValidateToken(token));
    }

    [Fact]
    public void ValidateToken_WhenSecretIsEmpty_ReturnsFalse()
    {
        var svc = new TokenService();
        var token = svc.CreateToken()!;
        Environment.SetEnvironmentVariable("JWT_SECRET", "");
        Assert.False(svc.ValidateToken(token));
    }

    [Fact]
    public void ValidateToken_TokenSignedWithDifferentSecret_ReturnsFalse()
    {
        var svc = new TokenService();
        var token = svc.CreateToken()!;
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

    // ── Helpers ──────────────────────────────────────────────────────────────

    /// <summary>
    /// Crafts a correctly-signed JWT with a custom exp claim.
    /// Duplicates TokenService's private Base64Url + HMAC logic intentionally,
    /// so tests are independent of the production implementation.
    /// </summary>
    private static string CraftToken(string secret, long exp)
    {
        var header  = B64U(Encoding.UTF8.GetBytes("""{"alg":"HS256","typ":"JWT"}"""));
        var payload = B64U(Encoding.UTF8.GetBytes($"{{\"exp\":{exp}}}"));
        var signing = $"{header}.{payload}";
        var sig     = B64U(HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(signing)));
        return $"{header}.{payload}.{sig}";
    }

    private static string B64U(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
