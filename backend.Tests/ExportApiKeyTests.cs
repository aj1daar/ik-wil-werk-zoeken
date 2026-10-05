using System.Security.Cryptography;
using System.Text;
using backend.Controllers;
using backend.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Abstractions;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace backend.Tests;

/// <summary>
/// The X-Api-Key check in front of /api/export. The export is the whole sponsor
/// register in one response, so these tests care about two things: that only a
/// configured key gets through, and that nothing about the key leaks back out.
/// </summary>
public sealed class ExportApiKeyTests
{
    private static string HashOf(string key) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(key))).ToLowerInvariant();

    private const string Key = "r4nd0m-key-value-that-stands-in-for-32-bytes";
    private const string OtherKey = "another-key-entirely";

    private static AuthorizationFilterContext Run(
        string? configured, string? header, RateLimiterService? limiter = null, string? headerName = null)
    {
        var http = new DefaultHttpContext();
        if (header is not null) http.Request.Headers[headerName ?? ExportApiKeyFilter.HeaderName] = header;

        var context = new AuthorizationFilterContext(
            new ActionContext(http, new RouteData(), new ActionDescriptor()),
            []);

        new ExportApiKeyFilter(
            new ExportApiKeyService(configured),
            limiter ?? new RateLimiterService(),
            NullLogger<ExportApiKeyFilter>.Instance).OnAuthorization(context);

        return context;
    }

    // A refusal is an EmptyResult plus a status on the response, so that
    // [ApiController] cannot dress it up as a problem+json document.
    private static int? StatusOf(AuthorizationFilterContext context) =>
        context.Result is EmptyResult ? context.HttpContext.Response.StatusCode : null;

    // ── who gets in ──────────────────────────────────────────────────────────

    [Fact]
    public void LetsAValidKeyThrough()
    {
        var context = Run($"pipeline={HashOf(Key)}", Key);

        Assert.Null(context.Result);
        Assert.Equal("pipeline", context.HttpContext.Items[ExportApiKeyFilter.KeyNameItem]);
    }

    [Fact]
    public void RefusesARequestWithNoKeyAtAll()
    {
        Assert.Equal(401, StatusOf(Run($"pipeline={HashOf(Key)}", null)));
    }

    [Fact]
    public void RefusesTheWrongKey()
    {
        Assert.Equal(401, StatusOf(Run($"pipeline={HashOf(Key)}", OtherKey)));
    }

    [Fact]
    public void RefusesAnEmptyHeader()
    {
        Assert.Equal(401, StatusOf(Run($"pipeline={HashOf(Key)}", "")));
    }

    [Fact]
    public void RefusesTheHashItselfAsAKey()
    {
        // Whoever reads the server's configuration holds hashes, not keys, and a
        // hash presented as a key must be worth nothing.
        Assert.Equal(401, StatusOf(Run($"pipeline={HashOf(Key)}", HashOf(Key))));
    }

    [Fact]
    public void RefusesAValidUserBearerTokenAsIfItWereNothing()
    {
        // A signed-in user must not be able to pull the export with the token that
        // works everywhere else in the API.
        var context = Run($"pipeline={HashOf(Key)}", null);
        context.HttpContext.Request.Headers.Authorization = "Bearer header.payload.signature";

        Assert.Equal(401, StatusOf(Run($"pipeline={HashOf(Key)}", "Bearer header.payload.signature")));
        Assert.Equal(401, StatusOf(context));
    }

    [Fact]
    public void DoesNotAcceptTheKeyInTheAuthorizationHeader()
    {
        // One place to send it. Accepting several would mean several code paths
        // to keep in step.
        Assert.Equal(401, StatusOf(Run($"pipeline={HashOf(Key)}", Key, headerName: "Authorization")));
    }

    [Fact]
    public void FailsClosedWhenNoKeysAreConfigured()
    {
        Assert.Equal(401, StatusOf(Run(null, Key)));
        Assert.Equal(401, StatusOf(Run("", Key)));
    }

    [Fact]
    public void SaysNothingBeyondTheStatusCode()
    {
        var context = Run($"pipeline={HashOf(Key)}", OtherKey);

        // EmptyResult, not StatusCodeResult: the latter is turned into a
        // problem+json body carrying a title and a traceId by the [ApiController]
        // convention, and a caller probing for keys is told nothing at all.
        Assert.IsType<EmptyResult>(context.Result);
        Assert.Equal(401, context.HttpContext.Response.StatusCode);
        Assert.Equal(0, context.HttpContext.Response.ContentLength ?? 0);
    }

    // ── rotation ─────────────────────────────────────────────────────────────

    [Fact]
    public void AcceptsEitherKeyDuringARotation()
    {
        var configured = $"pipeline={HashOf(Key)},pipeline-next={HashOf(OtherKey)}";

        Assert.Equal("pipeline", Run(configured, Key).HttpContext.Items[ExportApiKeyFilter.KeyNameItem]);
        Assert.Equal("pipeline-next", Run(configured, OtherKey).HttpContext.Items[ExportApiKeyFilter.KeyNameItem]);
    }

    [Fact]
    public void IgnoresAnEntryItCannotRead()
    {
        // A typo in one entry must not take the others down with it, and must not
        // turn into an entry that matches something.
        var configured = $"broken,=nohash,noname=,short=abc,pipeline={HashOf(Key)}";
        var service = new ExportApiKeyService(configured);

        Assert.Equal(1, service.KeyCount);
        Assert.Equal(["pipeline"], service.KeyNames);
        Assert.Equal("pipeline", service.Match(Key));
    }

    [Fact]
    public void ToleratesSpacesAroundEntries()
    {
        var service = new ExportApiKeyService($" pipeline = {HashOf(Key)} , ci = {HashOf(OtherKey)} ");
        Assert.Equal("pipeline", service.Match(Key));
        Assert.Equal("ci", service.Match(OtherKey));
    }

    [Fact]
    public void IgnoresAHashThatIsNotHex()
    {
        var service = new ExportApiKeyService($"pipeline={new string('z', 64)}");
        Assert.False(service.IsConfigured);
    }

    [Fact]
    public void TreatsTheHashAsCaseInsensitiveHex()
    {
        var service = new ExportApiKeyService($"pipeline={HashOf(Key).ToUpperInvariant()}");
        Assert.Equal("pipeline", service.Match(Key));
    }

    // ── rate limit ───────────────────────────────────────────────────────────

    [Fact]
    public void RateLimitsAKeyAfterThirtyRequestsInTheWindow()
    {
        var configured = $"pipeline={HashOf(Key)}";
        var limiter = new RateLimiterService();

        for (var i = 0; i < 30; i++)
            Assert.Null(Run(configured, Key, limiter).Result);

        var blocked = Run(configured, Key, limiter);
        Assert.Equal(429, StatusOf(blocked));
        Assert.Equal("3600", blocked.HttpContext.Response.Headers.RetryAfter);
    }

    [Fact]
    public void CountsEachKeySeparately()
    {
        // One caller exhausting its limit must not lock the others out.
        var configured = $"pipeline={HashOf(Key)},ci={HashOf(OtherKey)}";
        var limiter = new RateLimiterService();

        for (var i = 0; i < 30; i++) Run(configured, Key, limiter);

        Assert.Equal(429, StatusOf(Run(configured, Key, limiter)));
        Assert.Null(Run(configured, OtherKey, limiter).Result);
    }

    [Fact]
    public void DoesNotSpendTheRateLimitOnRejectedRequests()
    {
        // Otherwise anyone could exhaust the real caller's budget with junk keys.
        var configured = $"pipeline={HashOf(Key)}";
        var limiter = new RateLimiterService();

        for (var i = 0; i < 50; i++) Run(configured, OtherKey, limiter);

        Assert.Null(Run(configured, Key, limiter).Result);
    }

    // ── generated keys ───────────────────────────────────────────────────────

    [Fact]
    public void GeneratesAKeyThatItsOwnHashAccepts()
    {
        var (key, hash) = ExportApiKeyService.GenerateKey();
        Assert.Equal("pipeline", new ExportApiKeyService($"pipeline={hash}").Match(key));
    }

    [Fact]
    public void GeneratesKeysThatAreUrlSafeAndLongEnough()
    {
        var (key, hash) = ExportApiKeyService.GenerateKey();

        // 32 bytes in base64url with the padding stripped.
        Assert.Equal(43, key.Length);
        Assert.DoesNotContain('+', key);
        Assert.DoesNotContain('/', key);
        Assert.DoesNotContain('=', key);
        Assert.Equal(64, hash.Length);
        Assert.Matches("^[0-9a-f]{64}$", hash);
    }

    [Fact]
    public void GeneratesADifferentKeyEveryTime()
    {
        var keys = Enumerable.Range(0, 50).Select(_ => ExportApiKeyService.GenerateKey().Key).ToHashSet();
        Assert.Equal(50, keys.Count);
    }

    [Fact]
    public void NeverStoresTheKeyItself()
    {
        // The service holds hashes. Nothing it exposes can give a key back.
        var (key, hash) = ExportApiKeyService.GenerateKey();
        var service = new ExportApiKeyService($"pipeline={hash}");

        Assert.DoesNotContain(key, string.Join(" ", service.KeyNames));
        Assert.Equal("pipeline", service.Match(key));
        Assert.Null(service.Match(key + "x"));
    }
}
