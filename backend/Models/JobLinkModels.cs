using System.Text.Json.Serialization;

namespace backend.Models;

public sealed class ParseJobLinkRequest
{
    [JsonPropertyName("url")] public string Url { get; set; } = string.Empty;
}

public sealed class ParseJobLinkResponse
{
    [JsonPropertyName("company")]   public string?   Company   { get; set; }
    [JsonPropertyName("position")]  public string?   Position  { get; set; }
    [JsonPropertyName("locations")] public string[]  Locations { get; set; } = [];

    // Where the values came from: "jsonld" | "opengraph" | "title" | "url" | "none"
    [JsonPropertyName("source")]    public string    Source    { get; set; } = "none";
}
