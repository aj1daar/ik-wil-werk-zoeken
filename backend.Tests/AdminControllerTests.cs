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

    // ── name ─────────────────────────────────────────────────────────────────

    [Fact]
    public void NameIsTrimmed()
    {
        var (edit, error) = Normalize(new UpdateCompanyRequest { Name = "  Acme Holding  " });

        Assert.Null(error);
        Assert.Equal("Acme Holding", edit!.Name);
    }

    [Fact]
    public void OmittedNameStaysNullSoTheCurrentNameIsKept()
    {
        var (edit, error) = Normalize(new UpdateCompanyRequest { City = "Utrecht" });

        Assert.Null(error);
        Assert.Null(edit!.Name);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("\t\n")]
    public void BlankNameIsRejected(string value)
    {
        var (edit, error) = Normalize(new UpdateCompanyRequest { Name = value });

        Assert.Null(edit);
        Assert.Equal("name must not be blank", error);
    }

    [Fact]
    public void NameAt200CharsIsAccepted()
    {
        var (edit, error) = Normalize(new UpdateCompanyRequest { Name = new string('a', 200) });

        Assert.Null(error);
        Assert.Equal(200, edit!.Name!.Length);
    }

    [Fact]
    public void NameOver200CharsIsRejected()
    {
        var (edit, error) = Normalize(new UpdateCompanyRequest { Name = new string('a', 201) });

        Assert.Null(edit);
        Assert.Equal("name must not exceed 200 characters", error);
    }

    // ── merge request normalization ──────────────────────────────────────────

    private static (string? targetId, string[]? sourceIds, string? error) NormalizeMerge(MergeCompaniesRequest? body) =>
        AdminController.NormalizeMerge(body);

    [Fact]
    public void MergeNullBodyIsRejected()
    {
        var (_, _, error) = NormalizeMerge(null);
        Assert.Equal("request body is required", error);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void MergeBlankTargetIsRejected(string? targetId)
    {
        var (_, _, error) = NormalizeMerge(new MergeCompaniesRequest { TargetId = targetId!, SourceIds = ["a"] });
        Assert.Equal("targetId is required", error);
    }

    [Fact]
    public void MergeWithoutSourcesIsRejected()
    {
        var (_, _, error) = NormalizeMerge(new MergeCompaniesRequest { TargetId = "t", SourceIds = [] });
        Assert.Equal("sourceIds must contain at least one company", error);
    }

    [Fact]
    public void MergeWithOnlyBlankSourcesIsRejected()
    {
        var (_, _, error) = NormalizeMerge(new MergeCompaniesRequest { TargetId = "t", SourceIds = ["", "  ", null!] });
        Assert.Equal("sourceIds must contain at least one company", error);
    }

    [Fact]
    public void MergeIntoItselfIsRejected()
    {
        var (_, _, error) = NormalizeMerge(new MergeCompaniesRequest { TargetId = "t", SourceIds = ["a", " t "] });
        Assert.Equal("a company cannot be merged into itself", error);
    }

    [Fact]
    public void MergeTrimsAndDeduplicatesSourceIds()
    {
        var (targetId, sourceIds, error) = NormalizeMerge(new MergeCompaniesRequest
        {
            TargetId = "  t  ",
            SourceIds = [" a ", "a", "b", ""],
        });

        Assert.Null(error);
        Assert.Equal("t", targetId);
        Assert.Equal(["a", "b"], sourceIds!);
    }

    [Fact]
    public void MergeAt50SourcesIsAccepted()
    {
        var ids = Enumerable.Range(0, 50).Select(i => $"c{i}").ToArray();

        var (_, sourceIds, error) = NormalizeMerge(new MergeCompaniesRequest { TargetId = "t", SourceIds = ids });

        Assert.Null(error);
        Assert.Equal(50, sourceIds!.Length);
    }

    [Fact]
    public void MergeOver50SourcesIsRejected()
    {
        var ids = Enumerable.Range(0, 51).Select(i => $"c{i}").ToArray();

        var (_, _, error) = NormalizeMerge(new MergeCompaniesRequest { TargetId = "t", SourceIds = ids });

        Assert.Equal("at most 50 companies can be merged at once", error);
    }
}
