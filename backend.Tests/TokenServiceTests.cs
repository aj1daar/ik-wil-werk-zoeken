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

    // ── GetUserId ─────────────────────────────────────────────────────────────

    [Fact]
    public void GetUserId_ValidToken_ReturnsSub()
    {
        var svc   = new TokenService();
        var token = svc.CreateToken(MakeUser(userId: "uuid-001"))!;
        Assert.Equal("uuid-001", svc.GetUserId(token));
    }

    [Fact]
    public void GetUserId_BearerPrefixedToken_ReturnsSub()
    {
        var svc   = new TokenService();
        var token = $"Bearer {svc.CreateToken(MakeUser(userId: "uuid-bearer"))!}";
        Assert.Equal("uuid-bearer", svc.GetUserId(token));
    }

    [Fact]
    public void GetUserId_Null_ReturnsNull() =>
        Assert.Null(new TokenService().GetUserId(null));

    [Fact]
    public void GetUserId_Empty_ReturnsNull() =>
        Assert.Null(new TokenService().GetUserId(""));

    [Fact]
    public void GetUserId_OnePart_ReturnsNull() =>
        Assert.Null(new TokenService().GetUserId("notajwt"));

    [Fact]
    public void GetUserId_PayloadWithoutSubField_ReturnsNull()
    {
        var header  = B64U(Encoding.UTF8.GetBytes("""{"alg":"HS256","typ":"JWT"}"""));
        var payload = B64U(Encoding.UTF8.GetBytes("""{"email":"x@x.com","exp":9999999999}"""));
        Assert.Null(new TokenService().GetUserId($"{header}.{payload}.fakesig"));
    }

    [Fact]
    public void GetUserId_PayloadWithEmptySub_ReturnsNull()
    {
        var header  = B64U(Encoding.UTF8.GetBytes("""{"alg":"HS256","typ":"JWT"}"""));
        var payload = B64U(Encoding.UTF8.GetBytes("""{"sub":"","email":"x@x.com","exp":9999999999}"""));
        Assert.Null(new TokenService().GetUserId($"{header}.{payload}.fakesig"));
    }

    [Fact]
    public void GetUserId_DifferentUsers_ReturnCorrectIds()
    {
        var svc = new TokenService();
        var t1  = svc.CreateToken(MakeUser(userId: "id-aaa", email: "a@a.com"))!;
        var t2  = svc.CreateToken(MakeUser(userId: "id-bbb", email: "b@b.com"))!;
        Assert.Equal("id-aaa", svc.GetUserId(t1));
        Assert.Equal("id-bbb", svc.GetUserId(t2));
    }

    // ── CreateResetToken ─────────────────────────────────────────────────────

    [Fact]
    public void CreateResetToken_ReturnsThreePartToken()
    {
        var token = new TokenService().CreateResetToken("user-guid-123");
        Assert.Equal(3, token.Split('.').Length);
    }

    [Fact]
    public void CreateResetToken_ProducedTokenIsImmediatelyValid()
    {
        var svc   = new TokenService();
        var token = svc.CreateResetToken("user-guid-123");
        Assert.Equal("user-guid-123", svc.ValidateResetToken(token));
    }

    [Fact]
    public void CreateResetToken_DifferentUsers_ProduceDifferentTokens()
    {
        var svc = new TokenService();
        var t1  = svc.CreateResetToken("user-aaa");
        var t2  = svc.CreateResetToken("user-bbb");
        Assert.NotEqual(t1, t2);
    }

    [Fact]
    public void CreateResetToken_ExpEmbeddedInToken_IsOneHourAhead()
    {
        var now   = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var token = new TokenService().CreateResetToken("some-user");
        var exp   = long.Parse(token.Split('.')[1]);
        Assert.InRange(exp, now + 3590, now + 3610); // within 10 s of exactly 1 hour
    }

    // ── ValidateResetToken ───────────────────────────────────────────────────

    [Fact]
    public void ValidateResetToken_ValidToken_ReturnsUserId()
    {
        var svc   = new TokenService();
        var token = svc.CreateResetToken("my-user-id");
        Assert.Equal("my-user-id", svc.ValidateResetToken(token));
    }

    [Fact]
    public void ValidateResetToken_Null_ReturnsNull() =>
        Assert.Null(new TokenService().ValidateResetToken(null));

    [Fact]
    public void ValidateResetToken_Empty_ReturnsNull() =>
        Assert.Null(new TokenService().ValidateResetToken(""));

    [Fact]
    public void ValidateResetToken_Whitespace_ReturnsNull() =>
        Assert.Null(new TokenService().ValidateResetToken("   "));

    [Fact]
    public void ValidateResetToken_WrongPartCount_ReturnsNull()
    {
        Assert.Null(new TokenService().ValidateResetToken("only.two"));
        Assert.Null(new TokenService().ValidateResetToken("a"));
        Assert.Null(new TokenService().ValidateResetToken("too.many.parts.here"));
    }

    [Fact]
    public void ValidateResetToken_TamperedSignature_ReturnsNull()
    {
        var svc   = new TokenService();
        var parts = svc.CreateResetToken("user-xyz").Split('.');
        Assert.Null(svc.ValidateResetToken($"{parts[0]}.{parts[1]}.INVALIDSIGXXXXXX"));
    }

    [Fact]
    public void ValidateResetToken_TamperedUserId_ReturnsNull()
    {
        var svc   = new TokenService();
        var parts = svc.CreateResetToken("real-user").Split('.');
        // Swap in a different userId — sig was computed over "real-user.exp"
        Assert.Null(svc.ValidateResetToken($"attacker-user.{parts[1]}.{parts[2]}"));
    }

    [Fact]
    public void ValidateResetToken_ExpiredToken_ReturnsNull()
    {
        var svc   = new TokenService();
        var token = CraftResetToken(Secret, "user-x", DateTimeOffset.UtcNow.AddSeconds(-1).ToUnixTimeSeconds());
        Assert.Null(svc.ValidateResetToken(token));
    }

    [Fact]
    public void ValidateResetToken_ExpiresExactlyNow_ReturnsNull()
    {
        var token = CraftResetToken(Secret, "user-x", DateTimeOffset.UtcNow.ToUnixTimeSeconds());
        Assert.Null(new TokenService().ValidateResetToken(token));
    }

    [Fact]
    public void ValidateResetToken_FutureExp_ReturnsUserId()
    {
        var token = CraftResetToken(Secret, "user-future", DateTimeOffset.UtcNow.AddHours(1).ToUnixTimeSeconds());
        Assert.Equal("user-future", new TokenService().ValidateResetToken(token));
    }

    [Fact]
    public void ValidateResetToken_WhenSecretMismatches_ReturnsNull()
    {
        var token = new TokenService().CreateResetToken("user-x");
        Environment.SetEnvironmentVariable("JWT_SECRET", "a-completely-different-secret-here!!");
        Assert.Null(new TokenService().ValidateResetToken(token));
    }

    [Fact]
    public void ValidateResetToken_NonNumericExp_ReturnsNull()
    {
        var svc = new TokenService();
        // Build a token where the middle segment is not a number
        var sig = B64U(HMACSHA256.HashData(
            Encoding.UTF8.GetBytes(Secret),
            Encoding.UTF8.GetBytes("user-x.notanumber")));
        Assert.Null(svc.ValidateResetToken($"user-x.notanumber.{sig}"));
    }

    // ── CreateEmailChangeToken ───────────────────────────────────────────────

    [Fact]
    public void CreateEmailChangeToken_ReturnsFourPartToken()
    {
        var token = new TokenService().CreateEmailChangeToken("user-1", "new@example.nl");
        Assert.Equal(4, token.Split('.').Length);
    }

    [Fact]
    public void CreateEmailChangeToken_ProducedTokenIsImmediatelyValid()
    {
        var svc   = new TokenService();
        var token = svc.CreateEmailChangeToken("user-1", "new@example.nl");
        var result = svc.ValidateEmailChangeToken(token);
        Assert.NotNull(result);
        Assert.Equal("user-1",          result!.Value.UserId);
        Assert.Equal("new@example.nl",  result!.Value.NewEmail);
    }

    [Fact]
    public void CreateEmailChangeToken_EmailWithDots_RoundTripsCorrectly()
    {
        var svc   = new TokenService();
        var email = "first.last+tag@sub.domain.example.com";
        var token = svc.CreateEmailChangeToken("uid", email);
        var result = svc.ValidateEmailChangeToken(token);
        Assert.NotNull(result);
        Assert.Equal(email, result!.Value.NewEmail);
    }

    [Fact]
    public void CreateEmailChangeToken_DifferentEmails_ProduceDifferentTokens()
    {
        var svc = new TokenService();
        var t1  = svc.CreateEmailChangeToken("user-1", "a@example.com");
        var t2  = svc.CreateEmailChangeToken("user-1", "b@example.com");
        Assert.NotEqual(t1, t2);
    }

    [Fact]
    public void CreateEmailChangeToken_DifferentUsers_ProduceDifferentTokens()
    {
        var svc = new TokenService();
        var t1  = svc.CreateEmailChangeToken("user-aaa", "same@example.com");
        var t2  = svc.CreateEmailChangeToken("user-bbb", "same@example.com");
        Assert.NotEqual(t1, t2);
    }

    [Fact]
    public void CreateEmailChangeToken_ExpIsApproximately24HoursAhead()
    {
        var now   = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var token = new TokenService().CreateEmailChangeToken("uid", "x@x.nl");
        var exp   = long.Parse(token.Split('.')[2]);
        Assert.InRange(exp, now + 86390, now + 86410); // within 10 s of 24 h
    }

    // ── ValidateEmailChangeToken ─────────────────────────────────────────────

    [Fact]
    public void ValidateEmailChangeToken_ValidToken_ReturnsUserIdAndEmail()
    {
        var svc    = new TokenService();
        var token  = svc.CreateEmailChangeToken("uid-xyz", "updated@test.nl");
        var result = svc.ValidateEmailChangeToken(token);
        Assert.NotNull(result);
        Assert.Equal("uid-xyz",       result!.Value.UserId);
        Assert.Equal("updated@test.nl", result!.Value.NewEmail);
    }

    [Fact]
    public void ValidateEmailChangeToken_Null_ReturnsNull() =>
        Assert.Null(new TokenService().ValidateEmailChangeToken(null));

    [Fact]
    public void ValidateEmailChangeToken_Empty_ReturnsNull() =>
        Assert.Null(new TokenService().ValidateEmailChangeToken(""));

    [Fact]
    public void ValidateEmailChangeToken_Whitespace_ReturnsNull() =>
        Assert.Null(new TokenService().ValidateEmailChangeToken("   "));

    [Fact]
    public void ValidateEmailChangeToken_WrongPartCount_ReturnsNull()
    {
        Assert.Null(new TokenService().ValidateEmailChangeToken("only.three.parts"));
        Assert.Null(new TokenService().ValidateEmailChangeToken("a.b"));
        Assert.Null(new TokenService().ValidateEmailChangeToken("five.parts.not.valid.here"));
    }

    [Fact]
    public void ValidateEmailChangeToken_TamperedSignature_ReturnsNull()
    {
        var svc   = new TokenService();
        var parts = svc.CreateEmailChangeToken("uid", "e@x.nl").Split('.');
        Assert.Null(svc.ValidateEmailChangeToken($"{parts[0]}.{parts[1]}.{parts[2]}.INVALIDSIGXXX"));
    }

    [Fact]
    public void ValidateEmailChangeToken_TamperedUserId_ReturnsNull()
    {
        var svc   = new TokenService();
        var parts = svc.CreateEmailChangeToken("real-uid", "e@x.nl").Split('.');
        Assert.Null(svc.ValidateEmailChangeToken($"attacker.{parts[1]}.{parts[2]}.{parts[3]}"));
    }

    [Fact]
    public void ValidateEmailChangeToken_TamperedEmail_ReturnsNull()
    {
        var svc          = new TokenService();
        var parts        = svc.CreateEmailChangeToken("uid", "legit@x.nl").Split('.');
        var altEmail     = B64U(Encoding.UTF8.GetBytes("attacker@evil.com"));
        Assert.Null(svc.ValidateEmailChangeToken($"{parts[0]}.{altEmail}.{parts[2]}.{parts[3]}"));
    }

    [Fact]
    public void ValidateEmailChangeToken_ExpiredToken_ReturnsNull()
    {
        var token = CraftEmailChangeToken(Secret, "uid", "e@x.nl",
            DateTimeOffset.UtcNow.AddSeconds(-1).ToUnixTimeSeconds());
        Assert.Null(new TokenService().ValidateEmailChangeToken(token));
    }

    [Fact]
    public void ValidateEmailChangeToken_ExpiresExactlyNow_ReturnsNull()
    {
        var token = CraftEmailChangeToken(Secret, "uid", "e@x.nl",
            DateTimeOffset.UtcNow.ToUnixTimeSeconds());
        Assert.Null(new TokenService().ValidateEmailChangeToken(token));
    }

    [Fact]
    public void ValidateEmailChangeToken_FutureExp_ReturnsResult()
    {
        var token = CraftEmailChangeToken(Secret, "uid", "e@x.nl",
            DateTimeOffset.UtcNow.AddHours(24).ToUnixTimeSeconds());
        Assert.NotNull(new TokenService().ValidateEmailChangeToken(token));
    }

    [Fact]
    public void ValidateEmailChangeToken_WrongSecret_ReturnsNull()
    {
        var token = new TokenService().CreateEmailChangeToken("uid", "e@x.nl");
        Environment.SetEnvironmentVariable("JWT_SECRET", "totally-different-secret-XXXXX!!");
        Assert.Null(new TokenService().ValidateEmailChangeToken(token));
    }

    [Fact]
    public void ValidateEmailChangeToken_CannotBeUsedAsResetToken()
    {
        // Cross-use attack: email-change token must not validate as a reset token
        var svc   = new TokenService();
        var token = svc.CreateEmailChangeToken("uid", "e@x.nl");
        // ValidateResetToken expects 3 parts; email-change has 4 → must fail
        Assert.Null(svc.ValidateResetToken(token));
    }

    [Fact]
    public void ValidateEmailChangeToken_CannotBeUsedAsVerificationToken()
    {
        var svc   = new TokenService();
        var token = svc.CreateEmailChangeToken("uid", "e@x.nl");
        Assert.Null(svc.ValidateVerificationToken(token));
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private static User MakeUser(
        string email     = "jan@example.com",
        string firstName = "Jan",
        string lastName  = "de Vries",
        string userId    = "user-test-id") => new User
    {
        UserId    = userId,
        Email     = email,
        FirstName = firstName,
        LastName  = lastName,
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

    /// <summary>Crafts a correctly-signed reset token with a custom exp.</summary>
    private static string CraftResetToken(string secret, string userId, long exp)
    {
        var data = $"reset.{userId}.{exp}";
        var sig  = B64U(HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(data)));
        return $"{userId}.{exp}.{sig}";
    }

    /// <summary>Crafts a correctly-signed email-change token with a custom exp.</summary>
    private static string CraftEmailChangeToken(string secret, string userId, string newEmail, long exp)
    {
        var encodedEmail = B64U(Encoding.UTF8.GetBytes(newEmail));
        var data         = $"email-change.{userId}.{newEmail}.{exp}";
        var sig          = B64U(HMACSHA256.HashData(
            Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(data)));
        return $"{userId}.{encodedEmail}.{exp}.{sig}";
    }

    private static string B64U(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
