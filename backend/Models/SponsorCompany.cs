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

    // Additional office locations beyond the primary City — admin-entered only,
    // never touched by the LLM enrichment sweep.
    public string[]? Locations { get; set; }

    // LLM enrichment — populated asynchronously after IND sync
    public string? Summary { get; set; }
    public string? CoreIndustry { get; set; }
    public string[]? TechStackTags { get; set; }
    public string[]? FunctionalTags { get; set; }
    public string? WorkingLanguage { get; set; }
    public string? CompanySize { get; set; }
    public string? RemotePolicy { get; set; }
    public string? ParentCompanyName { get; set; }
    public string? WebsiteUrl { get; set; }
    public string? TargetMarket { get; set; }
    public DateTimeOffset? EnrichedAt { get; set; }
    public int EnrichmentVersion { get; set; } = 0;

    // Soft-delete: set when a KvK number disappears from the IND register
    public DateTimeOffset? RemovedAt { get; set; }
}
