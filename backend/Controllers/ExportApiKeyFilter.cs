using backend.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace backend.Controllers;

/// <summary>
/// Guards /api/export and nothing else. Applied with
/// <c>[ServiceFilter(typeof(ExportApiKeyFilter))]</c> on ExportController, so a
/// route only gets this check by asking for it, and the user endpoints keep their
/// own bearer-token check with no overlap in either direction: a JWT is never
/// read here, and an X-Api-Key is never read there.
/// </summary>
public sealed class ExportApiKeyFilter(
    ExportApiKeyService keys,
    RateLimiterService rateLimiter,
    ILogger<ExportApiKeyFilter> logger) : IAuthorizationFilter
{
    public const string HeaderName = "X-Api-Key";
    public const string KeyNameItem = "ExportApiKeyName";

    // One export a day is the job; 30 an hour leaves room for retries and a
    // manual check without letting a leaked key pull the register all day.
    private const int MaxRequestsPerWindow = 30;
    private const int WindowSeconds = 3600;

    public void OnAuthorization(AuthorizationFilterContext context)
    {
        var ip = context.HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";

        if (!keys.IsConfigured)
        {
            // Fails closed. Worth an error rather than a warning: the endpoint is
            // unreachable until EXPORT_API_KEYS is set, and silence would make
            // that look like a client problem.
            logger.LogError("Sponsor export refused: EXPORT_API_KEYS is not configured");
            Stop(context, 401);
            return;
        }

        var presented = context.HttpContext.Request.Headers[HeaderName].FirstOrDefault();
        var name = keys.Match(presented);

        if (name is null)
        {
            // Never the key, not even a prefix of it, and not whether the header
            // was missing or merely wrong: a caller learns only that it failed.
            logger.LogWarning(
                "Sponsor export rejected: {Status} from {Ip}, header {Present}",
                401, ip, presented is null ? "absent" : "present");
            Stop(context, 401);
            return;
        }

        if (!rateLimiter.IsAllowed($"export-key:{name}", MaxRequestsPerWindow, WindowSeconds))
        {
            logger.LogWarning(
                "Sponsor export rate limited: key {KeyName} from {Ip}, {Max} per {Window}s",
                name, ip, MaxRequestsPerWindow, WindowSeconds);
            context.HttpContext.Response.Headers.RetryAfter = WindowSeconds.ToString();
            Stop(context, 429);
            return;
        }

        context.HttpContext.Items[KeyNameItem] = name;
    }

    // An empty body on purpose, and EmptyResult rather than StatusCodeResult:
    // [ApiController] turns a bare status code into a problem+json document with a
    // traceId in it, and a caller probing for keys is told nothing at all.
    private static void Stop(AuthorizationFilterContext context, int status)
    {
        context.HttpContext.Response.StatusCode = status;
        context.Result = new EmptyResult();
    }
}
