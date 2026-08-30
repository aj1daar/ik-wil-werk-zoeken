using System.Net;
using backend.Services;
using Xunit;

namespace backend.Tests;

// Pure-logic tests for JobLinkParser: SSRF address/host vetting, URL normalization,
// and the HTML / URL-slug extraction heuristics. The network path (ParseAsync /
// SafeConnectAsync socket handling) is not exercised here — only the vetting
// predicate it relies on.

public sealed class JobLinkParserTests
{
    // ── IsBlockedAddress ─────────────────────────────────────────────────────

    [Theory]
    // loopback
    [InlineData("127.0.0.1")]
    [InlineData("127.9.9.9")]
    [InlineData("::1")]
    // unspecified
    [InlineData("0.0.0.0")]
    [InlineData("::")]
    // RFC1918 private
    [InlineData("10.0.0.1")]
    [InlineData("10.255.255.255")]
    [InlineData("172.16.0.1")]
    [InlineData("172.31.255.255")]
    [InlineData("192.168.0.1")]
    [InlineData("192.168.255.255")]
    // link-local + cloud metadata
    [InlineData("169.254.0.1")]
    [InlineData("169.254.169.254")]
    [InlineData("fe80::1")]
    // CGNAT
    [InlineData("100.64.0.1")]
    [InlineData("100.127.255.255")]
    // IPv6 ULA
    [InlineData("fc00::1")]
    [InlineData("fd12:3456::1")]
    // documentation / benchmarking / reserved
    [InlineData("192.0.2.5")]
    [InlineData("198.51.100.5")]
    [InlineData("203.0.113.5")]
    [InlineData("198.18.0.5")]
    [InlineData("2001:db8::1")]
    [InlineData("240.0.0.1")]
    [InlineData("255.255.255.255")]
    [InlineData("224.0.0.1")]
    // IPv4-mapped IPv6 of a private address
    [InlineData("::ffff:127.0.0.1")]
    [InlineData("::ffff:10.0.0.1")]
    // NAT64 embedding a loopback address
    [InlineData("64:ff9b::7f00:1")]
    public void IsBlockedAddress_NonPublic_ReturnsTrue(string ip)
    {
        Assert.True(JobLinkParser.IsBlockedAddress(IPAddress.Parse(ip)));
    }

    [Theory]
    [InlineData("8.8.8.8")]
    [InlineData("1.1.1.1")]
    [InlineData("93.184.216.34")]     // example.com
    [InlineData("172.15.0.1")]        // just outside 172.16/12
    [InlineData("172.32.0.1")]
    [InlineData("192.169.0.1")]
    [InlineData("100.128.0.1")]       // just outside CGNAT
    [InlineData("2606:4700:4700::1111")]
    [InlineData("::ffff:8.8.8.8")]
    [InlineData("64:ff9b::808:808")]  // NAT64 of 8.8.8.8
    public void IsBlockedAddress_PubliclyRoutable_ReturnsFalse(string ip)
    {
        Assert.False(JobLinkParser.IsBlockedAddress(IPAddress.Parse(ip)));
    }

    // ── ContainsBlockedHostLiteral ───────────────────────────────────────────

    [Theory]
    [InlineData("localhost")]
    [InlineData("LOCALHOST")]
    [InlineData("api.localhost")]
    [InlineData("service.local")]
    [InlineData("box.internal")]
    [InlineData("nas.lan")]
    [InlineData("printer.home")]
    [InlineData("db.corp")]
    [InlineData("metadata")]
    [InlineData("metadata.google.internal")]
    [InlineData("127.0.0.1")]
    [InlineData("10.1.2.3")]
    [InlineData("169.254.169.254")]
    [InlineData("[::1]")]
    [InlineData("")]
    [InlineData("   ")]
    public void ContainsBlockedHostLiteral_Blocked_ReturnsTrue(string host)
    {
        Assert.True(JobLinkParser.ContainsBlockedHostLiteral(host));
    }

    [Theory]
    [InlineData("example.com")]
    [InlineData("jobs.lever.co")]
    [InlineData("acme.recruitee.com")]
    [InlineData("8.8.8.8")]
    [InlineData("sub.domain.co.uk")]
    public void ContainsBlockedHostLiteral_Public_ReturnsFalse(string host)
    {
        Assert.False(JobLinkParser.ContainsBlockedHostLiteral(host));
    }

    // ── TryNormalizeUrl ──────────────────────────────────────────────────────

    [Theory]
    [InlineData("https://acme.com/jobs/1")]
    [InlineData("http://acme.com")]
    [InlineData("acme.com/jobs/1")]                 // scheme assumed
    [InlineData("HTTPS://ACME.COM/Job")]
    public void TryNormalizeUrl_Valid_ReturnsTrue(string raw)
    {
        Assert.True(JobLinkParser.TryNormalizeUrl(raw, out var uri));
        Assert.Contains(uri.Scheme, new[] { "http", "https" });
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("ftp://acme.com/x")]
    [InlineData("mailto:hr@acme.com")]
    [InlineData("javascript:alert(1)")]
    [InlineData("file:///etc/passwd")]
    [InlineData("https://")]
    [InlineData("not a url at all")]
    public void TryNormalizeUrl_Invalid_ReturnsFalse(string raw)
    {
        Assert.False(JobLinkParser.TryNormalizeUrl(raw, out _));
    }

    [Fact]
    public void TryNormalizeUrl_OverLengthLimit_ReturnsFalse()
    {
        var huge = "https://acme.com/" + new string('a', 2100);
        Assert.False(JobLinkParser.TryNormalizeUrl(huge, out _));
    }

    // ── JSON-LD extraction ───────────────────────────────────────────────────

    private static string LdPage(string json) =>
        $"<html><head><script type=\"application/ld+json\">{json}</script></head><body></body></html>";

    [Fact]
    public void JsonLd_JobPosting_TitleAndOrgObject()
    {
        var r = JobLinkParser.ParseHtmlContent(LdPage("""
            {"@context":"https://schema.org/","@type":"JobPosting",
             "title":"Senior Backend Engineer",
             "hiringOrganization":{"@type":"Organization","name":"Acme B.V."}}
        """));
        Assert.Equal("Acme B.V.", r.Company);
        Assert.Equal("Senior Backend Engineer", r.Position);
        Assert.Equal("jsonld", r.Source);
    }

    [Fact]
    public void JsonLd_HiringOrganizationAsString()
    {
        var r = JobLinkParser.FromJsonLd(LdPage("""
            {"@type":"JobPosting","title":"Data Analyst","hiringOrganization":"Globex"}
        """));
        Assert.Equal("Globex", r.Company);
        Assert.Equal("Data Analyst", r.Position);
    }

    [Fact]
    public void JsonLd_GraphWrapper()
    {
        var r = JobLinkParser.FromJsonLd(LdPage("""
            {"@context":"https://schema.org","@graph":[
              {"@type":"WebSite","name":"Careers site"},
              {"@type":"JobPosting","title":"SRE","hiringOrganization":{"name":"Initech"}}
            ]}
        """));
        Assert.Equal("Initech", r.Company);
        Assert.Equal("SRE", r.Position);
    }

    [Fact]
    public void JsonLd_RootArray()
    {
        var r = JobLinkParser.FromJsonLd(LdPage("""
            [{"@type":"BreadcrumbList"},
             {"@type":"JobPosting","title":"Platform Engineer","hiringOrganization":{"name":"Hooli"}}]
        """));
        Assert.Equal("Hooli", r.Company);
        Assert.Equal("Platform Engineer", r.Position);
    }

    [Fact]
    public void JsonLd_TypeAsArray()
    {
        var r = JobLinkParser.FromJsonLd(LdPage("""
            {"@type":["JobPosting"],"title":"QA Lead","hiringOrganization":{"name":"Umbrella"}}
        """));
        Assert.Equal("Umbrella", r.Company);
        Assert.Equal("QA Lead", r.Position);
    }

    [Fact]
    public void JsonLd_MalformedBlockIgnored_ValidBlockUsed()
    {
        var html =
            "<script type=\"application/ld+json\">{ this is not json }</script>" +
            "<script type='application/ld+json'>{\"@type\":\"JobPosting\",\"title\":\"DevOps\",\"hiringOrganization\":\"Stark\"}</script>";
        var r = JobLinkParser.FromJsonLd(html);
        Assert.Equal("Stark", r.Company);
        Assert.Equal("DevOps", r.Position);
    }

    [Fact]
    public void JsonLd_EntityEncodedAmpersandInName_Decoded()
    {
        var r = JobLinkParser.FromJsonLd(LdPage("""
            {"@type":"JobPosting","title":"Analyst","hiringOrganization":{"name":"Tom &amp; Jerry"}}
        """));
        Assert.Equal("Tom & Jerry", r.Company);
    }

    [Fact]
    public void JsonLd_JobLocation_SingleCity()
    {
        var r = JobLinkParser.FromJsonLd(LdPage("""
            {"@type":"JobPosting","title":"Engineer","hiringOrganization":"Acme",
             "jobLocation":{"@type":"Place","address":{"@type":"PostalAddress","addressLocality":"Amsterdam"}}}
        """));
        Assert.Equal(new[] { "Amsterdam" }, r.Locations);
    }

    [Fact]
    public void JsonLd_JobLocation_ArrayOfPlaces_Deduplicated()
    {
        var r = JobLinkParser.FromJsonLd(LdPage("""
            {"@type":"JobPosting","title":"Engineer","hiringOrganization":"Acme","jobLocation":[
              {"address":{"addressLocality":"Amsterdam"}},
              {"address":{"addressLocality":"amsterdam"}},
              {"address":{"addressLocality":"Utrecht"}}]}
        """));
        Assert.Equal(new[] { "Amsterdam", "Utrecht" }, r.Locations);
    }

    [Fact]
    public void JsonLd_TelecommuteAddsRemote()
    {
        var r = JobLinkParser.FromJsonLd(LdPage("""
            {"@type":"JobPosting","title":"Engineer","hiringOrganization":"Acme","jobLocationType":"TELECOMMUTE"}
        """));
        Assert.Equal(new[] { "Remote" }, r.Locations);
    }

    [Fact]
    public void JsonLd_NoLocation_EmptyList()
    {
        var r = JobLinkParser.FromJsonLd(LdPage("""
            {"@type":"JobPosting","title":"Engineer","hiringOrganization":"Acme"}
        """));
        Assert.Empty(r.Locations);
    }

    [Fact]
    public void JsonLd_NoJobPosting_ReturnsEmpty()
    {
        var r = JobLinkParser.FromJsonLd(LdPage("""{"@type":"Organization","name":"Acme"}"""));
        Assert.Equal(JobLinkParseResult.Empty, r);
    }

    [Fact]
    public void JsonLd_OrgWithoutName_CompanyNull()
    {
        var r = JobLinkParser.FromJsonLd(LdPage("""
            {"@type":"JobPosting","title":"Engineer","hiringOrganization":{"@type":"Organization"}}
        """));
        Assert.Null(r.Company);
        Assert.Equal("Engineer", r.Position);
    }

    [Fact]
    public void JsonLd_DeeplyNestedPayload_DoesNotStackOverflow()
    {
        var nested = "{\"@graph\":[" + string.Concat(Enumerable.Repeat("{\"@graph\":[", 40))
            + "{}" + string.Concat(Enumerable.Repeat("]}", 40)) + "]}";
        var r = JobLinkParser.FromJsonLd(LdPage(nested));
        Assert.Equal(JobLinkParseResult.Empty, r);
    }

    // ── OpenGraph / meta ─────────────────────────────────────────────────────

    [Fact]
    public void Meta_OgTitle_SplitOnAt()
    {
        var r = JobLinkParser.FromMetaTags(
            "<meta property=\"og:title\" content=\"Senior Engineer at Acme\">");
        Assert.Equal("Acme", r.Company);
        Assert.Equal("Senior Engineer", r.Position);
        Assert.Equal("opengraph", r.Source);
    }

    [Fact]
    public void Meta_ReversedAttributeOrder()
    {
        var r = JobLinkParser.FromMetaTags(
            "<meta content=\"Backend Developer at Globex\" property=\"og:title\"/>");
        Assert.Equal("Globex", r.Company);
        Assert.Equal("Backend Developer", r.Position);
    }

    [Fact]
    public void Meta_SiteNameUsedAsCompanyFallback()
    {
        var r = JobLinkParser.FromMetaTags(
            "<meta property=\"og:title\" content=\"Product Designer\">" +
            "<meta property=\"og:site_name\" content=\"Initech\">");
        Assert.Equal("Initech", r.Company);
        Assert.Equal("Product Designer", r.Position);
    }

    [Fact]
    public void Meta_TwitterTitleFallback()
    {
        var r = JobLinkParser.FromMetaTags(
            "<meta name=\"twitter:title\" content=\"Scrum Master at Hooli\">");
        Assert.Equal("Hooli", r.Company);
        Assert.Equal("Scrum Master", r.Position);
    }

    [Fact]
    public void Meta_None_ReturnsEmpty()
    {
        Assert.Equal(JobLinkParseResult.Empty, JobLinkParser.FromMetaTags("<html><body>hi</body></html>"));
    }

    // ── <title> / SplitTitle ─────────────────────────────────────────────────

    [Theory]
    [InlineData("Acme B.V. hiring Senior Backend Engineer in Amsterdam | LinkedIn", "Acme B.V.", "Senior Backend Engineer")]
    [InlineData("Acme hiring Data Scientist | LinkedIn", "Acme", "Data Scientist")]
    [InlineData("Senior Engineer at Acme", "Acme", "Senior Engineer")]
    [InlineData("Job Application for Senior Engineer at Acme", "Acme", "Senior Engineer")]
    [InlineData("Software   Engineer   at   Acme", "Acme", "Software Engineer")]
    public void SplitTitle_StructuredForms(string title, string company, string position)
    {
        var (c, p) = JobLinkParser.SplitTitle(title);
        Assert.Equal(company, c);
        Assert.Equal(position, p);
    }

    [Theory]
    [InlineData("Senior Engineer - Acme - Amsterdam", "Senior Engineer")]
    [InlineData("Software Engineer | Acme | Careers", "Software Engineer")]
    public void SplitTitle_AmbiguousSeparators_PositionOnly(string title, string position)
    {
        var (c, p) = JobLinkParser.SplitTitle(title);
        Assert.Null(c);
        Assert.Equal(position, p);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("Careers")]
    [InlineData("Jobs")]
    [InlineData("Work with us")]
    public void SplitTitle_NoiseOrEmpty_ReturnsNulls(string title)
    {
        var (c, p) = JobLinkParser.SplitTitle(title);
        Assert.Null(c);
        Assert.Null(p);
    }

    [Fact]
    public void SplitTitle_NoisePositionButRealCompany()
    {
        var (c, p) = JobLinkParser.SplitTitle("Careers at Acme");
        Assert.Equal("Acme", c);
        Assert.Null(p);
    }

    [Fact]
    public void FromTitleTag_ReadsElement()
    {
        var r = JobLinkParser.FromTitleTag("<title>Senior Engineer at Acme</title>");
        Assert.Equal("Acme", r.Company);
        Assert.Equal("Senior Engineer", r.Position);
        Assert.Equal("title", r.Source);
    }

    // ── ParseHtmlContent priority ────────────────────────────────────────────

    [Fact]
    public void ParseHtmlContent_PrefersJsonLdOverTitle()
    {
        var html =
            LdPage("""{"@type":"JobPosting","title":"LD Role","hiringOrganization":"LD Co"}""") +
            "<title>Title Role at Title Co</title>";
        var r = JobLinkParser.ParseHtmlContent(html);
        Assert.Equal("LD Co", r.Company);
        Assert.Equal("LD Role", r.Position);
        Assert.Equal("jsonld", r.Source);
    }

    [Fact]
    public void ParseHtmlContent_FallsBackToTitleWhenNoLdOrMeta()
    {
        var r = JobLinkParser.ParseHtmlContent("<html><title>Senior Engineer at Acme</title></html>");
        Assert.Equal("title", r.Source);
        Assert.Equal("Acme", r.Company);
    }

    [Fact]
    public void ParseHtmlContent_NothingUseful_SourceNone()
    {
        var r = JobLinkParser.ParseHtmlContent("<html><body><p>hello</p></body></html>");
        Assert.Equal("none", r.Source);
    }

    // ── URL-slug heuristics ──────────────────────────────────────────────────

    [Theory]
    [InlineData("https://jobs.lever.co/acme-corp/abc", "Acme Corp", null)]
    [InlineData("https://jobs.lever.co/acme/2f1c9e77-1a2b-4c3d-9e8f-0a1b2c3d4e5f", "Acme", null)]
    [InlineData("https://boards.greenhouse.io/acme/jobs/4012345", "Acme", null)]
    [InlineData("https://job-boards.greenhouse.io/acme/jobs/4012345", "Acme", null)]
    [InlineData("https://acme.recruitee.com/o/senior-backend-engineer", "Acme", "Senior Backend Engineer")]
    [InlineData("https://acme.teamtailor.com/jobs/1234567-senior-engineer", "Acme", "Senior Engineer")]
    [InlineData("https://acme-jobs.personio.de/job/12345", "Acme", null)]
    [InlineData("https://acme.jobs.personio.com/xyz", "Acme", null)]
    [InlineData("https://apply.workable.com/acme/j/ABCDEF1234/", "Acme", null)]
    [InlineData("https://acme.workable.com/jobs/9", "Acme", null)]
    [InlineData("https://acme.bamboohr.com/careers/42", "Acme", null)]
    [InlineData("https://acme.homerun.co/senior-engineer/en", "Acme", null)]
    [InlineData("https://jobs.ashbyhq.com/acme/2f1c9e77-1a2b-4c3d-9e8f-0a1b2c3d4e5f", "Acme", null)]
    [InlineData("https://jobs.smartrecruiters.com/Acme/744000008-senior-engineer", "Acme", "Senior Engineer")]
    [InlineData("https://acme.wd3.myworkdayjobs.com/en-US/careers/job/Amsterdam/Senior-Backend-Engineer_JR-1234", "Acme", "Senior Backend Engineer")]
    [InlineData("https://www.linkedin.com/jobs/view/senior-backend-engineer-at-acme-b-v-3812345678", "Acme B V", "Senior Backend Engineer")]
    [InlineData("https://JOBS.LEVER.CO/Acme/x", "Acme", null)]
    public void FromUrl_KnownAtsHosts(string url, string? company, string? position)
    {
        var r = JobLinkParser.FromUrl(new Uri(url));
        Assert.Equal(company, r.Company);
        Assert.Equal(position, r.Position);
        Assert.Equal("url", r.Source);
    }

    [Theory]
    [InlineData("https://nl.indeed.com/viewjob?jk=abc123")]
    [InlineData("https://acme.com/careers/job/123")]
    [InlineData("https://www.linkedin.com/jobs/view/1234567890")]
    [InlineData("https://example.org/")]
    public void FromUrl_UnknownOrUninformative_ReturnsEmpty(string url)
    {
        Assert.Equal(JobLinkParseResult.Empty, JobLinkParser.FromUrl(new Uri(url)));
    }

    // ── charset resolution ──────────────────────────────────────────────────

    [Fact]
    public void ResolveEncoding_HeaderCharsetWins()
    {
        var enc = JobLinkParser.ResolveEncoding("utf-8", "<html>"u8);
        Assert.Equal(65001, enc.CodePage);
    }

    [Fact]
    public void ResolveEncoding_Latin1Header_DecodesAccentsCorrectly()
    {
        // "Café" as ISO-8859-1: the é is a single 0xE9 byte (invalid as UTF-8).
        byte[] latin1 = [0x43, 0x61, 0x66, 0xE9];
        var text = JobLinkParser.ResolveEncoding("iso-8859-1", latin1).GetString(latin1);
        Assert.Equal("Café", text);
    }

    [Fact]
    public void ResolveEncoding_Utf8Bom_Detected()
    {
        byte[] withBom = [0xEF, 0xBB, 0xBF, (byte)'h', (byte)'i'];
        Assert.Equal(65001, JobLinkParser.ResolveEncoding(null, withBom).CodePage);
    }

    [Fact]
    public void ResolveEncoding_MetaCharsetSniff()
    {
        var body = System.Text.Encoding.ASCII.GetBytes(
            "<html><head><meta charset=\"iso-8859-1\"><title>x</title></head>");
        Assert.Equal(28591, JobLinkParser.ResolveEncoding(null, body).CodePage);
    }

    [Fact]
    public void ResolveEncoding_UnknownCharset_FallsBackToUtf8()
    {
        Assert.Equal(65001, JobLinkParser.ResolveEncoding("x-made-up-9000", "<html>"u8).CodePage);
    }

    [Fact]
    public void ResolveEncoding_NothingDeclared_DefaultsToUtf8()
    {
        Assert.Equal(65001, JobLinkParser.ResolveEncoding(null, "<html><body>hi</body></html>"u8).CodePage);
    }

    // ── field cleaning via ParseHtmlContent ──────────────────────────────────

    [Fact]
    public void Extraction_TrimsAndCollapsesWhitespace()
    {
        var r = JobLinkParser.FromJsonLd(LdPage("""
            {"@type":"JobPosting","title":"  Senior   Engineer \n","hiringOrganization":"  Acme  "}
        """));
        Assert.Equal("Senior Engineer", r.Position);
        Assert.Equal("Acme", r.Company);
    }

    [Fact]
    public void Extraction_HtmlInjectionInTitleTag_NotExecutedJustText()
    {
        var r = JobLinkParser.FromTitleTag("<title>&lt;script&gt;alert(1)&lt;/script&gt; at Acme</title>");
        Assert.Equal("Acme", r.Company);
        Assert.Equal("<script>alert(1)</script>", r.Position);
    }
}
