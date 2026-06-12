namespace backend.Models;

public sealed class SponsorCompany
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Name { get; set; } = string.Empty;
    public string KvKNumber { get; set; } = string.Empty;
    public bool IsIndRecognizedSponsor { get; set; }
    public DateTimeOffset LastVerifiedAt { get; set; } = DateTimeOffset.UtcNow;

    // Captured from IND register (3rd HTML column = Place)
    public string? City { get; set; }

    // LLM enrichment — populated asynchronously after IND sync
    public string? Summary { get; set; }
    public string? CoreIndustry { get; set; }
    public string[]? TechStackTags { get; set; }
    public string[]? FunctionalTags { get; set; }
    public DateTimeOffset? EnrichedAt { get; set; }
}
