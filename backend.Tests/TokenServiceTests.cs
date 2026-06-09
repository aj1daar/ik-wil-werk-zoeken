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
    public void ValidateToken_ValidToken_ReturnsTrue()
    {
        var svc = new TokenService();
        var token = svc.CreateToken()!;
        Assert.True(svc.ValidateToken(token));
    }

    [Fact]
    public void ValidateToken_WithBearerPrefix_ReturnsTrue()
    {
        var svc = new TokenService();
        var token = svc.CreateToken()!;
        Assert.True(svc.ValidateToken($"Bearer {token}"));
    }

    [Fact]
    public void ValidateToken_BearerCaseInsensitive_ReturnsTrue()
    {
        var svc = new TokenService();
        var token = svc.CreateToken()!;
        Assert.True(svc.ValidateToken($"bearer {token}"));
    }

    [Fact]
    public void ValidateToken_Null_ReturnsFalse() =>
        Assert.False(new TokenService().ValidateToken(null));

    [Fact]
    public void ValidateToken_Empty_ReturnsFalse() =>
        Assert.False(new TokenService().ValidateToken(""));

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
        // Replace payload with a different base64url string, keeping header and original sig
        Assert.False(svc.ValidateToken($"{parts[0]}.dGFtcGVyZWQ.{parts[2]}"));
    }

    [Fact]
    public void ValidateToken_WrongNumberOfParts_ReturnsFalse()
    {
        Assert.False(new TokenService().ValidateToken("only.two"));
        Assert.False(new TokenService().ValidateToken("too.many.parts.here"));
    }

    [Fact]
    public void ValidateToken_WhenSecretMissing_ReturnsFalse()
    {
        var svc = new TokenService();
        var token = svc.CreateToken()!;
        Environment.SetEnvironmentVariable("JWT_SECRET", null);
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
}
