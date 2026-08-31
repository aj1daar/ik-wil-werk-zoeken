using System.Text.Json.Serialization;

namespace backend.Models;

public sealed class CompanyListsResponse
{
    [JsonPropertyName("interested")] public string[] Interested { get; set; } = [];
    [JsonPropertyName("hidden")]     public string[] Hidden     { get; set; } = [];
}

public sealed class SetCompanyListRequest
{
    // "interested" | "hidden" | "none" (none clears any entry for the company)
    [JsonPropertyName("kind")] public string Kind { get; set; } = string.Empty;
}
