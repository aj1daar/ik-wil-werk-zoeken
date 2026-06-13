using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using backend.Models;
using Microsoft.Extensions.Logging;

namespace backend.Services;

public sealed class CompanyEnricher
{
    public const int CurrentVersion = 1;

    private const string Model = "gemini-2.0-flash";
    private const string GenerateEndpoint = $"v1beta/models/{Model}:generateContent";
    private const int BatchSize = 20;
    private const int MaxOutputTokens = 4096;

    private const string SystemPrompt =
        """
        You are a company research assistant. Given a JSON array of Dutch companies (each with "name" and "kvk"),
        return a JSON array of the SAME LENGTH AND ORDER — no other text, no markdown, no code fences.

        Each output element must have these exact keys:
        {
          "summary": "2-3 sentences about what the company does",
          "coreIndustry": "single broad industry label",
          "techStackTags": ["up to 6 technology or platform tags"],
          "functionalTags": ["up to 6 functional domain tags"],
          "workingLanguage": "English" or "Dutch" or "Mixed",
          "companySize": "startup" or "scaleup" or "mid" or "large" or "enterprise",
          "remotePolicy": "remote" or "hybrid" or "office" or "unknown",
          "parentCompanyName": "well-known parent brand name, or null if none",
          "websiteUrl": "https://... or null",
          "targetMarket": "B2B" or "B2C" or "B2G" or "Mixed"
        }

        coreIndustry examples: "Software & Technology", "Financial Services", "Healthcare", "Logistics"
        techStackTags examples: "Cloud", "AI/ML", "Java", "AWS", "SAP", ".NET", "Kubernetes"
        functionalTags examples: "B2B SaaS", "Consulting", "E-commerce", "R&D", "Staffing", "Fintech"
        companySize: startup < 50, scaleup 50-250, mid 250-1000, large 1000-5000, enterprise > 5000

        Output ONLY the JSON array, one element per input company, in the same order.
        """;

    private readonly IHttpClientFactory _http;
    private readonly ILogger<CompanyEnricher> _logger;

    public CompanyEnricher(IHttpClientFactory http, ILogger<CompanyEnricher> logger)
    {
        _http = http;
        _logger = logger;
    }

    public async Task<int> EnrichBatchAsync(IReadOnlyList<SponsorCompany> companies, CancellationToken ct = default)
    {
        var apiKey = Environment.GetEnvironmentVariable("GEMINI_API_KEY");
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            _logger.LogWarning("GEMINI_API_KEY not set — enrichment skipped for {Count} companies", companies.Count);
            return 0;
        }

        var enriched = 0;
        for (var i = 0; i < companies.Count; i += BatchSize)
        {
            if (ct.IsCancellationRequested) break;
            var batch = companies.Skip(i).Take(BatchSize).ToList();
            enriched += await EnrichOneBatchAsync(batch, apiKey, ct);
        }
        return enriched;
    }

    private async Task<int> EnrichOneBatchAsync(
        IReadOnlyList<SponsorCompany> batch, string apiKey, CancellationToken ct)
    {
        try
        {
            var inputArray = batch.Select(c => new AnonymousCompanyInput { Name = c.Name, Kvk = c.KvKNumber }).ToArray();
            var userText   = JsonSerializer.Serialize(inputArray, CompanyEnricherJsonContext.Default.AnonymousCompanyInputArray);

            var requestObj = new GeminiRequest
            {
                SystemInstruction = new GeminiContent { Parts = [new GeminiPart { Text = SystemPrompt }] },
                Contents =
                [
                    new GeminiContent { Role = "user", Parts = [new GeminiPart { Text = userText }] }
                ],
                GenerationConfig = new GeminiGenerationConfig
                {
                    ResponseMimeType = "application/json",
                    MaxOutputTokens  = MaxOutputTokens
                }
            };

            var requestJson = JsonSerializer.Serialize(requestObj, CompanyEnricherJsonContext.Default.GeminiRequest);

            using var client      = _http.CreateClient("gemini");
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
                    "Gemini API {Status} for batch of {Count}: {Body}",
                    (int)httpResponse.StatusCode, batch.Count,
                    body.Length > 200 ? body[..200] : body);
                return 0;
            }

            var apiResponse = await httpResponse.Content.ReadFromJsonAsync(
                CompanyEnricherJsonContext.Default.GeminiResponse, ct);

            var text = apiResponse?.Candidates.FirstOrDefault()?.Content?.Parts.FirstOrDefault()?.Text;
            if (string.IsNullOrWhiteSpace(text))
            {
                _logger.LogWarning("Empty response from Gemini for batch of {Count}", batch.Count);
                return 0;
            }

            var results = JsonSerializer.Deserialize(
                StripCodeFence(text), CompanyEnricherJsonContext.Default.CompanyEnrichmentResultArray);

            if (results is null)
            {
                _logger.LogWarning("Could not parse enrichment JSON array for batch of {Count}", batch.Count);
                return 0;
            }

            var count = 0;
            var now   = DateTimeOffset.UtcNow;
            for (var i = 0; i < Math.Min(results.Length, batch.Count); i++)
            {
                var r = results[i];
                if (r is null) continue;
                var c = batch[i];
                c.Summary           = r.Summary;
                c.CoreIndustry      = r.CoreIndustry;
                c.TechStackTags     = r.TechStackTags;
                c.FunctionalTags    = r.FunctionalTags;
                c.WorkingLanguage   = r.WorkingLanguage;
                c.CompanySize       = r.CompanySize;
                c.RemotePolicy      = r.RemotePolicy;
                c.ParentCompanyName = r.ParentCompanyName;
                c.WebsiteUrl        = r.WebsiteUrl;
                c.TargetMarket      = r.TargetMarket;
                c.EnrichedAt        = now;
                c.EnrichmentVersion = CurrentVersion;
                count++;
            }
            return count;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogError(ex, "Enrichment exception for batch of {Count}", batch.Count);
            return 0;
        }
    }

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

// ── Gemini API wire types ─────────────────────────────────────────────────────

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

internal sealed class AnonymousCompanyInput
{
    [JsonPropertyName("name")] public string Name { get; set; } = string.Empty;
    [JsonPropertyName("kvk")] public string Kvk { get; set; } = string.Empty;
}

internal sealed class CompanyEnrichmentResult
{
    [JsonPropertyName("summary")] public string? Summary { get; set; }
    [JsonPropertyName("coreIndustry")] public string? CoreIndustry { get; set; }
    [JsonPropertyName("techStackTags")] public string[]? TechStackTags { get; set; }
    [JsonPropertyName("functionalTags")] public string[]? FunctionalTags { get; set; }
    [JsonPropertyName("workingLanguage")] public string? WorkingLanguage { get; set; }
    [JsonPropertyName("companySize")] public string? CompanySize { get; set; }
    [JsonPropertyName("remotePolicy")] public string? RemotePolicy { get; set; }
    [JsonPropertyName("parentCompanyName")] public string? ParentCompanyName { get; set; }
    [JsonPropertyName("websiteUrl")] public string? WebsiteUrl { get; set; }
    [JsonPropertyName("targetMarket")] public string? TargetMarket { get; set; }
}

[JsonSerializable(typeof(GeminiRequest))]
[JsonSerializable(typeof(GeminiResponse))]
[JsonSerializable(typeof(CompanyEnrichmentResult))]
[JsonSerializable(typeof(CompanyEnrichmentResult[]))]
[JsonSerializable(typeof(AnonymousCompanyInput))]
[JsonSerializable(typeof(AnonymousCompanyInput[]))]
internal partial class CompanyEnricherJsonContext : JsonSerializerContext
{
}
