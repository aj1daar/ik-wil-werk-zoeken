using backend.Controllers;
using backend.Models;
using Xunit;

namespace backend.Tests;

// Unit tests for AdminController.NormalizeCompanyEdit — the pure trim / validate /
// de-duplicate step behind PUT /api/mgmt/companies/{id}. No DB or network.
public sealed class AdminControllerTests
{
    private static (CompanyEdit? edit, string? error) Normalize(UpdateCompanyRequest body) =>
        AdminController.NormalizeCompanyEdit(body);

    // ── trimming / blank handling ────────────────────────────────────────────

    [Fact]
    public void TrimsTextFields()
    {
        var (edit, error) = Normalize(new UpdateCompanyRequest
        {
            Summary = "  hello  ",
            City = "  Utrecht ",
            CoreIndustry = "\tFintech\n",
        });

        Assert.Null(error);
        Assert.Equal("hello", edit!.Summary);
        Assert.Equal("Utrecht", edit.City);
        Assert.Equal("Fintech", edit.CoreIndustry);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("\t\n")]
    public void BlankTextFieldBecomesNull(string? value)
    {
        var (edit, error) = Normalize(new UpdateCompanyRequest { Summary = value, City = value });
        Assert.Null(error);
        Assert.Null(edit!.Summary);
        Assert.Null(edit.City);
    }

    [Fact]
    public void EmptyRequestNormalizesToAllNull()
    {
        var (edit, error) = Normalize(new UpdateCompanyRequest());
        Assert.Null(error);
        Assert.NotNull(edit);
        Assert.Null(edit!.Summary);
        Assert.Null(edit.Locations);
        Assert.Null(edit.TechStackTags);
        Assert.Null(edit.WebsiteUrl);
    }

    // ── length caps ──────────────────────────────────────────────────────────

    [Fact]
    public void SummaryAt2000CharsIsAccepted()
    {
        var (edit, error) = Normalize(new UpdateCompanyRequest { Summary = new string('x', 2000) });
        Assert.Null(error);
        Assert.Equal(2000, edit!.Summary!.Length);
    }

    [Fact]
    public void SummaryOver2000CharsIsRejected()
    {
        var (edit, error) = Normalize(new UpdateCompanyRequest { Summary = new string('x', 2001) });
        Assert.Null(edit);
        Assert.Contains("summary", error);
    }

    [Fact]
    public void TextFieldOver200CharsIsRejected()
    {
        var (edit, error) = Normalize(new UpdateCompanyRequest { City = new string('x', 201) });
        Assert.Null(edit);
        Assert.Contains("city", error);
    }

    [Fact]
    public void LeadingWhitespaceDoesNotCountTowardTheCap()
    {
        var (_, error) = Normalize(new UpdateCompanyRequest { City = "   " + new string('x', 200) });
        Assert.Null(error);
    }

    // ── website URL validation ───────────────────────────────────────────────

    [Theory]
    [InlineData("https://acme.example")]
    [InlineData("http://acme.example/careers")]
    [InlineData("https://sub.acme.example:8443/path?q=1")]
    public void ValidHttpUrlsAreAccepted(string url)
    {
        var (edit, error) = Normalize(new UpdateCompanyRequest { WebsiteUrl = url });
        Assert.Null(error);
        Assert.NotNull(edit!.WebsiteUrl);
    }

    [Theory]
    [InlineData("javascript:alert(1)")]
    [InlineData("ftp://acme.example")]
    [InlineData("acme.example")]
    [InlineData("not a url")]
    [InlineData("data:text/html,<script>")]
    public void NonHttpOrMalformedUrlsAreRejected(string url)
    {
        var (edit, error) = Normalize(new UpdateCompanyRequest { WebsiteUrl = url });
        Assert.Null(edit);
        Assert.Contains("websiteUrl", error);
    }

    [Fact]
    public void BlankWebsiteUrlClearsWithoutError()
    {
        var (edit, error) = Normalize(new UpdateCompanyRequest { WebsiteUrl = "  " });
        Assert.Null(error);
        Assert.Null(edit!.WebsiteUrl);
    }

    // ── list fields ──────────────────────────────────────────────────────────

    [Fact]
    public void ListTrimsAndDropsEmptyEntries()
    {
        var (edit, error) = Normalize(new UpdateCompanyRequest
        {
            Locations = ["  Amsterdam ", "", "   ", "Delft"],
        });
        Assert.Null(error);
        Assert.Equal(["Amsterdam", "Delft"], edit!.Locations!);
    }

    [Fact]
    public void ListDeduplicatesCaseInsensitiveKeepingFirst()
    {
        var (edit, error) = Normalize(new UpdateCompanyRequest
        {
            TechStackTags = ["Go", "go", "GO", "Rust"],
        });
        Assert.Null(error);
        Assert.Equal(["Go", "Rust"], edit!.TechStackTags!);
    }

    [Fact]
    public void ListThatEmptiesOutBecomesNull()
    {
        var (edit, error) = Normalize(new UpdateCompanyRequest { FunctionalTags = ["", "  "] });
        Assert.Null(error);
        Assert.Null(edit!.FunctionalTags);
    }

    [Fact]
    public void NullListStaysNull()
    {
        var (edit, error) = Normalize(new UpdateCompanyRequest { Locations = null });
        Assert.Null(error);
        Assert.Null(edit!.Locations);
    }

    [Fact]
    public void ListEntryOver100CharsIsRejected()
    {
        var (edit, error) = Normalize(new UpdateCompanyRequest
        {
            TechStackTags = ["ok", new string('x', 101)],
        });
        Assert.Null(edit);
        Assert.Contains("techStackTags", error);
    }

    [Fact]
    public void ListWithMoreThan50EntriesIsRejected()
    {
        var many = Enumerable.Range(0, 51).Select(i => $"tag{i}").ToArray();
        var (edit, error) = Normalize(new UpdateCompanyRequest { FunctionalTags = many });
        Assert.Null(edit);
        Assert.Contains("functionalTags", error);
    }

    [Fact]
    public void Exactly50EntriesIsAccepted()
    {
        var fifty = Enumerable.Range(0, 50).Select(i => $"tag{i}").ToArray();
        var (edit, error) = Normalize(new UpdateCompanyRequest { FunctionalTags = fifty });
        Assert.Null(error);
        Assert.Equal(50, edit!.FunctionalTags!.Length);
    }

    [Fact]
    public void DuplicatesDoNotCountTowardThe50Cap()
    {
        var raw = Enumerable.Range(0, 50).Select(i => "same").ToArray();
        var (edit, error) = Normalize(new UpdateCompanyRequest { Locations = raw });
        Assert.Null(error);
        Assert.Equal(["same"], edit!.Locations!);
    }

    // ── a realistic full payload ─────────────────────────────────────────────

    [Fact]
    public void FullValidPayloadRoundTrips()
    {
        var (edit, error) = Normalize(new UpdateCompanyRequest
        {
            Summary = "A logistics scale-up.",
            City = "Rotterdam",
            Locations = ["Rotterdam", "Delft"],
            WebsiteUrl = "https://acme.example",
            CoreIndustry = "Logistics",
            TechStackTags = ["Go", "Kafka"],
            FunctionalTags = ["B2B"],
            WorkingLanguage = "English",
            CompanySize = "scaleup",
            RemotePolicy = "hybrid",
            ParentCompanyName = "Acme Holding",
            TargetMarket = "EU",
        });

        Assert.Null(error);
        Assert.Equal("Rotterdam", edit!.City);
        Assert.Equal(["Rotterdam", "Delft"], edit.Locations!);
        Assert.Equal("Logistics", edit.CoreIndustry);
        Assert.Equal("EU", edit.TargetMarket);
    }
}
