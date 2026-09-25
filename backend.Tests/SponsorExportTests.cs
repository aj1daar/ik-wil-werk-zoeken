using System.Text.Json;
using backend.Controllers;
using backend.Data;
using backend.Models;
using backend.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace backend.Tests;

/// <summary>
/// GET /api/export/sponsors is a contract with nl-tech-jobs-pipeline, which
/// rebuilds its own tables from it. These tests hold that contract in place:
/// field names, which rows appear, and what an unknown value looks like.
/// SQLite in-memory for the same reason as SponsorStoreTests.
/// </summary>
public sealed class SponsorExportTests : IDisposable
{
    private readonly SqliteConnection _conn;
    private readonly AppDbContext _db;
    private readonly ExportController _controller;

    public SponsorExportTests()
    {
        _conn = new SqliteConnection("DataSource=:memory:");
        _conn.Open();
        _db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(_conn).Options);
        _db.Database.EnsureCreated();
        _controller = new ExportController(new SponsorStore(_db), NullLogger<ExportController>.Instance)
        {
            ControllerContext = { HttpContext = new DefaultHttpContext() },
        };
    }

    public void Dispose() { _db.Dispose(); _conn.Dispose(); }

    private async Task Add(params SponsorCompany[] companies)
    {
        _db.Sponsors.AddRange(companies);
        await _db.SaveChangesAsync();
    }

    private static SponsorCompany Company(string id, string name = "Acme B.V.") => new()
    {
        Id             = id,
        Name           = name,
        KvKNumber      = id,
        IsIndRecognizedSponsor = true,
        LastVerifiedAt = new DateTimeOffset(2026, 9, 1, 12, 0, 0, TimeSpan.Zero),
    };

    private async Task<SponsorExportResponse> Export()
    {
        var result = Assert.IsType<OkObjectResult>(await _controller.GetSponsors());
        return Assert.IsType<SponsorExportResponse>(result.Value);
    }

    // ── which rows travel ────────────────────────────────────────────────────

    [Fact]
    public async Task IncludesRemovedAndMergedSponsors()
    {
        var removed = Company("00000001", "Gone B.V.");
        removed.RemovedAt = new DateTimeOffset(2026, 8, 1, 0, 0, 0, TimeSpan.Zero);
        var merged = Company("00000002", "Duplicate B.V.");
        merged.MergedIntoId = "00000003";
        await Add(Company("00000003", "Live B.V."), removed, merged);

        var export = await Export();

        Assert.Equal(3, export.Count);
        Assert.Equal(3, export.Sponsors.Length);
        var gone = Assert.Single(export.Sponsors.Where(s => s.Id == "00000001"));
        Assert.NotNull(gone.RemovedAt);
        var duplicate = Assert.Single(export.Sponsors.Where(s => s.Id == "00000002"));
        Assert.Equal("00000003", duplicate.MergedIntoId);
    }

    [Fact]
    public async Task ReportsAnEmptyRegisterAsZeroRowsRatherThanNothing()
    {
        var export = await Export();
        Assert.Equal(0, export.Count);
        Assert.Empty(export.Sponsors);
        Assert.Equal(1, export.SchemaVersion);
    }

    [Fact]
    public async Task CountMatchesTheNumberOfRowsSent()
    {
        await Add(Company("00000001"), Company("00000002"), Company("00000003"));
        var export = await Export();
        Assert.Equal(export.Sponsors.Length, export.Count);
    }

    // ── unknown stays unknown ────────────────────────────────────────────────

    [Fact]
    public async Task LeavesUnknownFieldsNull()
    {
        await Add(Company("00000001"));
        var row = Assert.Single((await Export()).Sponsors);

        Assert.Null(row.City);
        Assert.Null(row.WebsiteUrl);
        Assert.Null(row.CoreIndustry);
        Assert.Null(row.TechStackTags);
        Assert.Null(row.WorkingLanguage);
        Assert.Null(row.CompanySize);
        Assert.Null(row.RemotePolicy);
        Assert.Null(row.AliasNames);
        Assert.Null(row.Locations);
        Assert.Null(row.EnrichedAt);
        Assert.Null(row.RemovedAt);
        Assert.Null(row.MergedIntoId);
    }

    [Fact]
    public async Task TurnsAnEmptyKvkNumberIntoNull()
    {
        var company = Company("no-kvk-row");
        company.KvKNumber = "";
        await Add(company);

        Assert.Null(Assert.Single((await Export()).Sponsors).KvkNumber);
    }

    [Fact]
    public async Task TurnsAWhitespaceOnlyValueIntoNull()
    {
        var company = Company("00000001");
        company.KvKNumber = "   ";
        company.City = " ";
        company.WorkingLanguage = "\t";
        await Add(company);

        var row = Assert.Single((await Export()).Sponsors);
        Assert.Null(row.KvkNumber);
        Assert.Null(row.City);
        Assert.Null(row.WorkingLanguage);
    }

    [Fact]
    public async Task TurnsAnEmptyListIntoNullRatherThanAnEmptyArray()
    {
        var company = Company("00000001");
        company.TechStackTags = [];
        company.AliasNames = ["", "  "];
        await Add(company);

        var row = Assert.Single((await Export()).Sponsors);
        Assert.Null(row.TechStackTags);
        Assert.Null(row.AliasNames);
    }

    [Fact]
    public async Task KeepsTheEntriesOfAListThatHasSome()
    {
        var company = Company("00000001");
        company.TechStackTags = ["C#", "", "Vue"];
        await Add(company);

        Assert.Equal(["C#", "Vue"], Assert.Single((await Export()).Sponsors).TechStackTags);
    }

    [Fact]
    public async Task SendsEnrichmentVersionZeroAsNull()
    {
        // 0 means the enrichment never ran. A consumer comparing version numbers
        // would otherwise read it as a real version it might already have.
        await Add(Company("00000001"));
        Assert.Null(Assert.Single((await Export()).Sponsors).EnrichmentVersion);
    }

    [Fact]
    public async Task SendsNullForARowEnrichedBeforeVersioningExisted()
    {
        // The seeded companies carry an EnrichedAt with version 0. Unknown version,
        // not version zero.
        var company = Company("00000001");
        company.EnrichedAt = new DateTimeOffset(2026, 6, 1, 0, 0, 0, TimeSpan.Zero);
        company.EnrichmentVersion = 0;
        await Add(company);

        var row = Assert.Single((await Export()).Sponsors);
        Assert.Null(row.EnrichmentVersion);
        Assert.NotNull(row.EnrichedAt);
    }

    [Fact]
    public async Task SendsARealEnrichmentVersionAsItIs()
    {
        var company = Company("00000001");
        company.EnrichmentVersion = 2;
        company.EnrichedAt = new DateTimeOffset(2026, 9, 10, 8, 0, 0, TimeSpan.Zero);
        await Add(company);

        var row = Assert.Single((await Export()).Sponsors);
        Assert.Equal(2, row.EnrichmentVersion);
        Assert.NotNull(row.EnrichedAt);
    }

    // ── order and repeatability ──────────────────────────────────────────────

    [Fact]
    public async Task OrdersByIdAndKeepsThatOrderBetweenCalls()
    {
        await Add(Company("00000030"), Company("00000010"), Company("00000020"));

        var first = await Export();
        var second = await Export();

        Assert.Equal(["00000010", "00000020", "00000030"], first.Sponsors.Select(s => s.Id));
        Assert.Equal(first.Sponsors.Select(s => s.Id), second.Sponsors.Select(s => s.Id));
    }

    [Fact]
    public async Task ProducesIdenticalBytesApartFromTheTimestamp()
    {
        await Add(Company("00000002"), Company("00000001"));

        static string WithoutTimestamp(SponsorExportResponse export)
        {
            export.GeneratedAt = default;
            return JsonSerializer.Serialize(export);
        }

        Assert.Equal(WithoutTimestamp(await Export()), WithoutTimestamp(await Export()));
    }

    // ── the wire format itself ───────────────────────────────────────────────

    [Fact]
    public async Task NamesEveryFieldTheWayTheContractDoes()
    {
        var company = Company("00000001");
        company.City = "Amsterdam";
        company.Locations = ["Utrecht"];
        company.WebsiteUrl = "https://example.com/";
        company.CoreIndustry = "Fintech";
        company.TechStackTags = ["C#"];
        company.WorkingLanguage = "English";
        company.CompanySize = "50-200";
        company.RemotePolicy = "hybrid";
        company.AliasNames = ["Acme"];
        company.EnrichmentVersion = 1;
        company.EnrichedAt = DateTimeOffset.UtcNow;
        await Add(company);

        var json = JsonSerializer.Serialize(await Export());

        foreach (var field in new[]
        {
            "schemaVersion", "generatedAt", "count", "sponsors",
            "id", "name", "kvkNumber", "isIndRecognizedSponsor", "lastVerifiedAt",
            "removedAt", "mergedIntoId", "aliasNames", "city", "locations", "websiteUrl",
            "coreIndustry", "techStackTags", "workingLanguage", "companySize",
            "remotePolicy", "enrichedAt", "enrichmentVersion",
        })
            Assert.Contains($"\"{field}\":", json);

        // The storage model spells it KvKNumber, which a camelCase policy turns
        // into kvKNumber. The contract says kvkNumber.
        Assert.DoesNotContain("kvKNumber", json);
    }

    [Fact]
    public async Task TellsEveryCacheInBetweenNotToKeepIt()
    {
        await _controller.GetSponsors();

        Assert.Equal("no-store", _controller.Response.Headers.CacheControl);
        Assert.Equal("no-store", _controller.Response.Headers["CDN-Cache-Control"]);
    }

    [Fact]
    public async Task DoesNotDropSponsorsWhoseIdIsNotANumber()
    {
        // Rows created before the IND sync keyed on the KvK number carry a GUID.
        await Add(Company("7f3d2a1b9c004e5fa1b2c3d4e5f60718"), Company("00000001"));
        Assert.Equal(2, (await Export()).Count);
    }
}
