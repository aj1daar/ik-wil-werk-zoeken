using backend;
using Xunit;

namespace backend.Tests;

public sealed class SeedDataTests
{
    [Fact]
    public void AllCompaniesHaveRequiredFields()
    {
        foreach (var c in SeedData.Companies)
        {
            Assert.False(string.IsNullOrWhiteSpace(c.Id),        $"{c.Name}: Id is empty");
            Assert.False(string.IsNullOrWhiteSpace(c.Name),      $"{c.Id}: Name is empty");
            Assert.False(string.IsNullOrWhiteSpace(c.KvKNumber), $"{c.Name}: KvKNumber is empty");
            Assert.True(c.IsIndRecognizedSponsor,                 $"{c.Name}: should be IND recognised");
        }
    }

    [Fact]
    public void AllCompanyIdsAreUnique()
    {
        var ids = SeedData.Companies.Select(c => c.Id).ToList();
        Assert.Equal(ids.Count, ids.Distinct().Count());
    }

    [Fact]
    public void AllCompaniesHaveEnrichmentData()
    {
        foreach (var c in SeedData.Companies)
        {
            Assert.False(string.IsNullOrWhiteSpace(c.Summary),      $"{c.Name}: Summary is empty");
            Assert.False(string.IsNullOrWhiteSpace(c.CoreIndustry), $"{c.Name}: CoreIndustry is empty");
            Assert.NotEmpty(c.TechStackTags!);
            Assert.NotEmpty(c.FunctionalTags!);
            Assert.NotNull(c.EnrichedAt);
        }
    }

    [Fact]
    public void SevenCompaniesSeeded() =>
        Assert.Equal(7, SeedData.Companies.Length);
}
