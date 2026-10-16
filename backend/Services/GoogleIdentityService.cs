using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using backend.Models;

namespace backend.Services;

/// <summary>
/// Checks the ID token a Google sign-in button hands the page.
///
/// The token is a JWT signed by Google with RS256. Verifying it means fetching
/// Google's public keys, checking the signature with the key the header names,
/// and then checking the claims: who issued it, who it was issued for, and
/// whether it is still inside its own lifetime. Anything less and a token minted
/// for somebody else's application would sign a person in here.
///
/// Written against RSA and JSON directly rather than pulling in a library: it is
/// one signature algorithm and five claims, and the framework has both.
/// </summary>
public sealed class GoogleIdentityService
{
    private const string CertsUrl = "https://www.googleapis.com/oauth2/v3/certs";

    // Google documents both spellings, and tokens in the wild carry either.
    private static readonly string[] Issuers = ["https://accounts.google.com", "accounts.google.com"];

    // Clocks drift. A minute either way is the usual allowance, and it is small
    // enough that an expired token stays expired in any way that matters.
    private static readonly TimeSpan Skew = TimeSpan.FromMinutes(1);

    private readonly IHttpClientFactory _http;
    private readonly ILogger<GoogleIdentityService> _log;
    private readonly TimeProvider _time;

    // Google rotates these keys. Cached for an hour rather than per request, and
    // refetched once when a token names a key we have not seen, which is what a
    // rotation looks like from here.
    private readonly SemaphoreSlim _lock = new(1, 1);
    private Dictionary<string, RSAParameters> _keys = [];
    private DateTimeOffset _keysFetchedAt = DateTimeOffset.MinValue;
    private DateTimeOffset _lastFetchAttempt = DateTimeOffset.MinValue;
    private static readonly TimeSpan KeyLifetime = TimeSpan.FromHours(1);
    // Unknown key ids are what a rotation looks like, but they are also free for
    // anyone to invent. One refetch per minute at most, so a stream of made-up
    // key ids cannot turn into a stream of requests to Google.
    private static readonly TimeSpan RefetchInterval = TimeSpan.FromMinutes(1);

    public GoogleIdentityService(
        IHttpClientFactory http,
        ILogger<GoogleIdentityService> log,
        TimeProvider? time = null)
    {
        _http = http;
        _log  = log;
        _time = time ?? TimeProvider.System;
    }

    /// <summary>The client id this deployment accepts tokens for, or null when Google sign-in is not configured.</summary>
    public static string? ClientId
    {
        get
        {
            var value = Environment.GetEnvironmentVariable("GOOGLE_CLIENT_ID");
            return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
        }
    }

    public static bool IsConfigured => ClientId is not null;

    /// <summary>
    /// The person behind a credential, or null if the credential is not one we
    /// can trust. The reason is logged, never returned: a caller that learns why
    /// its forgery failed learns how to make a better one.
    /// </summary>
    public async Task<GoogleIdentity?> VerifyAsync(string? credential, CancellationToken ct = default)
    {
        var clientId = ClientId;
        if (clientId is null) return null;
        if (string.IsNullOrWhiteSpace(credential)) return null;
        // Google ID tokens are well under this. The limit is here so a megabyte
        // of base64 is rejected before any of it is parsed.
        if (credential.Length > 8192) return Reject("the credential is too long");

        var parts = credential.Split('.');
        if (parts.Length != 3) return Reject("the credential is not a JWT");

        JsonElement header, payload;
        try
        {
            header  = Parse(parts[0]);
            payload = Parse(parts[1]);
        }
        catch (Exception)
        {
            return Reject("the credential is not readable");
        }

        if (Text(header, "alg") != "RS256") return Reject("the credential is not signed with RS256");
        var kid = Text(header, "kid");
        if (string.IsNullOrEmpty(kid)) return Reject("the credential names no signing key");

        byte[] signature;
        try { signature = Base64UrlDecode(parts[2]); }
        catch (Exception) { return Reject("the signature is not readable"); }

        var signed = Encoding.ASCII.GetBytes($"{parts[0]}.{parts[1]}");
        if (!await SignatureIsGoogles(kid, signed, signature, ct))
            return Reject("the signature does not match any Google key");

        // Only now, with the signature proven, is anything inside worth reading.
        if (!Issuers.Contains(Text(payload, "iss"))) return Reject("the issuer is not Google");
        if (Text(payload, "aud") != clientId) return Reject("the credential was issued for another application");

        var now = _time.GetUtcNow();
        var expires = Number(payload, "exp");
        if (expires is null) return Reject("the credential has no expiry");
        if (DateTimeOffset.FromUnixTimeSeconds(expires.Value) + Skew <= now) return Reject("the credential has expired");

        var issuedAt = Number(payload, "iat");
        if (issuedAt is null) return Reject("the credential has no issue time");
        if (DateTimeOffset.FromUnixTimeSeconds(issuedAt.Value) - Skew > now) return Reject("the credential is issued in the future");

        var subject = Text(payload, "sub");
        if (string.IsNullOrEmpty(subject)) return Reject("the credential names no account");

        var email = Text(payload, "email");
        if (string.IsNullOrEmpty(email)) return Reject("the credential carries no email address");

        return new GoogleIdentity
        {
            Subject       = subject,
            Email         = email.Trim().ToLowerInvariant(),
            EmailVerified = Bool(payload, "email_verified"),
            FirstName     = Text(payload, "given_name")  ?? string.Empty,
            LastName      = Text(payload, "family_name") ?? string.Empty,
        };
    }

    private GoogleIdentity? Reject(string why)
    {
        // The credential itself is never logged: it is a bearer credential for as
        // long as it lives.
        _log.LogWarning("Rejected a Google credential: {Reason}", why);
        return null;
    }

    private async Task<bool> SignatureIsGoogles(string kid, byte[] signed, byte[] signature, CancellationToken ct)
    {
        var key = await KeyAsync(kid, ct);
        if (key is null) return false;

        using var rsa = RSA.Create();
        rsa.ImportParameters(key.Value);
        return rsa.VerifyData(signed, signature, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
    }

    private async Task<RSAParameters?> KeyAsync(string kid, CancellationToken ct)
    {
        var fresh = _time.GetUtcNow() - _keysFetchedAt <= KeyLifetime;
        if (fresh && _keys.TryGetValue(kid, out var cached)) return cached;

        await _lock.WaitAsync(ct);
        try
        {
            var now = _time.GetUtcNow();
            fresh = now - _keysFetchedAt <= KeyLifetime;
            if (fresh && _keys.TryGetValue(kid, out cached)) return cached;
            if (now - _lastFetchAttempt >= RefetchInterval)
            {
                _lastFetchAttempt = now;
                await FetchKeysAsync(ct);
            }
        }
        finally
        {
            _lock.Release();
        }

        return _keys.TryGetValue(kid, out var fetched) ? fetched : null;
    }

    private async Task FetchKeysAsync(CancellationToken ct)
    {
        try
        {
            var client   = _http.CreateClient("google");
            var response = await client.GetAsync(CertsUrl, ct);
            if (!response.IsSuccessStatusCode)
            {
                _log.LogWarning("Could not fetch Google signing keys: {Status}", (int)response.StatusCode);
                return;
            }

            var body = await response.Content.ReadAsStringAsync(ct);
            var set  = JsonSerializer.Deserialize(body, AppJsonSerializerContext.Default.GoogleKeySet);

            var keys = new Dictionary<string, RSAParameters>();
            foreach (var key in set?.Keys ?? [])
            {
                if (key.Kid is null || key.N is null || key.E is null) continue;
                if (key.Kty != "RSA" || (key.Alg is not null && key.Alg != "RS256")) continue;
                try
                {
                    keys[key.Kid] = new RSAParameters
                    {
                        Modulus  = Base64UrlDecode(key.N),
                        Exponent = Base64UrlDecode(key.E),
                    };
                }
                catch (FormatException)
                {
                    // One unreadable key is not a reason to drop the rest.
                }
            }

            // An empty answer leaves the old keys in place: better a stale key
            // that still verifies than none at all while Google has a bad minute.
            if (keys.Count == 0) return;

            _keys = keys;
            _keysFetchedAt = _time.GetUtcNow();
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException or JsonException)
        {
            _log.LogWarning(e, "Could not fetch Google signing keys");
        }
    }

    private static JsonElement Parse(string segment) =>
        JsonDocument.Parse(Base64UrlDecode(segment)).RootElement;

    private static string? Text(JsonElement element, string name) =>
        element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;

    private static long? Number(JsonElement element, string name) =>
        element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.Number
            && value.TryGetInt64(out var number)
            ? number
            : null;

    // Google sends email_verified as a boolean, and has historically sent it as
    // the string "true" as well.
    private static bool Bool(JsonElement element, string name)
    {
        if (!element.TryGetProperty(name, out var value)) return false;
        return value.ValueKind switch
        {
            JsonValueKind.True   => true,
            JsonValueKind.String => value.GetString() == "true",
            _                    => false,
        };
    }

    private static byte[] Base64UrlDecode(string value)
    {
        var padded = value.Replace('-', '+').Replace('_', '/');
        padded += (padded.Length % 4) switch { 2 => "==", 3 => "=", 0 => "", _ => throw new FormatException("bad base64url") };
        return Convert.FromBase64String(padded);
    }
}
