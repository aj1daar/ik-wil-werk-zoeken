using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using backend.Models;
using Microsoft.Extensions.Logging;

namespace backend.Services;

public sealed class CompanyEnricher
{
    private const string Model = "gemini-2.0-flash";
    private const string GenerateEndpoint = $"v1beta/models/{Model}:generateContent";
    private const int MaxOutputTokens = 512;

    private const string SystemPrompt =
        """
        You are a company research assistant. Given a Dutch company name and KvK (Chamber of Commerce) number,
        return a single JSON object — no other text, no markdown — with these exact keys:

        {
          "summary": "2-3 sentences about what the company does",
          "coreIndustry": "single broad industry label",
          "techStackTags": ["up to 6 technology or platform tags"],
          "functionalTags": ["up to 6 functional domain tags"]
        }

        coreIndustry examples: "Software & Technology", "Financial Services", "Healthcare", "Logistics", "Manufacturing"
        techStackTags examples: "Cloud", "AI/ML", "Java", "AWS", "SAP", ".NET", "Kubernetes"
        functionalTags examples: "B2B SaaS", "Consulting", "E-commerce", "R&D", "Staffing", "Fintech"

        If the company is not well-known, infer from the name. Return only the JSON object.
        """;

    private readonly IHttpClientFactory _http;
    private readonly ILogger<CompanyEnricher> _logger;

    public CompanyEnricher(IHttpClientFactory http, ILogger<CompanyEnricher> logger)
    {
        _http = http;
        _logger = logger;
    }

    public async Task<bool> EnrichAsync(SponsorCompany company, CancellationToken ct = default)
    {
        var apiKey = Environment.GetEnvironmentVariable("GEMINI_API_KEY");
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            _logger.LogWarning("GEMINI_API_KEY not set — enrichment skipped for {Name}", company.Name);
            return false;
        }

        try
        {
            var requestObj = new GeminiRequest
            {
                SystemInstruction = new GeminiContent
                {
                    Parts = [new GeminiPart { Text = SystemPrompt }]
                },
                Contents =
                [
                    new GeminiContent
                    {
                        Role = "user",
                        Parts = [new GeminiPart { Text = $"Company name: {company.Name}\nKvK: {company.KvKNumber}" }]
                    }
                ],
                GenerationConfig = new GeminiGenerationConfig
                {
                    ResponseMimeType = "application/json",
                    MaxOutputTokens = MaxOutputTokens
                }
            };

            var requestJson = JsonSerializer.Serialize(requestObj, CompanyEnricherJsonContext.Default.GeminiRequest);

            using var client = _http.CreateClient("gemini");
            using var httpRequest = new HttpRequestMessage(HttpMethod.Post, GenerateEndpoint)
            {
                Content = new StringContent(requestJson, System.Text.Encoding.UTF8, "application/json")
            };
            httpRequest.Headers.Add("x-goog-api-key", apiKey);

            using var httpResponse = await client.SendAsync(httpRequest, ct);

            if (!httpResponse.IsSuccessStatusCode)
            {
                var body = await httpResponse.Content.ReadAsStringAsync(ct);
                _logger.LogWarning(
                    "Gemini API {Status} for {Name}: {Body}",
                    (int)httpResponse.StatusCode, company.Name,
                    body.Length > 200 ? body[..200] : body);
                return false;
            }

            var apiResponse = await httpResponse.Content.ReadFromJsonAsync(
                CompanyEnricherJsonContext.Default.GeminiResponse, ct);

            var text = apiResponse?.Candidates.FirstOrDefault()?.Content?.Parts.FirstOrDefault()?.Text;
            if (string.IsNullOrWhiteSpace(text))
            {
                _logger.LogWarning("Empty response from Gemini for {Name}", company.Name);
                return false;
            }

            // responseMimeType: application/json should return clean JSON, but strip fences defensively
            var result = JsonSerializer.Deserialize(
                StripCodeFence(text), CompanyEnricherJsonContext.Default.CompanyEnrichmentResult);

            if (result is null)
            {
                _logger.LogWarning("Could not parse enrichment JSON for {Name}", company.Name);
                return false;
            }

            company.Summary = result.Summary;
            company.CoreIndustry = result.CoreIndustry;
            company.TechStackTags = result.TechStackTags;
            company.FunctionalTags = result.FunctionalTags;
            company.EnrichedAt = DateTimeOffset.UtcNow;
            return true;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogError(ex, "Enrichment exception for {Name}", company.Name);
            return false;
        }
    }

    // Lives in a non-async method so ReadOnlySpan<char> is allowed (C# 12 constraint).
    private static string StripCodeFence(string text)
    {
        var span = text.AsSpan().Trim();
        if (!span.StartsWith("```"))
            return span.ToString();

        var newline = span.IndexOf('\n');
        var closing = span.LastIndexOf("```");
        if (newline >= 0 && closing > newline)
            return span[(newline + 1)..closing].Trim().ToString();

        return span.ToString();
    }
}

// ── Gemini API wire types ────────────────────────────────────────────────────

internal sealed class GeminiRequest
{
    [JsonPropertyName("systemInstruction")] public GeminiContent? SystemInstruction { get; set; }
    [JsonPropertyName("contents")] public GeminiContent[] Contents { get; set; } = [];
    [JsonPropertyName("generationConfig")] public GeminiGenerationConfig? GenerationConfig { get; set; }
}

internal sealed class GeminiContent
{
    [JsonPropertyName("parts")] public GeminiPart[] Parts { get; set; } = [];
    [JsonPropertyName("role")] public string? Role { get; set; }
}

internal sealed class GeminiPart
{
    [JsonPropertyName("text")] public string Text { get; set; } = string.Empty;
}

internal sealed class GeminiGenerationConfig
{
    [JsonPropertyName("responseMimeType")] public string ResponseMimeType { get; set; } = "application/json";
    [JsonPropertyName("maxOutputTokens")] public int MaxOutputTokens { get; set; }
}

internal sealed class GeminiResponse
{
    [JsonPropertyName("candidates")] public GeminiCandidate[] Candidates { get; set; } = [];
}

internal sealed class GeminiCandidate
{
    [JsonPropertyName("content")] public GeminiContent? Content { get; set; }
    [JsonPropertyName("finishReason")] public string? FinishReason { get; set; }
}

internal sealed class CompanyEnrichmentResult
{
    [JsonPropertyName("summary")] public string? Summary { get; set; }
    [JsonPropertyName("coreIndustry")] public string? CoreIndustry { get; set; }
    [JsonPropertyName("techStackTags")] public string[]? TechStackTags { get; set; }
    [JsonPropertyName("functionalTags")] public string[]? FunctionalTags { get; set; }
}

[JsonSerializable(typeof(GeminiRequest))]
[JsonSerializable(typeof(GeminiResponse))]
[JsonSerializable(typeof(CompanyEnrichmentResult))]
internal partial class CompanyEnricherJsonContext : JsonSerializerContext
{
}
