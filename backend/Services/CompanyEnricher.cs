using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using backend.Models;
using Microsoft.Extensions.Logging;

namespace backend.Services;

public sealed class CompanyEnricher
{
    public const int CurrentVersion = 4;

    private const string Model = "gemini-2.0-flash";
    private const string GenerateEndpoint = $"v1beta/models/{Model}:generateContent";
    private const int BatchSize = 20;
    private const int MaxOutputTokens = 8192;

    private static readonly HashSet<string> ValidWorkingLanguages = new(StringComparer.Ordinal) { "English", "Dutch", "Mixed" };
    private static readonly HashSet<string> ValidCompanySizes = new(StringComparer.Ordinal) { "startup", "scaleup", "mid", "large", "enterprise" };
    private static readonly HashSet<string> ValidRemotePolicies = new(StringComparer.Ordinal) { "remote", "hybrid", "office", "unknown" };
    private static readonly HashSet<string> ValidTargetMarkets = new(StringComparer.Ordinal) { "B2B", "B2C", "B2G", "Mixed" };

    internal static readonly HashSet<string> ValidTechStackTags = new(StringComparer.Ordinal)
    {
        ".NET", "AI/ML", "Android", "Angular", "API-first", "AWS", "Azure",
        "Big Data", "C#", "C++", "Cloud", "Computer Vision", "Data Engineering",
        "Distributed Systems", "Docker", "Elasticsearch", "Embedded", "Flutter",
        "Go", "GraphQL", "iOS", "Java", "JavaScript", "Kafka", "Kotlin",
        "Kubernetes", "Linux", "MATLAB", "Microservices", "Node.js", "PHP",
        "PostgreSQL", "Python", "React", "REST API", "Ruby", "Rust", "SAP",
        "Scala", "Spark", "SQL", "Swift", "Terraform", "TypeScript", "Unity", "Vue.js",
    };

    internal static readonly HashSet<string> ValidFunctionalTags = new(StringComparer.Ordinal)
    {
        "AgriTech", "Analytics", "Automotive Tech", "B2B SaaS", "BioTech",
        "CleanTech", "Consulting", "CyberSecurity", "Deep Tech", "E-commerce",
        "Energy", "Enterprise", "Financial Services", "Fintech", "Food Tech",
        "Gaming", "Geospatial", "Hardware", "Healthcare Tech", "High-Tech",
        "IoT", "Logistics", "Manufacturing", "Marketplace", "MedTech",
        "Payments", "Platform", "R&D", "SaaS", "Semiconductor",
        "SME", "Software & Technology", "Staffing", "Sustainability",
        "Telecom", "Travel & Hospitality",
    };

    private const string SystemPrompt =
        """
        You are a company research assistant. Given a JSON array of Dutch companies (each with "name" and "kvk"),
        return a JSON array of the SAME LENGTH AND ORDER — no other text, no markdown, no code fences.

        LANGUAGE RULE: ALL text values (summary, coreIndustry, parentCompanyName, city) MUST be written in English.
        Do not use Dutch words or sentences anywhere in the output.

        Each output element must have these exact keys:
        {
          "confidence": "high" | "medium" | "low",
          "summary": "2-3 English sentences about what the company does, or null if you have no reliable knowledge",
          "coreIndustry": "single broad English industry label, or null if unknown",
          "techStackTags": [up to 8 tags from the TECH STACK list below] or [],
          "functionalTags": [up to 6 tags from the FUNCTIONAL list below] or [],
          "workingLanguage": "English" | "Dutch" | "Mixed" | null,
          "companySize": "startup" | "scaleup" | "mid" | "large" | "enterprise" | null,
          "remotePolicy": "remote" | "hybrid" | "office" | "unknown",
          "parentCompanyName": "well-known parent brand name in English, or null if none",
          "websiteUrl": "https://... or null",
          "targetMarket": "B2B" | "B2C" | "B2G" | "Mixed" | null,
          "city": "primary Dutch city of the company's headquarters, or null if uncertain"
        }

        ALLOWED TECH STACK TAGS — use ONLY these exact strings (any other value will be discarded):
        ".NET", "AI/ML", "Android", "Angular", "API-first", "AWS", "Azure",
        "Big Data", "C#", "C++", "Cloud", "Computer Vision", "Data Engineering",
        "Distributed Systems", "Docker", "Elasticsearch", "Embedded", "Flutter",
        "Go", "GraphQL", "iOS", "Java", "JavaScript", "Kafka", "Kotlin",
        "Kubernetes", "Linux", "MATLAB", "Microservices", "Node.js", "PHP",
        "PostgreSQL", "Python", "React", "REST API", "Ruby", "Rust", "SAP",
        "Scala", "Spark", "SQL", "Swift", "Terraform", "TypeScript", "Unity", "Vue.js"

        ALLOWED FUNCTIONAL TAGS — use ONLY these exact strings (any other value will be discarded):
        "AgriTech", "Analytics", "Automotive Tech", "B2B SaaS", "BioTech",
        "CleanTech", "Consulting", "CyberSecurity", "Deep Tech", "E-commerce",
        "Energy", "Enterprise", "Financial Services", "Fintech", "Food Tech",
        "Gaming", "Geospatial", "Hardware", "Healthcare Tech", "High-Tech",
        "IoT", "Logistics", "Manufacturing", "Marketplace", "MedTech",
        "Payments", "Platform", "R&D", "SaaS", "Semiconductor",
        "SME", "Software & Technology", "Staffing", "Sustainability",
        "Telecom", "Travel & Hospitality"

        STRICT RULES — invalid values will be discarded server-side:
        - confidence: "high" = reliable, specific knowledge; "medium" = partial; "low" = guessing most fields.
        - workingLanguage MUST be exactly one of: "English", "Dutch", "Mixed" — or null.
        - companySize MUST be exactly one of: "startup", "scaleup", "mid", "large", "enterprise" — or null.
        - remotePolicy MUST be exactly one of: "remote", "hybrid", "office", "unknown". Never null.
        - targetMarket MUST be exactly one of: "B2B", "B2C", "B2G", "Mixed" — or null.
        - websiteUrl: only include if CERTAIN it is the company's official, currently-active website. Prefer null over a guess.
        - city: only include if CERTAIN this is the company's primary HQ city in the Netherlands (e.g. "Amsterdam",
                "Rotterdam", "Eindhoven", "Utrecht", "Delft"). Prefer null over a guess. Never invent a city.
        - companySize guide: startup < 50 employees, scaleup 50–250, mid 250–1000, large 1000–5000, enterprise > 5000.
        - coreIndustry: one broad English label, e.g. "Software & Technology", "Financial Services", "Healthcare".

        Self-check before outputting: (1) every tag is from the allowed list, (2) all text is in English.
        Output ONLY the JSON array.
        """;

    private const string RefinementPrompt =
        """
        Some companies had invalid enum values in a previous enrichment. Correct ONLY the constrained fields.
        Return a JSON array — one entry per input company — with ONLY these keys:
          { "name", "workingLanguage", "companySize", "remotePolicy", "targetMarket" }

        Allowed values (use null if genuinely unknown):
        - workingLanguage: "English" | "Dutch" | "Mixed" | null
        - companySize: "startup" | "scaleup" | "mid" | "large" | "enterprise" | null
        - remotePolicy: "remote" | "hybrid" | "office" | "unknown"  (never null)
        - targetMarket: "B2B" | "B2C" | "B2G" | "Mixed" | null

        If unsure, use null rather than guess. Output ONLY the JSON array.
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
            var inputArray = batch
                .Select(c => new AnonymousCompanyInput { Name = c.Name, Kvk = c.KvKNumber })
                .ToArray();
            var userText = JsonSerializer.Serialize(
                inputArray, CompanyEnricherJsonContext.Default.AnonymousCompanyInputArray);

            var text = await CallGeminiAsync(SystemPrompt, userText, apiKey, ct);
            if (text is null)
            {
                _logger.LogWarning("Empty response from Gemini for batch of {Count}", batch.Count);
                return 0;
            }

            var results = JsonSerializer.Deserialize(
                StripCodeFence(text), CompanyEnricherJsonContext.Default.CompanyEnrichmentResultArray);

            if (results is null)
            {
                _logger.LogWarning("Could not parse enrichment JSON for batch of {Count}", batch.Count);
                return 0;
            }

            // Identify companies with invalid enum fields and ask Gemini to correct them
            var toRefine = new List<(int Idx, CompanyEnrichmentResult Result, string[] InvalidFields)>();
            for (var i = 0; i < Math.Min(results.Length, batch.Count); i++)
            {
                if (results[i] is not { } r) continue;
                var invalid = GetInvalidEnumFields(r);
                if (invalid.Length > 0)
                    toRefine.Add((i, r, invalid));
            }

            if (toRefine.Count > 0)
            {
                var corrections = await RefineEnumFieldsAsync(batch, toRefine, apiKey, ct);
                foreach (var (idx, r, _) in toRefine)
                {
                    if (!corrections.TryGetValue(idx, out var fix)) continue;
                    if (fix.WorkingLanguage is not null) r.WorkingLanguage = fix.WorkingLanguage;
                    if (fix.CompanySize is not null) r.CompanySize = fix.CompanySize;
                    if (fix.RemotePolicy is not null) r.RemotePolicy = fix.RemotePolicy;
                    if (fix.TargetMarket is not null) r.TargetMarket = fix.TargetMarket;
                }
            }

            // Apply results; collect companies whose URLs need validation
            var toValidateUrl = new List<SponsorCompany>();
            var count = 0;
            var now = DateTimeOffset.UtcNow;

            for (var i = 0; i < Math.Min(results.Length, batch.Count); i++)
            {
                if (results[i] is not { } r) continue;
                var c = batch[i];

                c.EnrichedAt = now;
                c.EnrichmentVersion = CurrentVersion;

                // Low-confidence: mark enriched so we don't retry, but don't write field data
                if (string.Equals(r.Confidence, "low", StringComparison.OrdinalIgnoreCase))
                {
                    _logger.LogDebug("Low-confidence enrichment for {Company} — fields skipped", c.Name);
                    count++;
                    continue;
                }

                c.Summary = r.Summary;
                c.CoreIndustry = r.CoreIndustry;
                c.TechStackTags = FilterTags(r.TechStackTags, ValidTechStackTags);
                c.FunctionalTags = FilterTags(r.FunctionalTags, ValidFunctionalTags);
                c.WorkingLanguage = ValidateEnum(r.WorkingLanguage, ValidWorkingLanguages);
                c.CompanySize = ValidateEnum(r.CompanySize, ValidCompanySizes);
                c.RemotePolicy = ValidateEnum(r.RemotePolicy, ValidRemotePolicies) ?? "unknown";
                c.ParentCompanyName = r.ParentCompanyName;
                c.WebsiteUrl = r.WebsiteUrl;
                c.TargetMarket = ValidateEnum(r.TargetMarket, ValidTargetMarkets);
                if (string.IsNullOrEmpty(c.City) && !string.IsNullOrEmpty(r.City))
                    c.City = r.City;
                count++;

                if (!string.IsNullOrEmpty(r.WebsiteUrl))
                    toValidateUrl.Add(c);
            }

            // Validate all URLs in parallel (each has a 5-second timeout)
            if (toValidateUrl.Count > 0)
            {
                await Task.WhenAll(toValidateUrl.Select(async c =>
                {
                    c.WebsiteUrl = await ValidateUrlAsync(c.WebsiteUrl, ct);
                }));
            }

            return count;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogError(ex, "Enrichment exception for batch of {Count}", batch.Count);
            return 0;
        }
    }

    private async Task<Dictionary<int, EnrichmentRefinementResult>> RefineEnumFieldsAsync(
        IReadOnlyList<SponsorCompany> batch,
        List<(int Idx, CompanyEnrichmentResult Result, string[] InvalidFields)> toRefine,
        string apiKey, CancellationToken ct)
    {
        var corrections = new Dictionary<int, EnrichmentRefinementResult>();
        try
        {
            var inputs = toRefine
                .Select(t => new RefinementInput
                {
                    Name = batch[t.Idx].Name,
                    Kvk = batch[t.Idx].KvKNumber,
                    InvalidFields = t.InvalidFields,
                })
                .ToArray();

            var userText = JsonSerializer.Serialize(
                inputs, CompanyEnricherJsonContext.Default.RefinementInputArray);
            var text = await CallGeminiAsync(RefinementPrompt, userText, apiKey, ct);
            if (text is null) return corrections;

            var refined = JsonSerializer.Deserialize(
                StripCodeFence(text), CompanyEnricherJsonContext.Default.EnrichmentRefinementResultArray);
            if (refined is null) return corrections;

            for (var i = 0; i < Math.Min(refined.Length, toRefine.Count); i++)
            {
                if (refined[i] is not { } fix) continue;
                corrections[toRefine[i].Idx] = new EnrichmentRefinementResult
                {
                    WorkingLanguage = ValidateEnum(fix.WorkingLanguage, ValidWorkingLanguages),
                    CompanySize = ValidateEnum(fix.CompanySize, ValidCompanySizes),
                    RemotePolicy = ValidateEnum(fix.RemotePolicy, ValidRemotePolicies),
                    TargetMarket = ValidateEnum(fix.TargetMarket, ValidTargetMarkets),
                };
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogWarning(ex, "Enum refinement call failed for {Count} companies", toRefine.Count);
        }
        return corrections;
    }

    private async Task<string?> CallGeminiAsync(
        string systemPrompt, string userText, string apiKey, CancellationToken ct)
    {
        var requestObj = new GeminiRequest
        {
            SystemInstruction = new GeminiContent { Parts = [new GeminiPart { Text = systemPrompt }] },
            Contents =
            [
                new GeminiContent { Role = "user", Parts = [new GeminiPart { Text = userText }] }
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
            _logger.LogWarning("Gemini API {Status}: {Body}",
                (int)httpResponse.StatusCode,
                body.Length > 200 ? body[..200] : body);
            return null;
        }

        var apiResponse = await httpResponse.Content.ReadFromJsonAsync(
            CompanyEnricherJsonContext.Default.GeminiResponse, ct);
        var text = apiResponse?.Candidates.FirstOrDefault()?.Content?.Parts.FirstOrDefault()?.Text;
        return string.IsNullOrWhiteSpace(text) ? null : text;
    }

    private async Task<string?> ValidateUrlAsync(string? url, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(url)) return null;
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) ||
            (uri.Scheme != "https" && uri.Scheme != "http"))
            return null;

        try
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(5));

            using var client = _http.CreateClient();
            using var req = new HttpRequestMessage(HttpMethod.Head, url);
            req.Headers.TryAddWithoutValidation("User-Agent", "Mozilla/5.0 (compatible; IWWZ/1.0)");
            using var resp = await client.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, cts.Token);

            var status = (int)resp.StatusCode;
            // 2xx/3xx: valid; 403/405/4xx: bot-blocked but URL exists; 404/410/5xx: invalid
            if (status is >= 200 and < 400) return url;
            if (status == 404 || status == 410 || status >= 500) return null;
            return url;
        }
        catch
        {
            return null; // timeout, DNS failure, network error
        }
    }

    private static string[] GetInvalidEnumFields(CompanyEnrichmentResult r)
    {
        var invalid = new List<string>(4);
        if (r.WorkingLanguage is not null && !ValidWorkingLanguages.Contains(r.WorkingLanguage))
            invalid.Add("workingLanguage");
        if (r.CompanySize is not null && !ValidCompanySizes.Contains(r.CompanySize))
            invalid.Add("companySize");
        if (r.RemotePolicy is null || !ValidRemotePolicies.Contains(r.RemotePolicy))
            invalid.Add("remotePolicy");
        if (r.TargetMarket is not null && !ValidTargetMarkets.Contains(r.TargetMarket))
            invalid.Add("targetMarket");
        return [.. invalid];
    }

    private static string? ValidateEnum(string? value, HashSet<string> allowed) =>
        value is not null && allowed.Contains(value) ? value : null;

    private static string[]? FilterTags(string[]? tags, HashSet<string> allowed)
    {
        if (tags is null || tags.Length == 0) return null;
        var filtered = tags.Where(allowed.Contains).ToArray();
        return filtered.Length > 0 ? filtered : null;
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
    [JsonPropertyName("confidence")] public string? Confidence { get; set; }
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
    [JsonPropertyName("city")] public string? City { get; set; }
}

internal sealed class RefinementInput
{
    [JsonPropertyName("name")] public string Name { get; set; } = string.Empty;
    [JsonPropertyName("kvk")] public string Kvk { get; set; } = string.Empty;
    [JsonPropertyName("invalidFields")] public string[] InvalidFields { get; set; } = [];
}

internal sealed class EnrichmentRefinementResult
{
    [JsonPropertyName("name")] public string? Name { get; set; }
    [JsonPropertyName("workingLanguage")] public string? WorkingLanguage { get; set; }
    [JsonPropertyName("companySize")] public string? CompanySize { get; set; }
    [JsonPropertyName("remotePolicy")] public string? RemotePolicy { get; set; }
    [JsonPropertyName("targetMarket")] public string? TargetMarket { get; set; }
}

[JsonSerializable(typeof(GeminiRequest))]
[JsonSerializable(typeof(GeminiResponse))]
[JsonSerializable(typeof(CompanyEnrichmentResult))]
[JsonSerializable(typeof(CompanyEnrichmentResult[]))]
[JsonSerializable(typeof(AnonymousCompanyInput))]
[JsonSerializable(typeof(AnonymousCompanyInput[]))]
[JsonSerializable(typeof(RefinementInput))]
[JsonSerializable(typeof(RefinementInput[]))]
[JsonSerializable(typeof(EnrichmentRefinementResult))]
[JsonSerializable(typeof(EnrichmentRefinementResult[]))]
internal partial class CompanyEnricherJsonContext : JsonSerializerContext
{
}
