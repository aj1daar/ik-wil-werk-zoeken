using System.Diagnostics;
using backend.Models;
using backend.Services;
using Microsoft.AspNetCore.Mvc;

namespace backend.Controllers;

// Machine-to-machine only. Consumed daily by nl-tech-jobs-pipeline, which runs on
// another host and has no database credentials. The contract is documented in
// docs/ARCHITECTURE.md; treat every field name here as published.
//
// Authentication is the X-Api-Key check in ExportApiKeyFilter, which is attached
// to this controller alone. A user's bearer token is not accepted here, and an
// API key is worth nothing on any other route.
[Route("api/export")]
[ServiceFilter(typeof(ExportApiKeyFilter))]
public sealed class ExportController(SponsorStore sponsors, ILogger<ExportController> logger)
    : ApiControllerBase
{
    [HttpGet("sponsors")]
    public async Task<IActionResult> GetSponsors()
    {
        var started = Stopwatch.GetTimestamp();

        var rows = (await sponsors.GetAllForExportAsync())
            .Select(SponsorExportRow.From)
            .ToArray();

        // A consumer rebuilding its own tables from this must never be handed a
        // stale copy, by Cloudflare or by anything else in between.
        Response.Headers.CacheControl = "no-store";
        // Cloudflare reads this one in preference to Cache-Control, so both are
        // set rather than trusting the edge configuration to stay as it is.
        Response.Headers["CDN-Cache-Control"] = "no-store";

        // The key's name, never the key. Enough to tell two callers apart in the
        // log, and to see which one a rotation has moved over.
        logger.LogInformation(
            "Sponsor export served: key {KeyName}, {Status}, {Count} rows in {Elapsed}ms",
            HttpContext.Items[ExportApiKeyFilter.KeyNameItem] as string ?? "unknown",
            200, rows.Length, (int)Stopwatch.GetElapsedTime(started).TotalMilliseconds);

        return Ok(new SponsorExportResponse
        {
            SchemaVersion = 1,
            GeneratedAt   = DateTimeOffset.UtcNow,
            Count         = rows.Length,
            Sponsors      = rows,
        });
    }
}
