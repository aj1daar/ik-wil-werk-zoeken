using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using backend.Controllers;
using backend.Data;
using backend.Models;
using backend.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace backend.Tests;

/// <summary>
/// Signing in with Google: the credential check, and what the endpoint does with
/// a credential it believes.
///
/// Nothing here talks to Google. A key pair is made per test run, the JWKS
/// endpoint is answered from memory, and every token is minted locally, which is
/// the only way to write the cases that matter: a token for another application,
/// a token signed with the wrong algorithm, a token whose payload was edited
/// after signing.
/// </summary>
[Collection(JwtSecretCollection.Name)]
public sealed class GoogleSignInTests : IDisposable
{
    private const string ClientId = "1234567890-test.apps.googleusercontent.com";
    private const string Issuer   = "https://accounts.google.com";

    private readonly RSA _key    = RSA.Create(2048);
    private readonly RSA _other  = RSA.Create(2048);
    private readonly string _kid = "test-key-1";

    private readonly FakeHandler _handler;
    private readonly FixedTime _time = new(DateTimeOffset.Parse("2026-10-16T12:00:00Z"));
    private readonly string? _previousClientId;
    private readonly string? _previousSecret;

    private readonly SqliteConnection _conn;
    private readonly AppDbContext _db;

    public GoogleSignInTests()
    {
        _previousClientId = Environment.GetEnvironmentVariable("GOOGLE_CLIENT_ID");
        Environment.SetEnvironmentVariable("GOOGLE_CLIENT_ID", ClientId);

        // The endpoint issues one of our own sessions at the end, which needs a
        // signing secret like any other sign-in.
        _previousSecret = Environment.GetEnvironmentVariable("JWT_SECRET");
        Environment.SetEnvironmentVariable("JWT_SECRET", "test-secret-for-google-sign-in");

        _handler = new FakeHandler(() => Jwks(_kid, _key));

        _conn = new SqliteConnection("DataSource=:memory:");
        _conn.Open();
        _db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(_conn).Options);
        _db.Database.EnsureCreated();
    }

    public void Dispose()
    {
        Environment.SetEnvironmentVariable("GOOGLE_CLIENT_ID", _previousClientId);
        Environment.SetEnvironmentVariable("JWT_SECRET", _previousSecret);
        _db.Dispose();
        _conn.Dispose();
        _key.Dispose();
        _other.Dispose();
    }

    // ── the pieces under test ────────────────────────────────────────────────

    private GoogleIdentityService Service() =>
        new(new SingleClientFactory(_handler), NullLogger<GoogleIdentityService>.Instance, _time);

    private AuthController Controller(GoogleIdentityService? google = null, string ip = "203.0.113.10")
    {
        var controller = new AuthController(
            new TokenService(),
            new UserStore(_db),
            new EmailService(new SingleClientFactory(_handler), new TestEnvironment(), NullLogger<EmailService>.Instance),
            new RateLimiterService(),
            google ?? Service(),
            new MyDataExporter(_db));

        controller.ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() };
        controller.ControllerContext.HttpContext.Connection.RemoteIpAddress = IPAddress.Parse(ip);
        return controller;
    }

    // ── minting the tokens Google would send ─────────────────────────────────

    private static string Jwks(string kid, RSA key)
    {
        var p = key.ExportParameters(false);
        return JsonSerializer.Serialize(new
        {
            keys = new[]
            {
                new
                {
                    kid,
                    kty = "RSA",
                    alg = "RS256",
                    use = "sig",
                    n = Base64Url(p.Modulus!),
                    e = Base64Url(p.Exponent!),
                },
            },
        });
    }

    private string Token(
        string? sub = "google-subject-1",
        string? email = "someone@example.com",
        object? emailVerified = null,
        string? aud = ClientId,
        string? iss = Issuer,
        long? exp = null,
        long? iat = null,
        string alg = "RS256",
        string? kid = null,
        RSA? signWith = null,
        string? firstName = "Jan",
        string? lastName = "de Vries")
    {
        var now = _time.GetUtcNow().ToUnixTimeSeconds();
        var header = new Dictionary<string, object?> { ["alg"] = alg, ["typ"] = "JWT", ["kid"] = kid ?? _kid };
        var payload = new Dictionary<string, object?>
        {
            ["iss"] = iss,
            ["aud"] = aud,
            ["sub"] = sub,
            ["email"] = email,
            ["email_verified"] = emailVerified ?? true,
            ["given_name"] = firstName,
            ["family_name"] = lastName,
            ["exp"] = exp ?? now + 3600,
            ["iat"] = iat ?? now - 60,
        };
        foreach (var key in payload.Where(p => p.Value is null).Select(p => p.Key).ToList()) payload.Remove(key);
        foreach (var key in header.Where(p => p.Value is null).Select(p => p.Key).ToList()) header.Remove(key);

        var signingInput = $"{Base64Url(JsonSerializer.SerializeToUtf8Bytes(header))}." +
                           $"{Base64Url(JsonSerializer.SerializeToUtf8Bytes(payload))}";

        var signature = alg switch
        {
            "none" => Array.Empty<byte>(),
            // Algorithm confusion: the public key, used as an HMAC secret. A
            // verifier that trusts the header's alg would accept this.
            "HS256" => HMACSHA256.HashData(
                (signWith ?? _key).ExportParameters(false).Modulus!,
                Encoding.ASCII.GetBytes(signingInput)),
            _ => (signWith ?? _key).SignData(
                Encoding.ASCII.GetBytes(signingInput), HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1),
        };

        return $"{signingInput}.{Base64Url(signature)}";
    }

    private static string Base64Url(byte[] value) =>
        Convert.ToBase64String(value).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    // ── what a good credential gives us ──────────────────────────────────────

    [Fact]
    public async Task AcceptsAGoogleSignedToken()
    {
        var identity = await Service().VerifyAsync(Token());

        Assert.NotNull(identity);
        Assert.Equal("google-subject-1", identity!.Subject);
        Assert.Equal("someone@example.com", identity.Email);
        Assert.True(identity.EmailVerified);
        Assert.Equal("Jan", identity.FirstName);
        Assert.Equal("de Vries", identity.LastName);
    }

    [Fact]
    public async Task LowercasesAndTrimsTheAddress()
    {
        var identity = await Service().VerifyAsync(Token(email: "  Someone@Example.COM  "));
        Assert.Equal("someone@example.com", identity!.Email);
    }

    [Fact]
    public async Task AcceptsEmailVerifiedAsAString()
    {
        var identity = await Service().VerifyAsync(Token(emailVerified: "true"));
        Assert.True(identity!.EmailVerified);
    }

    [Fact]
    public async Task ReportsAnUnverifiedAddressAsUnverified()
    {
        var identity = await Service().VerifyAsync(Token(emailVerified: false));
        Assert.NotNull(identity);
        Assert.False(identity!.EmailVerified);
    }

    [Fact]
    public async Task AcceptsATokenWithNoNames()
    {
        var identity = await Service().VerifyAsync(Token(firstName: null, lastName: null));
        Assert.NotNull(identity);
        Assert.Equal(string.Empty, identity!.FirstName);
    }

    [Fact]
    public async Task AcceptsTheIssuerWithoutItsScheme()
    {
        Assert.NotNull(await Service().VerifyAsync(Token(iss: "accounts.google.com")));
    }

    // ── credentials that must not be believed ────────────────────────────────

    [Fact]
    public async Task RefusesATokenForAnotherApplication()
    {
        Assert.Null(await Service().VerifyAsync(Token(aud: "999-someone-else.apps.googleusercontent.com")));
    }

    [Fact]
    public async Task RefusesATokenFromAnotherIssuer()
    {
        Assert.Null(await Service().VerifyAsync(Token(iss: "https://accounts.evil.example")));
    }

    [Fact]
    public async Task RefusesATokenSignedByAnotherKey()
    {
        Assert.Null(await Service().VerifyAsync(Token(signWith: _other)));
    }

    [Fact]
    public async Task RefusesATokenSignedWithHmacUsingThePublicKey()
    {
        Assert.Null(await Service().VerifyAsync(Token(alg: "HS256")));
    }

    [Fact]
    public async Task RefusesAnUnsignedToken()
    {
        Assert.Null(await Service().VerifyAsync(Token(alg: "none")));
    }

    [Fact]
    public async Task RefusesATokenWhosePayloadWasEditedAfterSigning()
    {
        var parts = Token().Split('.');
        var payload = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(
            Convert.FromBase64String(Pad(parts[1])))!;
        payload["email"] = JsonSerializer.SerializeToElement("admin@example.com");
        var edited = Base64Url(JsonSerializer.SerializeToUtf8Bytes(payload));

        Assert.Null(await Service().VerifyAsync($"{parts[0]}.{edited}.{parts[2]}"));
    }

    [Fact]
    public async Task RefusesAnExpiredToken()
    {
        var expired = _time.GetUtcNow().ToUnixTimeSeconds() - 120;
        Assert.Null(await Service().VerifyAsync(Token(exp: expired)));
    }

    [Fact]
    public async Task AcceptsATokenThatExpiredWithinTheClockSkew()
    {
        var justExpired = _time.GetUtcNow().ToUnixTimeSeconds() - 30;
        Assert.NotNull(await Service().VerifyAsync(Token(exp: justExpired)));
    }

    [Fact]
    public async Task RefusesATokenIssuedInTheFuture()
    {
        var later = _time.GetUtcNow().ToUnixTimeSeconds() + 600;
        Assert.Null(await Service().VerifyAsync(Token(iat: later, exp: later + 3600)));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("not-a-token")]
    [InlineData("a.b")]
    [InlineData("a.b.c.d")]
    [InlineData("a.b.c")]
    [InlineData("...")]
    [InlineData("!!!.???.###")]
    public async Task RefusesRubbish(string? credential)
    {
        Assert.Null(await Service().VerifyAsync(credential));
    }

    [Fact]
    public async Task RefusesACredentialLongerThanAnyRealOne()
    {
        Assert.Null(await Service().VerifyAsync(new string('x', 8193)));
    }

    [Fact]
    public async Task RefusesATokenWithNoSubject()
    {
        Assert.Null(await Service().VerifyAsync(Token(sub: null)));
    }

    [Fact]
    public async Task RefusesATokenWithNoEmail()
    {
        Assert.Null(await Service().VerifyAsync(Token(email: null)));
    }

    [Fact]
    public async Task RefusesATokenWithNoExpiry()
    {
        Assert.Null(await Service().VerifyAsync(TokenWithout("exp")));
    }

    [Fact]
    public async Task RefusesEverythingWhenGoogleSignInIsNotConfigured()
    {
        Environment.SetEnvironmentVariable("GOOGLE_CLIENT_ID", null);
        Assert.Null(await Service().VerifyAsync(Token()));
        Assert.False(GoogleIdentityService.IsConfigured);
    }

    [Fact]
    public async Task RefusesWhenGooglesKeysCannotBeFetched()
    {
        _handler.Fail = true;
        Assert.Null(await Service().VerifyAsync(Token()));
    }

    // ── Google's keys ────────────────────────────────────────────────────────

    [Fact]
    public async Task FetchesTheKeysOnceForManyTokens()
    {
        var service = Service();
        for (var i = 0; i < 5; i++) Assert.NotNull(await service.VerifyAsync(Token()));
        Assert.Equal(1, _handler.Calls);
    }

    [Fact]
    public async Task FetchesAgainWhenGoogleRotatesItsKey()
    {
        var service = Service();
        Assert.NotNull(await service.VerifyAsync(Token()));

        using var rotated = RSA.Create(2048);
        _handler.Body = () => Jwks("test-key-2", rotated);
        _time.Advance(TimeSpan.FromMinutes(2));

        Assert.NotNull(await service.VerifyAsync(Token(kid: "test-key-2", signWith: rotated)));
        Assert.Equal(2, _handler.Calls);
    }

    [Fact]
    public async Task DoesNotRefetchForEveryUnknownKeyId()
    {
        var service = Service();
        Assert.NotNull(await service.VerifyAsync(Token()));

        for (var i = 0; i < 10; i++) Assert.Null(await service.VerifyAsync(Token(kid: $"made-up-{i}")));

        // One more fetch at most, however many invented key ids arrive.
        Assert.True(_handler.Calls <= 2, $"fetched {_handler.Calls} times");
    }

    [Fact]
    public async Task KeepsTheKeysItHasWhenGoogleAnswersWithNothing()
    {
        var service = Service();
        Assert.NotNull(await service.VerifyAsync(Token()));

        _handler.Body = () => "{\"keys\":[]}";
        _time.Advance(TimeSpan.FromHours(2));

        Assert.NotNull(await service.VerifyAsync(Token()));
    }

    // ── the endpoint ─────────────────────────────────────────────────────────

    [Fact]
    public async Task CreatingAnAccountNeedsConsentFirst()
    {
        var result = await Controller().Google(new GoogleAuthRequest { Credential = Token() });

        var body = Assert.IsType<GoogleAuthResponse>(Assert.IsType<OkObjectResult>(result).Value);
        Assert.True(body.NeedsConsent);
        Assert.Null(body.Token);
        Assert.Equal("someone@example.com", body.Email);
        Assert.Equal("Jan", body.FirstName);
        Assert.Empty(_db.Users);
    }

    [Fact]
    public async Task CreatesTheAccountOnceConsentIsGiven()
    {
        var result = await Controller().Google(new GoogleAuthRequest
        {
            Credential = Token(),
            GdprConsentAt = "2026-10-16T12:00:00.000Z",
            PrivacyVersion = PrivacyNotice.Version,
        });

        var body = Assert.IsType<GoogleAuthResponse>(Assert.IsType<OkObjectResult>(result).Value);
        Assert.False(body.NeedsConsent);
        Assert.NotNull(body.Token);

        var user = Assert.Single(_db.Users);
        Assert.Equal("someone@example.com", user.Email);
        Assert.Equal("google-subject-1", user.GoogleSubject);
        Assert.True(user.EmailVerified);
        Assert.Equal(string.Empty, user.PasswordHash);
        Assert.Equal("Jan", user.FirstName);
        Assert.Equal("de Vries", user.LastName);
    }

    [Fact]
    public async Task ANewAccountHasNoPasswordThatCanBeGuessed()
    {
        await Controller().Google(new GoogleAuthRequest
        {
            Credential = Token(),
            GdprConsentAt = "2026-10-16T12:00:00.000Z",
            PrivacyVersion = PrivacyNotice.Version,
        });

        var user = Assert.Single(_db.Users);
        Assert.False(PasswordHasher.Verify("", user.PasswordHash));
        Assert.False(PasswordHasher.Verify("password", user.PasswordHash));
    }

    [Fact]
    public async Task RefusesAConsentDateThatIsNotOne()
    {
        var result = await Controller().Google(new GoogleAuthRequest
        {
            Credential = Token(),
            GdprConsentAt = "whenever",
            PrivacyVersion = PrivacyNotice.Version,
        });

        Assert.Equal(400, Assert.IsType<ObjectResult>(result).StatusCode);
        Assert.Empty(_db.Users);
    }

    [Fact]
    public async Task SignsInAnAccountThatIsAlreadyLinked()
    {
        _db.Users.Add(new User
        {
            Email = "someone@example.com",
            FirstName = "Jan",
            LastName = "de Vries",
            PasswordHash = PasswordHasher.Hash("correct horse"),
            GoogleSubject = "google-subject-1",
            EmailVerified = true,
            GdprConsentAt = "2026-01-01T00:00:00.000Z",
        });
        await _db.SaveChangesAsync();

        var result = await Controller().Google(new GoogleAuthRequest { Credential = Token() });

        var body = Assert.IsType<GoogleAuthResponse>(Assert.IsType<OkObjectResult>(result).Value);
        Assert.NotNull(body.Token);
        Assert.Single(_db.Users);
    }

    [Fact]
    public async Task LinksAPasswordAccountWithTheSameAddress()
    {
        _db.Users.Add(new User
        {
            Email = "someone@example.com",
            FirstName = "Jan",
            LastName = "de Vries",
            PasswordHash = PasswordHasher.Hash("correct horse"),
            EmailVerified = true,
            GdprConsentAt = "2026-01-01T00:00:00.000Z",
        });
        await _db.SaveChangesAsync();

        var result = await Controller().Google(new GoogleAuthRequest { Credential = Token() });

        Assert.IsType<OkObjectResult>(result);
        var user = Assert.Single(_db.Users);
        Assert.Equal("google-subject-1", user.GoogleSubject);
        // The password it already had still works.
        Assert.True(PasswordHasher.Verify("correct horse", user.PasswordHash));
    }

    [Fact]
    public async Task LinkingAlsoVerifiesAnAddressThatWasWaitingOnAnEmail()
    {
        _db.Users.Add(new User
        {
            Email = "someone@example.com",
            FirstName = "Jan",
            LastName = "de Vries",
            PasswordHash = PasswordHasher.Hash("correct horse"),
            EmailVerified = false,
            GdprConsentAt = "2026-01-01T00:00:00.000Z",
        });
        await _db.SaveChangesAsync();

        Assert.IsType<OkObjectResult>(await Controller().Google(new GoogleAuthRequest { Credential = Token() }));
        Assert.True(Assert.Single(_db.Users).EmailVerified);
    }

    [Fact]
    public async Task FollowsTheGoogleAccountWhenItsAddressChanges()
    {
        _db.Users.Add(new User
        {
            Email = "old@example.com",
            FirstName = "Jan",
            LastName = "de Vries",
            GoogleSubject = "google-subject-1",
            EmailVerified = true,
            GdprConsentAt = "2026-01-01T00:00:00.000Z",
        });
        await _db.SaveChangesAsync();

        Assert.IsType<OkObjectResult>(await Controller().Google(
            new GoogleAuthRequest { Credential = Token(email: "new@example.com") }));

        // One account, not a second one for the new address.
        var user = Assert.Single(_db.Users);
        Assert.Equal("old@example.com", user.Email);
    }

    [Fact]
    public async Task RefusesAnUnverifiedGoogleAddress()
    {
        var result = await Controller().Google(new GoogleAuthRequest
        {
            Credential = Token(emailVerified: false),
            GdprConsentAt = "2026-10-16T12:00:00.000Z",
            PrivacyVersion = PrivacyNotice.Version,
        });

        Assert.Equal(403, Assert.IsType<ObjectResult>(result).StatusCode);
        Assert.Empty(_db.Users);
    }

    [Fact]
    public async Task RefusesACredentialItCannotVerify()
    {
        var result = await Controller().Google(new GoogleAuthRequest { Credential = Token(signWith: _other) });

        Assert.Equal(401, Assert.IsType<ObjectResult>(result).StatusCode);
        Assert.Empty(_db.Users);
    }

    [Fact]
    public async Task RefusesAnEmptyBody()
    {
        Assert.Equal(401, Assert.IsType<ObjectResult>(await Controller().Google(null)).StatusCode);
    }

    [Fact]
    public async Task SaysSoWhenGoogleSignInIsNotConfiguredHere()
    {
        Environment.SetEnvironmentVariable("GOOGLE_CLIENT_ID", null);
        var result = await Controller().Google(new GoogleAuthRequest { Credential = Token() });
        Assert.Equal(503, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task StopsAFloodOfAttemptsFromOneAddress()
    {
        var controller = Controller(ip: "203.0.113.99");
        for (var i = 0; i < 20; i++)
            await controller.Google(new GoogleAuthRequest { Credential = Token(signWith: _other) });

        var result = await controller.Google(new GoogleAuthRequest { Credential = Token() });
        Assert.Equal(429, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task TheAnswerCarriesNothingButTheSession()
    {
        var result = await Controller().Google(new GoogleAuthRequest
        {
            Credential = Token(),
            GdprConsentAt = "2026-10-16T12:00:00.000Z",
            PrivacyVersion = PrivacyNotice.Version,
        });

        var body = Assert.IsType<GoogleAuthResponse>(Assert.IsType<OkObjectResult>(result).Value);
        Assert.NotNull(body.Token);
        Assert.Null(body.Email);
        Assert.Null(body.FirstName);
        Assert.Null(body.LastName);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private string TokenWithout(string claim)
    {
        var parts = Token().Split('.');
        var payload = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(
            Convert.FromBase64String(Pad(parts[1])))!;
        payload.Remove(claim);
        var header = Convert.FromBase64String(Pad(parts[0]));
        var signingInput = $"{Base64Url(header)}.{Base64Url(JsonSerializer.SerializeToUtf8Bytes(payload))}";
        var signature = _key.SignData(Encoding.ASCII.GetBytes(signingInput), HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        return $"{signingInput}.{Base64Url(signature)}";
    }

    private static string Pad(string value)
    {
        var text = value.Replace('-', '+').Replace('_', '/');
        return text + new string('=', (4 - text.Length % 4) % 4);
    }

    private sealed class FakeHandler : HttpMessageHandler
    {
        public FakeHandler(Func<string> body) => Body = body;

        public Func<string> Body { get; set; }
        public bool Fail { get; set; }
        public int Calls { get; private set; }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Calls++;
            if (Fail) return Task.FromResult(new HttpResponseMessage(HttpStatusCode.ServiceUnavailable));
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(Body(), Encoding.UTF8, "application/json"),
            });
        }
    }

    private sealed class SingleClientFactory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, disposeHandler: false);
    }

    private sealed class FixedTime(DateTimeOffset start) : TimeProvider
    {
        private DateTimeOffset _now = start;
        public override DateTimeOffset GetUtcNow() => _now;
        public void Advance(TimeSpan by) => _now += by;
    }

    private sealed class TestEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Testing";
        public string ApplicationName { get; set; } = "backend.Tests";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } =
            new Microsoft.Extensions.FileProviders.NullFileProvider();
    }
}
