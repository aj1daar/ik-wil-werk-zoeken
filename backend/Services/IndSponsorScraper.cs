using System.Net;
using System.Text.RegularExpressions;
using backend.Models;
using Microsoft.Extensions.Logging;

namespace backend.Services;

public sealed partial class IndSponsorScraper
{
    private const string RegisterUrl =
        "https://ind.nl/en/public-register-recognised-sponsors/public-register-work";

    // Ordered longest-first so "B.V.B.A." is tried before "B.V." and "BV"
    private static readonly string[] LegalSuffixes =
    [
        "B.V.B.A.", "BVBA",
        "V.O.F.", "VOF",
        "B.V.", "BV",
        "N.V.", "NV",
        "C.V.", "CV",
        "S.E.", "SE",
        "S.A.", "SA",
        "S.r.l.", "SRL",
        "S.P.A.", "SPA",
        "A.G.", "AG",
        "NV/SA",
        "Ltd.", "Ltd",
        "Inc.", "Inc",
        "GmbH", "LLC", "PLC", "plc",
        "U.A.", "UA",
        "Stichting",
        "Coöperatie", "Cooperatie",
    ];

    private readonly IHttpClientFactory _http;
    private readonly ILogger<IndSponsorScraper> _logger;

    public IndSponsorScraper(IHttpClientFactory http, ILogger<IndSponsorScraper> logger)
    {
        _http = http;
        _logger = logger;
    }

    public async Task<IReadOnlyList<SponsorCompany>> FetchAsync(CancellationToken ct = default)
    {
        using var client = _http.CreateClient("ind");
        var html = await client.GetStringAsync(RegisterUrl, ct);
        var results = ParseHtml(html);
        if (results.Count == 0)
            throw new InvalidOperationException(
                "IND page returned 0 sponsors — the page structure may have changed.");
        return results;
    }

    private List<SponsorCompany> ParseHtml(string html)
    {
        var matches = TableRowRegex().Matches(html);

        if (matches.Count == 0)
        {
            _logger.LogWarning("IND page returned no table rows — page structure may have changed");
            return [];
        }

        var results = new List<SponsorCompany>(matches.Count);

        foreach (Match m in matches)
        {
            // Strip real HTML tags first (e.g. <span>, <a> wrapping cell content),
            // then decode entities — this order ensures encoded text like &lt;script&gt;
            // survives as literal text rather than being tag-stripped after decode.
            var rawName = WebUtility.HtmlDecode(StripTags(m.Groups[1].Value));
            var kvk     = m.Groups[2].Value.Trim();
            var rawCity = WebUtility.HtmlDecode(StripTags(m.Groups[3].Value));

            var cleanName = StripLegalSuffix(rawName);
            var city = string.IsNullOrWhiteSpace(rawCity) ? null : rawCity;

            results.Add(new SponsorCompany
            {
                Id = kvk,
                Name = cleanName,
                KvKNumber = kvk,
                City = city,
                IsIndRecognizedSponsor = true,
                LastVerifiedAt = DateTimeOffset.UtcNow,
            });
        }

        _logger.LogInformation("Parsed {Count} sponsors from IND register", results.Count);
        return results;
    }

    private static string StripTags(string html) =>
        MultiSpaceRegex().Replace(HtmlTagRegex().Replace(html, " "), " ").Trim();

    public static string StripLegalSuffix(string name)
    {
        var span = name.AsSpan().TrimEnd();

        // Strip up to two trailing suffixes (e.g. "Foo B.V. N.V." is unusual but handled)
        for (var pass = 0; pass < 2; pass++)
        {
            var matched = false;
            foreach (var suffix in LegalSuffixes)
            {
                if (span.EndsWith(suffix, StringComparison.OrdinalIgnoreCase))
                {
                    span = span[..^suffix.Length].TrimEnd(" ,".AsSpan());
                    matched = true;
                    break;
                }
            }
            if (!matched) break;
        }

        return span.ToString();
    }

    // Captures: (1) company name cell content, (2) KvK 8-digit, (3) city/place cell (optional).
    // IND now uses <th scope="row"> for data rows; header rows use <th scope="col"> for BOTH
    // columns. By requiring scope="row" (or falling back to <td> for the old format) the header
    // row never matches — no need to rely on KvK-in-td to skip it.
    // (?<!\d)(\d{8})(?!\d) ensures exactly 8 digits (won't match inside a 9+-digit number).
    [GeneratedRegex(
        @"<tr[^>]*>\s*(?:<th[^>]*scope=""row""[^>]*>|<td[^>]*>)([\s\S]*?)</(?:th|td)>\s*<td[^>]*>[\s\S]*?(?<!\d)(\d{8})(?!\d)[\s\S]*?</td>(?:\s*<(?:th|td)[^>]*>([\s\S]*?)</(?:th|td)>)?",
        RegexOptions.Singleline | RegexOptions.IgnoreCase)]
    private static partial Regex TableRowRegex();

    [GeneratedRegex(@"<[^>]+>")]
    private static partial Regex HtmlTagRegex();

    [GeneratedRegex(@"\s{2,}")]
    private static partial Regex MultiSpaceRegex();
}
