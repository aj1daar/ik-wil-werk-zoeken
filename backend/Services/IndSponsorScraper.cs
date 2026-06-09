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
        return ParseHtml(html);
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
            var rawName = WebUtility.HtmlDecode(m.Groups[1].Value.Trim());
            var kvk = m.Groups[2].Value.Trim();
            var cleanName = StripLegalSuffix(rawName);

            results.Add(new SponsorCompany
            {
                Id = kvk,
                Name = cleanName,
                KvKNumber = kvk,
                IsIndRecognizedSponsor = true,
                LastVerifiedAt = DateTimeOffset.UtcNow,
            });
        }

        _logger.LogInformation("Parsed {Count} sponsors from IND register", results.Count);
        return results;
    }

    internal static string StripLegalSuffix(string name)
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

    // KvK numbers are always exactly 8 digits — use that as an anchor to avoid matching header rows.
    [GeneratedRegex(
        @"<tr[^>]*>\s*<td[^>]*>\s*(.*?)\s*</td>\s*<td[^>]*>\s*(\d{8})\s*</td>",
        RegexOptions.Singleline | RegexOptions.IgnoreCase)]
    private static partial Regex TableRowRegex();
}
