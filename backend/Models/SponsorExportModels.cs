using System.Text.Json.Serialization;

namespace backend.Models;

// The machine-to-machine view of the sponsor register, consumed by
// nl-tech-jobs-pipeline. Separate from SponsorCompany on purpose: the storage
// model is free to change, this shape is a contract with another repository.
//
// Every property names itself explicitly rather than relying on the camelCase
// policy. "KvKNumber" would otherwise serialise as "kvKNumber", and a naming
// policy is a global setting one unrelated change can flip.
public sealed class SponsorExportResponse
{
    // Bumped only on a breaking change: a field removed or renamed, or the
    // meaning of an existing field changed. Adding a field is not breaking.
    [JsonPropertyName("schemaVersion")] public int SchemaVersion { get; set; } = 1;
    [JsonPropertyName("generatedAt")]   public DateTimeOffset GeneratedAt { get; set; }
    [JsonPropertyName("count")]         public int Count { get; set; }
    [JsonPropertyName("sponsors")]      public SponsorExportRow[] Sponsors { get; set; } = [];
}

public sealed class SponsorExportRow
{
    [JsonPropertyName("id")]                     public string Id { get; set; } = string.Empty;
    [JsonPropertyName("name")]                   public string Name { get; set; } = string.Empty;
    [JsonPropertyName("kvkNumber")]              public string? KvkNumber { get; set; }
    [JsonPropertyName("isIndRecognizedSponsor")] public bool IsIndRecognizedSponsor { get; set; }
    [JsonPropertyName("lastVerifiedAt")]         public DateTimeOffset LastVerifiedAt { get; set; }
    [JsonPropertyName("removedAt")]              public DateTimeOffset? RemovedAt { get; set; }
    [JsonPropertyName("mergedIntoId")]           public string? MergedIntoId { get; set; }
    [JsonPropertyName("aliasNames")]             public string[]? AliasNames { get; set; }
    [JsonPropertyName("city")]                   public string? City { get; set; }
    [JsonPropertyName("locations")]              public string[]? Locations { get; set; }
    [JsonPropertyName("websiteUrl")]             public string? WebsiteUrl { get; set; }
    [JsonPropertyName("coreIndustry")]           public string? CoreIndustry { get; set; }
    [JsonPropertyName("techStackTags")]          public string[]? TechStackTags { get; set; }
    [JsonPropertyName("workingLanguage")]        public string? WorkingLanguage { get; set; }
    [JsonPropertyName("companySize")]            public string? CompanySize { get; set; }
    [JsonPropertyName("remotePolicy")]           public string? RemotePolicy { get; set; }
    [JsonPropertyName("enrichedAt")]             public DateTimeOffset? EnrichedAt { get; set; }
    [JsonPropertyName("enrichmentVersion")]      public int? EnrichmentVersion { get; set; }

    // Unknown has to stay unknown on the wire. The database cannot express that
    // for a non-nullable text column, so an empty or whitespace-only string
    // becomes null here, and so does an empty array: "we hold nothing" and "we
    // know the list is empty" are the same statement and neither is a value.
    public static SponsorExportRow From(SponsorCompany c) => new()
    {
        Id                     = c.Id,
        Name                   = c.Name,
        KvkNumber              = Text(c.KvKNumber),
        IsIndRecognizedSponsor = c.IsIndRecognizedSponsor,
        LastVerifiedAt         = c.LastVerifiedAt,
        RemovedAt              = c.RemovedAt,
        MergedIntoId           = Text(c.MergedIntoId),
        AliasNames             = List(c.AliasNames),
        City                   = Text(c.City),
        Locations              = List(c.Locations),
        WebsiteUrl             = Text(c.WebsiteUrl),
        CoreIndustry           = Text(c.CoreIndustry),
        TechStackTags          = List(c.TechStackTags),
        WorkingLanguage        = Text(c.WorkingLanguage),
        CompanySize            = Text(c.CompanySize),
        RemotePolicy           = Text(c.RemotePolicy),
        EnrichedAt             = c.EnrichedAt,
        // 0 means no version was recorded, either because enrichment never ran or
        // because the row predates versioning (the seeded companies are like this:
        // an EnrichedAt with a zero version). Unknown, so null, not a number a
        // consumer would compare against the version it already holds.
        EnrichmentVersion      = c.EnrichmentVersion == 0 ? null : c.EnrichmentVersion,
    };

    private static string? Text(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value;

    // Entries that are blank are dropped; a list left with nothing in it is null.
    private static string[]? List(string[]? values)
    {
        if (values is null) return null;
        var kept = values.Where(v => !string.IsNullOrWhiteSpace(v)).ToArray();
        return kept.Length == 0 ? null : kept;
    }
}
