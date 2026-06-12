using backend.Services;
using Xunit;

namespace backend.Tests;

// Tests use IndSponsorScraper.StripLegalSuffix (internal static) and the private ParseHtml method
// via reflection, so we can unit-test HTML parsing without hitting the network.

public sealed class IndSponsorScraperTests
{
    // ── StripLegalSuffix ─────────────────────────────────────────────────────

    [Theory]
    [InlineData("ASML N.V.",          "ASML")]
    [InlineData("Booking.com B.V.",   "Booking.com")]
    [InlineData("Adyen NV",           "Adyen")]
    [InlineData("ING Groep N.V.",     "ING Groep")]
    [InlineData("TomTom BV",          "TomTom")]
    [InlineData("Philips S.A.",       "Philips")]
    [InlineData("Example GmbH",       "Example")]
    [InlineData("Foo LLC",            "Foo")]
    [InlineData("Bar Ltd.",           "Bar")]
    [InlineData("Baz Inc",            "Baz")]
    [InlineData("Qux Ltd",            "Qux")]
    [InlineData("NFDI Stichting",     "NFDI")]
    [InlineData("No Suffix Here",     "No Suffix Here")]
    [InlineData("Company",            "Company")]
    public void StripLegalSuffix_CommonSuffixes(string input, string expected)
    {
        Assert.Equal(expected, IndSponsorScraper.StripLegalSuffix(input));
    }

    [Fact]
    public void StripLegalSuffix_TrailingWhitespaceTrimmed()
    {
        Assert.Equal("ASML", IndSponsorScraper.StripLegalSuffix("ASML N.V.   "));
    }

    [Fact]
    public void StripLegalSuffix_EmptyString_ReturnsEmpty()
    {
        Assert.Equal(string.Empty, IndSponsorScraper.StripLegalSuffix(string.Empty));
    }

    [Fact]
    public void StripLegalSuffix_OnlySuffix_ReturnsEmpty()
    {
        // A name that is ONLY the suffix — edge case, returns empty
        Assert.Equal(string.Empty, IndSponsorScraper.StripLegalSuffix("B.V."));
    }

    [Fact]
    public void StripLegalSuffix_TwoTrailingSuffixes_BothStripped()
    {
        // Highly unusual but the code handles up to 2 passes
        Assert.Equal("Foo", IndSponsorScraper.StripLegalSuffix("Foo B.V. N.V."));
    }

    [Fact]
    public void StripLegalSuffix_CaseInsensitive()
    {
        Assert.Equal("Foo", IndSponsorScraper.StripLegalSuffix("Foo bv"));
        Assert.Equal("Bar", IndSponsorScraper.StripLegalSuffix("Bar BV"));
    }

    [Fact]
    public void StripLegalSuffix_SuffixAtStartNotStripped()
    {
        // "Stichting" at the start should NOT be stripped — only trailing suffixes are removed
        Assert.Equal("Stichting NFDI", IndSponsorScraper.StripLegalSuffix("Stichting NFDI"));
    }

    // ── ParseHtml (via reflection) ────────────────────────────────────────────

    private static List<backend.Models.SponsorCompany> InvokeParse(string html)
    {
        var method = typeof(IndSponsorScraper).GetMethod(
            "ParseHtml",
            System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);

        var scraper = CreateScraper();
        return (List<backend.Models.SponsorCompany>)method!.Invoke(scraper, [html])!;
    }

    private static IndSponsorScraper CreateScraper()
    {
        var httpFactory = new FakeHttpClientFactory();
        var logger = Microsoft.Extensions.Logging.Abstractions.NullLogger<IndSponsorScraper>.Instance;
        return new IndSponsorScraper(httpFactory, logger);
    }

    [Fact]
    public void ParseHtml_SingleRow_NameAndKvK()
    {
        var html = @"<table><tr>
            <td>ASML N.V.</td>
            <td>12345678</td>
        </tr></table>";
        var results = InvokeParse(html);
        Assert.Single(results);
        Assert.Equal("ASML", results[0].Name);
        Assert.Equal("12345678", results[0].KvKNumber);
        Assert.Equal("12345678", results[0].Id);
    }

    [Fact]
    public void ParseHtml_SingleRowWithCity_CityPopulated()
    {
        var html = @"<table><tr>
            <td>ASML N.V.</td>
            <td>12345678</td>
            <td>Eindhoven</td>
        </tr></table>";
        var results = InvokeParse(html);
        Assert.Single(results);
        Assert.Equal("Eindhoven", results[0].City);
    }

    [Fact]
    public void ParseHtml_RowWithoutCityColumn_CityIsNull()
    {
        var html = @"<table><tr>
            <td>TomTom BV</td>
            <td>98765432</td>
        </tr></table>";
        var results = InvokeParse(html);
        Assert.Single(results);
        Assert.Null(results[0].City);
    }

    [Fact]
    public void ParseHtml_CityColumnEmpty_CityIsNull()
    {
        var html = @"<table><tr>
            <td>Booking.com B.V.</td>
            <td>11223344</td>
            <td>   </td>
        </tr></table>";
        var results = InvokeParse(html);
        Assert.Single(results);
        Assert.Null(results[0].City);
    }

    [Fact]
    public void ParseHtml_MultipleRows_AllParsed()
    {
        var html = @"<table>
            <tr><td>ASML N.V.</td><td>11111111</td><td>Eindhoven</td></tr>
            <tr><td>Booking.com B.V.</td><td>22222222</td><td>Amsterdam</td></tr>
            <tr><td>Adyen NV</td><td>33333333</td><td>Amsterdam</td></tr>
        </table>";
        var results = InvokeParse(html);
        Assert.Equal(3, results.Count);
        Assert.Equal("ASML",        results[0].Name);
        Assert.Equal("Eindhoven",   results[0].City);
        Assert.Equal("Booking.com", results[1].Name);
        Assert.Equal("Amsterdam",   results[1].City);
        Assert.Equal("Adyen",       results[2].Name);
        Assert.Equal("Amsterdam",   results[2].City);
    }

    [Fact]
    public void ParseHtml_HtmlEntitiesInName_Decoded()
    {
        var html = @"<tr><td>AT&amp;T B.V.</td><td>12345678</td></tr>";
        var results = InvokeParse(html);
        Assert.Single(results);
        Assert.Equal("AT&T", results[0].Name);
    }

    [Fact]
    public void ParseHtml_HeaderRowWithoutKvK_Skipped()
    {
        // A header row without an 8-digit KvK number must not be captured
        var html = @"<table>
            <tr><th>Name</th><th>KvK</th><th>Place</th></tr>
            <tr><td>ASML N.V.</td><td>12345678</td><td>Eindhoven</td></tr>
        </table>";
        var results = InvokeParse(html);
        Assert.Single(results);
    }

    [Fact]
    public void ParseHtml_KvKLessThan8Digits_Skipped()
    {
        var html = @"<tr><td>Fake Co B.V.</td><td>1234567</td></tr>";
        var results = InvokeParse(html);
        Assert.Empty(results);
    }

    [Fact]
    public void ParseHtml_KvKMoreThan8Digits_Skipped()
    {
        var html = @"<tr><td>Fake Co B.V.</td><td>123456789</td></tr>";
        var results = InvokeParse(html);
        Assert.Empty(results);
    }

    [Fact]
    public void ParseHtml_EmptyHtml_ReturnsEmpty()
    {
        var results = InvokeParse(string.Empty);
        Assert.Empty(results);
    }

    [Fact]
    public void ParseHtml_NoMatchingRows_ReturnsEmpty()
    {
        var results = InvokeParse("<html><body><p>No table here</p></body></html>");
        Assert.Empty(results);
    }

    [Fact]
    public void ParseHtml_IsIndRecognizedSponsor_AlwaysTrue()
    {
        var html = @"<tr><td>ASML N.V.</td><td>12345678</td><td>Eindhoven</td></tr>";
        var results = InvokeParse(html);
        Assert.True(results[0].IsIndRecognizedSponsor);
    }

    [Fact]
    public void ParseHtml_LastVerifiedAt_IsRecentUtc()
    {
        var html = @"<tr><td>ASML N.V.</td><td>12345678</td></tr>";
        var before = DateTimeOffset.UtcNow.AddSeconds(-5);
        var results = InvokeParse(html);
        var after = DateTimeOffset.UtcNow.AddSeconds(5);
        Assert.InRange(results[0].LastVerifiedAt, before, after);
    }

    [Fact]
    public void ParseHtml_AttackHtmlInjectionInName_DecodedSafely()
    {
        // Ensure HTML-encoded attack strings are decoded but not executed
        var html = @"<tr><td>&lt;script&gt;alert(1)&lt;/script&gt; B.V.</td><td>12345678</td></tr>";
        var results = InvokeParse(html);
        Assert.Single(results);
        Assert.Equal("<script>alert(1)</script>", results[0].Name);
    }

    [Fact]
    public void ParseHtml_ExtraWhitespaceInCells_TrimmedCorrectly()
    {
        var html = @"<tr>
            <td>   ASML N.V.   </td>
            <td>   12345678   </td>
            <td>   Eindhoven   </td>
        </tr>";
        var results = InvokeParse(html);
        Assert.Single(results);
        Assert.Equal("ASML", results[0].Name);
        Assert.Equal("12345678", results[0].KvKNumber);
        Assert.Equal("Eindhoven", results[0].City);
    }
}

// ── Minimal IHttpClientFactory stub ──────────────────────────────────────────

internal sealed class FakeHttpClientFactory : System.Net.Http.IHttpClientFactory
{
    public System.Net.Http.HttpClient CreateClient(string name) =>
        new System.Net.Http.HttpClient();
}
