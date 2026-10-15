using System.Text.Json.Serialization;

namespace backend.Models;

// One company as the extension needs it: enough to fill a suggestion row and to
// prefill the location, and nothing more. The web app can afford the whole
// register in memory; a side panel opened on a job page cannot, so this is the
// shape that travels per keystroke.
public sealed class SponsorLookupMatch
{
    [JsonPropertyName("id")]           public string  Id           { get; set; } = string.Empty;
    [JsonPropertyName("name")]         public string  Name         { get; set; } = string.Empty;
    [JsonPropertyName("city")]         public string? City         { get; set; }
    [JsonPropertyName("coreIndustry")] public string? CoreIndustry { get; set; }

    public static SponsorLookupMatch From(SponsorCompany c) => new()
    {
        Id           = c.Id,
        Name         = c.Name,
        City         = string.IsNullOrWhiteSpace(c.City) ? null : c.City,
        CoreIndustry = string.IsNullOrWhiteSpace(c.CoreIndustry) ? null : c.CoreIndustry,
    };
}

public sealed class SponsorLookupResponse
{
    [JsonPropertyName("query")] public string Query { get; set; } = string.Empty;

    // The company whose name or former name is exactly the query, if there is
    // one. Non-null is the HSM sponsor verdict: only live, unmerged companies are
    // ever returned, so a match means the register recognises them today.
    [JsonPropertyName("exact")] public SponsorLookupMatch? Exact { get; set; }

    [JsonPropertyName("matches")] public SponsorLookupMatch[] Matches { get; set; } = [];
}
