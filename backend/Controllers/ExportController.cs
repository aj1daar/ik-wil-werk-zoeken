using System.Diagnostics;
using backend.Models;
using backend.Services;
using Microsoft.AspNetCore.Mvc;

namespace backend.Controllers;

// Machine-to-machine only. Consumed daily by nl-tech-jobs-pipeline, which runs on
// another host and has no database credentials. The contract is documented in
// docs/ARCHITECTURE.md; treat every field name here as published.
[Route("api/export")]
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

        logger.LogInformation(
            "Sponsor export served: {Count} rows in {Elapsed}ms",
            rows.Length, (int)Stopwatch.GetElapsedTime(started).TotalMilliseconds);

        return Ok(new SponsorExportResponse
        {
            SchemaVersion = 1,
            GeneratedAt   = DateTimeOffset.UtcNow,
            Count         = rows.Length,
            Sponsors      = rows,
        });
    }
}
