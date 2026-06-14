using System.Net;
using System.Text;
using System.Text.Json;
using backend.Models;
using backend.Services;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace backend.Tests;

// Unit tests for CompanyEnricher helpers — pure logic that doesn't require a live Gemini API.
// HTTP calls are covered by testing the StripCodeFence indirectly through EnrichBatchAsync
// with a mock HTTP client.

public sealed class CompanyEnricherTests
{
    // ── CurrentVersion constant ───────────────────────────────────────────────

    [Fact]
    public void CurrentVersion_IsThree()
    {
        Assert.Equal(3, CompanyEnricher.CurrentVersion);
    }

    // ── EnrichBatchAsync — no API key ─────────────────────────────────────────

    [Fact]
    public async Task EnrichBatchAsync_NoApiKey_ReturnsZero()
    {
        var prev = Environment.GetEnvironmentVariable("GEMINI_API_KEY");
        Environment.SetEnvironmentVariable("GEMINI_API_KEY", null);
        try
        {
            var enricher = new CompanyEnricher(new NullHttpClientFactory(), NullLogger<CompanyEnricher>.Instance);
            var companies = new[] { MakeCompany("Acme", "12345678") };
            var result = await enricher.EnrichBatchAsync(companies);
            Assert.Equal(0, result);
        }
        finally
        {
            Environment.SetEnvironmentVariable("GEMINI_API_KEY", prev);
        }
    }

    [Fact]
    public async Task EnrichBatchAsync_EmptyList_ReturnsZero()
    {
        var enricher = new CompanyEnricher(new NullHttpClientFactory(), NullLogger<CompanyEnricher>.Instance);
        var result = await enricher.EnrichBatchAsync([]);
        Assert.Equal(0, result);
    }

    // ── EnrichBatchAsync — HTTP responses ─────────────────────────────────────

    [Fact]
    public async Task EnrichBatchAsync_SuccessfulResponse_PopulatesAllFields()
    {
        var company = MakeCompany("Acme B.V.", "12345678");

        var resultJson = JsonSerializer.Serialize(new[]
        {
            new
            {
                confidence        = "high",
                summary           = "Acme is a software company.",
                coreIndustry      = "Software & Technology",
                techStackTags     = new[] { "Cloud", "Java" },
                functionalTags    = new[] { "B2B SaaS" },
                workingLanguage   = "English",
                companySize       = "mid",
                remotePolicy      = "hybrid",
                parentCompanyName = (string?)null,
                websiteUrl        = "https://acme.nl",
                targetMarket      = "B2B"
            }
        });

        var geminiPayload = WrapGeminiResponse(resultJson);
        var factory = new GeminiHttpClientFactory(HttpStatusCode.OK, geminiPayload);

        var prev = Environment.GetEnvironmentVariable("GEMINI_API_KEY");
        Environment.SetEnvironmentVariable("GEMINI_API_KEY", "test-key");
        try
        {
            var enricher = new CompanyEnricher(factory, NullLogger<CompanyEnricher>.Instance);
            var enriched = await enricher.EnrichBatchAsync([company]);

            Assert.Equal(1, enriched);
            Assert.Equal("Acme is a software company.", company.Summary);
            Assert.Equal("Software & Technology", company.CoreIndustry);
            Assert.Contains("Cloud", company.TechStackTags ?? []);
            Assert.Contains("B2B SaaS", company.FunctionalTags ?? []);
            Assert.Equal("English", company.WorkingLanguage);
            Assert.Equal("mid", company.CompanySize);
            Assert.Equal("hybrid", company.RemotePolicy);
            Assert.Null(company.ParentCompanyName);
            Assert.Equal("https://acme.nl", company.WebsiteUrl);
            Assert.Equal("B2B", company.TargetMarket);
            Assert.NotNull(company.EnrichedAt);
            Assert.Equal(CompanyEnricher.CurrentVersion, company.EnrichmentVersion);
        }
        finally
        {
            Environment.SetEnvironmentVariable("GEMINI_API_KEY", prev);
        }
    }

    [Fact]
    public async Task EnrichBatchAsync_GeminiReturns4xx_ReturnsZeroAndDoesNotMutate()
    {
        var company = MakeCompany("Acme", "12345678");
        var factory = new GeminiHttpClientFactory(HttpStatusCode.TooManyRequests, "rate limit");

        var prev = Environment.GetEnvironmentVariable("GEMINI_API_KEY");
        Environment.SetEnvironmentVariable("GEMINI_API_KEY", "test-key");
        try
        {
            var enricher = new CompanyEnricher(factory, NullLogger<CompanyEnricher>.Instance);
            var enriched = await enricher.EnrichBatchAsync([company]);

            Assert.Equal(0, enriched);
            Assert.Null(company.Summary);
            Assert.Equal(0, company.EnrichmentVersion);
            Assert.Null(company.EnrichedAt);
        }
        finally
        {
            Environment.SetEnvironmentVariable("GEMINI_API_KEY", prev);
        }
    }

    [Fact]
    public async Task EnrichBatchAsync_GeminiReturnsEmptyBody_ReturnsZero()
    {
        var company = MakeCompany("Acme", "12345678");
        var emptyGemini = WrapGeminiResponse(string.Empty);
        var factory = new GeminiHttpClientFactory(HttpStatusCode.OK, emptyGemini);

        var prev = Environment.GetEnvironmentVariable("GEMINI_API_KEY");
        Environment.SetEnvironmentVariable("GEMINI_API_KEY", "test-key");
        try
        {
            var enricher = new CompanyEnricher(factory, NullLogger<CompanyEnricher>.Instance);
            var result = await enricher.EnrichBatchAsync([company]);
            Assert.Equal(0, result);
            Assert.Null(company.Summary);
        }
        finally
        {
            Environment.SetEnvironmentVariable("GEMINI_API_KEY", prev);
        }
    }

    [Fact]
    public async Task EnrichBatchAsync_MalformedJson_ReturnsZero()
    {
        var company = MakeCompany("Acme", "12345678");
        var malformed = WrapGeminiResponse("not-valid-json");
        var factory = new GeminiHttpClientFactory(HttpStatusCode.OK, malformed);

        var prev = Environment.GetEnvironmentVariable("GEMINI_API_KEY");
        Environment.SetEnvironmentVariable("GEMINI_API_KEY", "test-key");
        try
        {
            var enricher = new CompanyEnricher(factory, NullLogger<CompanyEnricher>.Instance);
            var result = await enricher.EnrichBatchAsync([company]);
            Assert.Equal(0, result);
        }
        finally
        {
            Environment.SetEnvironmentVariable("GEMINI_API_KEY", prev);
        }
    }

    [Fact]
    public async Task EnrichBatchAsync_BatchOf21_SendsTwoHttpCalls()
    {
        var companies = Enumerable.Range(0, 21)
            .Select(i => MakeCompany($"Co {i}", $"{i:D8}"))
            .ToList();

        var singleResult = new
        {
            summary = "X", coreIndustry = "Tech", techStackTags = Array.Empty<string>(),
            functionalTags = Array.Empty<string>(), workingLanguage = "English",
            companySize = "mid", remotePolicy = "hybrid", parentCompanyName = (string?)null,
            websiteUrl = (string?)null, targetMarket = "B2B"
        };

        // Return arrays for batch of 20 and batch of 1
        var factory = new CountingGeminiHttpClientFactory([
            (HttpStatusCode.OK, WrapGeminiResponse(JsonSerializer.Serialize(Enumerable.Repeat(singleResult, 20).ToArray()))),
            (HttpStatusCode.OK, WrapGeminiResponse(JsonSerializer.Serialize(Enumerable.Repeat(singleResult, 1).ToArray()))),
        ]);

        var prev = Environment.GetEnvironmentVariable("GEMINI_API_KEY");
        Environment.SetEnvironmentVariable("GEMINI_API_KEY", "test-key");
        try
        {
            var enricher = new CompanyEnricher(factory, NullLogger<CompanyEnricher>.Instance);
            var enriched = await enricher.EnrichBatchAsync(companies);
            Assert.Equal(21, enriched);
            Assert.Equal(2, factory.CallCount);

        }
        finally
        {
            Environment.SetEnvironmentVariable("GEMINI_API_KEY", prev);
        }
    }

    [Fact]
    public async Task EnrichBatchAsync_CancellationRequested_StopsEarly()
    {
        var companies = Enumerable.Range(0, 40)
            .Select(i => MakeCompany($"Co {i}", $"{i:D8}"))
            .ToList();

        // Return an empty result for all calls
        var factory = new GeminiHttpClientFactory(HttpStatusCode.OK,
            WrapGeminiResponse(JsonSerializer.Serialize(Array.Empty<object>())));

        using var cts = new CancellationTokenSource();
        cts.Cancel();

        var prev = Environment.GetEnvironmentVariable("GEMINI_API_KEY");
        Environment.SetEnvironmentVariable("GEMINI_API_KEY", "test-key");
        try
        {
            var enricher = new CompanyEnricher(factory, NullLogger<CompanyEnricher>.Instance);
            var result = await enricher.EnrichBatchAsync(companies, cts.Token);
            // With cancellation, should not have enriched anything
            Assert.Equal(0, result);
        }
        finally
        {
            Environment.SetEnvironmentVariable("GEMINI_API_KEY", prev);
        }
    }

    // ── low-confidence handling ───────────────────────────────────────────────

    [Fact]
    public async Task EnrichBatchAsync_LowConfidence_SetsVersionButNoFields()
    {
        var company = MakeCompany("Mystery B.V.", "99999999");
        var resultJson = JsonSerializer.Serialize(new[]
        {
            new
            {
                confidence        = "low",
                summary           = "Some made-up summary.",
                coreIndustry      = "Unknown",
                techStackTags     = new[] { "SAP" },
                functionalTags    = Array.Empty<string>(),
                workingLanguage   = "Dutch",
                companySize       = "mid",
                remotePolicy      = "hybrid",
                parentCompanyName = (string?)null,
                websiteUrl        = "https://mystery.nl",
                targetMarket      = "B2B"
            }
        });

        var factory = new GeminiHttpClientFactory(HttpStatusCode.OK, WrapGeminiResponse(resultJson));
        var prev = Environment.GetEnvironmentVariable("GEMINI_API_KEY");
        Environment.SetEnvironmentVariable("GEMINI_API_KEY", "test-key");
        try
        {
            var enricher = new CompanyEnricher(factory, NullLogger<CompanyEnricher>.Instance);
            var enriched = await enricher.EnrichBatchAsync([company]);

            Assert.Equal(1, enriched); // still counted as processed
            Assert.Equal(CompanyEnricher.CurrentVersion, company.EnrichmentVersion);
            Assert.NotNull(company.EnrichedAt);
            // Fields must NOT be written for low-confidence
            Assert.Null(company.Summary);
            Assert.Null(company.CoreIndustry);
            Assert.Null(company.WorkingLanguage);
            Assert.Null(company.WebsiteUrl);
        }
        finally
        {
            Environment.SetEnvironmentVariable("GEMINI_API_KEY", prev);
        }
    }

    // ── enum validation ────────────────────────────────────────────────────────

    [Fact]
    public async Task EnrichBatchAsync_InvalidWorkingLanguage_NullsField()
    {
        var company = MakeCompany("Acme", "12345678");
        var resultJson = JsonSerializer.Serialize(new[]
        {
            new
            {
                confidence = "high", summary = "X", coreIndustry = "Tech",
                techStackTags = Array.Empty<string>(), functionalTags = Array.Empty<string>(),
                workingLanguage   = "German",   // invalid
                companySize       = "mid",
                remotePolicy      = "hybrid",
                parentCompanyName = (string?)null,
                websiteUrl        = (string?)null,
                targetMarket      = "B2B"
            }
        });

        // Refinement call also returns something invalid so we can verify the null fallback
        var refinementJson = JsonSerializer.Serialize(new[]
        {
            new { name = "Acme", workingLanguage = "Flemish", companySize = "mid", remotePolicy = "hybrid", targetMarket = "B2B" }
        });

        var factory = new SequencedHttpClientFactory([
            (HttpStatusCode.OK, WrapGeminiResponse(resultJson)),
            (HttpStatusCode.OK, WrapGeminiResponse(refinementJson)),
        ]);

        var prev = Environment.GetEnvironmentVariable("GEMINI_API_KEY");
        Environment.SetEnvironmentVariable("GEMINI_API_KEY", "test-key");
        try
        {
            var enricher = new CompanyEnricher(factory, NullLogger<CompanyEnricher>.Instance);
            await enricher.EnrichBatchAsync([company]);
            Assert.Null(company.WorkingLanguage); // "German" and "Flemish" both invalid → null
        }
        finally
        {
            Environment.SetEnvironmentVariable("GEMINI_API_KEY", prev);
        }
    }

    [Fact]
    public async Task EnrichBatchAsync_InvalidEnumRefinedToValid_AppliesCorrectedValue()
    {
        var company = MakeCompany("Acme", "12345678");
        var resultJson = JsonSerializer.Serialize(new[]
        {
            new
            {
                confidence = "high", summary = "X", coreIndustry = "Tech",
                techStackTags = Array.Empty<string>(), functionalTags = Array.Empty<string>(),
                workingLanguage   = "Nederlands",  // invalid
                companySize       = "mid",
                remotePolicy      = "hybrid",
                parentCompanyName = (string?)null,
                websiteUrl        = (string?)null,
                targetMarket      = "B2B"
            }
        });

        var refinementJson = JsonSerializer.Serialize(new[]
        {
            new { name = "Acme", workingLanguage = "Dutch", companySize = "mid", remotePolicy = "hybrid", targetMarket = "B2B" }
        });

        var factory = new SequencedHttpClientFactory([
            (HttpStatusCode.OK, WrapGeminiResponse(resultJson)),
            (HttpStatusCode.OK, WrapGeminiResponse(refinementJson)),
        ]);

        var prev = Environment.GetEnvironmentVariable("GEMINI_API_KEY");
        Environment.SetEnvironmentVariable("GEMINI_API_KEY", "test-key");
        try
        {
            var enricher = new CompanyEnricher(factory, NullLogger<CompanyEnricher>.Instance);
            await enricher.EnrichBatchAsync([company]);
            Assert.Equal("Dutch", company.WorkingLanguage); // refinement corrected it
        }
        finally
        {
            Environment.SetEnvironmentVariable("GEMINI_API_KEY", prev);
        }
    }

    [Fact]
    public async Task EnrichBatchAsync_ValidEnums_NoRefinementCall()
    {
        var company = MakeCompany("Acme", "12345678");
        var resultJson = JsonSerializer.Serialize(new[]
        {
            new
            {
                confidence = "high", summary = "X", coreIndustry = "Tech",
                techStackTags = Array.Empty<string>(), functionalTags = Array.Empty<string>(),
                workingLanguage = "English", companySize = "startup",
                remotePolicy = "remote", parentCompanyName = (string?)null,
                websiteUrl = (string?)null, targetMarket = "B2C"
            }
        });

        var factory = new SequencedHttpClientFactory([
            (HttpStatusCode.OK, WrapGeminiResponse(resultJson)),
        ]);

        var prev = Environment.GetEnvironmentVariable("GEMINI_API_KEY");
        Environment.SetEnvironmentVariable("GEMINI_API_KEY", "test-key");
        try
        {
            var enricher = new CompanyEnricher(factory, NullLogger<CompanyEnricher>.Instance);
            var enriched = await enricher.EnrichBatchAsync([company]);
            Assert.Equal(1, enriched);
            Assert.Equal("English", company.WorkingLanguage);
            Assert.Equal("startup", company.CompanySize);
            Assert.Equal(1, factory.GeminiCallCount); // only 1 call — no refinement
        }
        finally
        {
            Environment.SetEnvironmentVariable("GEMINI_API_KEY", prev);
        }
    }

    // ── URL validation ─────────────────────────────────────────────────────────

    [Fact]
    public async Task EnrichBatchAsync_WebsiteUrl404_NullsWebsiteUrl()
    {
        var company = MakeCompany("Acme", "12345678");
        var resultJson = JsonSerializer.Serialize(new[]
        {
            new
            {
                confidence = "high", summary = "X", coreIndustry = "Tech",
                techStackTags = Array.Empty<string>(), functionalTags = Array.Empty<string>(),
                workingLanguage = "English", companySize = "mid", remotePolicy = "hybrid",
                parentCompanyName = (string?)null, websiteUrl = "https://gone.nl", targetMarket = "B2B"
            }
        });

        var factory = new DualModeHttpClientFactory(
            geminiStatus: HttpStatusCode.OK, geminiBody: WrapGeminiResponse(resultJson),
            urlStatus:    HttpStatusCode.NotFound);

        var prev = Environment.GetEnvironmentVariable("GEMINI_API_KEY");
        Environment.SetEnvironmentVariable("GEMINI_API_KEY", "test-key");
        try
        {
            var enricher = new CompanyEnricher(factory, NullLogger<CompanyEnricher>.Instance);
            await enricher.EnrichBatchAsync([company]);
            Assert.Null(company.WebsiteUrl); // 404 → nulled
        }
        finally
        {
            Environment.SetEnvironmentVariable("GEMINI_API_KEY", prev);
        }
    }

    [Fact]
    public async Task EnrichBatchAsync_WebsiteUrl200_KeepsWebsiteUrl()
    {
        var company = MakeCompany("Acme", "12345678");
        var resultJson = JsonSerializer.Serialize(new[]
        {
            new
            {
                confidence = "high", summary = "X", coreIndustry = "Tech",
                techStackTags = Array.Empty<string>(), functionalTags = Array.Empty<string>(),
                workingLanguage = "English", companySize = "mid", remotePolicy = "hybrid",
                parentCompanyName = (string?)null, websiteUrl = "https://acme.nl", targetMarket = "B2B"
            }
        });

        var factory = new DualModeHttpClientFactory(
            geminiStatus: HttpStatusCode.OK, geminiBody: WrapGeminiResponse(resultJson),
            urlStatus:    HttpStatusCode.OK);

        var prev = Environment.GetEnvironmentVariable("GEMINI_API_KEY");
        Environment.SetEnvironmentVariable("GEMINI_API_KEY", "test-key");
        try
        {
            var enricher = new CompanyEnricher(factory, NullLogger<CompanyEnricher>.Instance);
            await enricher.EnrichBatchAsync([company]);
            Assert.Equal("https://acme.nl", company.WebsiteUrl); // 200 → kept
        }
        finally
        {
            Environment.SetEnvironmentVariable("GEMINI_API_KEY", prev);
        }
    }

    [Fact]
    public async Task EnrichBatchAsync_WebsiteUrl403_KeepsWebsiteUrl()
    {
        var company = MakeCompany("Acme", "12345678");
        var resultJson = JsonSerializer.Serialize(new[]
        {
            new
            {
                confidence = "high", summary = "X", coreIndustry = "Tech",
                techStackTags = Array.Empty<string>(), functionalTags = Array.Empty<string>(),
                workingLanguage = "English", companySize = "mid", remotePolicy = "hybrid",
                parentCompanyName = (string?)null, websiteUrl = "https://guarded.nl", targetMarket = "B2B"
            }
        });

        var factory = new DualModeHttpClientFactory(
            geminiStatus: HttpStatusCode.OK, geminiBody: WrapGeminiResponse(resultJson),
            urlStatus:    HttpStatusCode.Forbidden);

        var prev = Environment.GetEnvironmentVariable("GEMINI_API_KEY");
        Environment.SetEnvironmentVariable("GEMINI_API_KEY", "test-key");
        try
        {
            var enricher = new CompanyEnricher(factory, NullLogger<CompanyEnricher>.Instance);
            await enricher.EnrichBatchAsync([company]);
            Assert.Equal("https://guarded.nl", company.WebsiteUrl); // 403 = bot-blocked, URL exists → kept
        }
        finally
        {
            Environment.SetEnvironmentVariable("GEMINI_API_KEY", prev);
        }
    }

    [Fact]
    public async Task EnrichBatchAsync_WebsiteUrlServerError_NullsWebsiteUrl()
    {
        var company = MakeCompany("Acme", "12345678");
        var resultJson = JsonSerializer.Serialize(new[]
        {
            new
            {
                confidence = "high", summary = "X", coreIndustry = "Tech",
                techStackTags = Array.Empty<string>(), functionalTags = Array.Empty<string>(),
                workingLanguage = "English", companySize = "mid", remotePolicy = "hybrid",
                parentCompanyName = (string?)null, websiteUrl = "https://broken.nl", targetMarket = "B2B"
            }
        });

        var factory = new DualModeHttpClientFactory(
            geminiStatus: HttpStatusCode.OK, geminiBody: WrapGeminiResponse(resultJson),
            urlStatus:    HttpStatusCode.InternalServerError);

        var prev = Environment.GetEnvironmentVariable("GEMINI_API_KEY");
        Environment.SetEnvironmentVariable("GEMINI_API_KEY", "test-key");
        try
        {
            var enricher = new CompanyEnricher(factory, NullLogger<CompanyEnricher>.Instance);
            await enricher.EnrichBatchAsync([company]);
            Assert.Null(company.WebsiteUrl); // 500 → nulled
        }
        finally
        {
            Environment.SetEnvironmentVariable("GEMINI_API_KEY", prev);
        }
    }

    [Fact]
    public async Task EnrichBatchAsync_NullWebsiteUrl_SkipsUrlValidation()
    {
        var company = MakeCompany("Acme", "12345678");
        var resultJson = JsonSerializer.Serialize(new[]
        {
            new
            {
                confidence = "high", summary = "X", coreIndustry = "Tech",
                techStackTags = Array.Empty<string>(), functionalTags = Array.Empty<string>(),
                workingLanguage = "English", companySize = "mid", remotePolicy = "hybrid",
                parentCompanyName = (string?)null, websiteUrl = (string?)null, targetMarket = "B2B"
            }
        });

        var factory = new SequencedHttpClientFactory([
            (HttpStatusCode.OK, WrapGeminiResponse(resultJson)),
        ]);

        var prev = Environment.GetEnvironmentVariable("GEMINI_API_KEY");
        Environment.SetEnvironmentVariable("GEMINI_API_KEY", "test-key");
        try
        {
            var enricher = new CompanyEnricher(factory, NullLogger<CompanyEnricher>.Instance);
            var enriched = await enricher.EnrichBatchAsync([company]);
            Assert.Equal(1, enriched);
            Assert.Null(company.WebsiteUrl);
            Assert.Equal(1, factory.GeminiCallCount); // no extra URL-check call
        }
        finally
        {
            Environment.SetEnvironmentVariable("GEMINI_API_KEY", prev);
        }
    }

    // ── Tag enum filtering ────────────────────────────────────────────────────

    [Fact]
    public async Task EnrichBatchAsync_FiltersInvalidTags_KeepsValidOnes()
    {
        var company = MakeCompany("Acme", "12345678");
        var resultJson = JsonSerializer.Serialize(new[]
        {
            new
            {
                confidence        = "high",
                summary           = "A company.",
                coreIndustry      = "Software & Technology",
                techStackTags     = new[] { "React", "ReactJS", "Node.js", "CoolFramework" }, // ReactJS + CoolFramework are invalid
                functionalTags    = new[] { "Fintech", "Payments", "Made-up Domain" },         // Made-up Domain is invalid
                workingLanguage   = "English",
                companySize       = "mid",
                remotePolicy      = "hybrid",
                parentCompanyName = (string?)null,
                websiteUrl        = (string?)null,
                targetMarket      = "B2B",
            }
        });
        var factory = new GeminiHttpClientFactory(HttpStatusCode.OK, WrapGeminiResponse(resultJson));

        var prev = Environment.GetEnvironmentVariable("GEMINI_API_KEY");
        Environment.SetEnvironmentVariable("GEMINI_API_KEY", "test-key");
        try
        {
            var enricher = new CompanyEnricher(factory, NullLogger<CompanyEnricher>.Instance);
            await enricher.EnrichBatchAsync([company]);

            Assert.NotNull(company.TechStackTags);
            Assert.Contains("React", company.TechStackTags!);
            Assert.Contains("Node.js", company.TechStackTags!);
            Assert.DoesNotContain("ReactJS", company.TechStackTags!);
            Assert.DoesNotContain("CoolFramework", company.TechStackTags!);

            Assert.NotNull(company.FunctionalTags);
            Assert.Contains("Fintech", company.FunctionalTags!);
            Assert.Contains("Payments", company.FunctionalTags!);
            Assert.DoesNotContain("Made-up Domain", company.FunctionalTags!);
        }
        finally
        {
            Environment.SetEnvironmentVariable("GEMINI_API_KEY", prev);
        }
    }

    [Fact]
    public void ValidTechStackTags_ContainsExpectedValues()
    {
        Assert.Contains("React", CompanyEnricher.ValidTechStackTags);
        Assert.Contains("Python", CompanyEnricher.ValidTechStackTags);
        Assert.DoesNotContain("ReactJS", CompanyEnricher.ValidTechStackTags);
    }

    [Fact]
    public void ValidFunctionalTags_ContainsExpectedValues()
    {
        Assert.Contains("Fintech", CompanyEnricher.ValidFunctionalTags);
        Assert.Contains("Payments", CompanyEnricher.ValidFunctionalTags);
        Assert.DoesNotContain("Made-up Domain", CompanyEnricher.ValidFunctionalTags);
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private static SponsorCompany MakeCompany(string name, string kvk) => new()
    {
        Name = name, KvKNumber = kvk, EnrichmentVersion = 0
    };

    private static string WrapGeminiResponse(string innerText) =>
        JsonSerializer.Serialize(new
        {
            candidates = new[]
            {
                new { content = new { parts = new[] { new { text = innerText } } } }
            }
        });
}

// ── HTTP fakes for enricher tests ────────────────────────────────────────────

internal sealed class NullHttpClientFactory : IHttpClientFactory
{
    public HttpClient CreateClient(string name) => new();
}

internal sealed class GeminiHttpClientFactory : IHttpClientFactory
{
    private readonly HttpStatusCode _status;
    private readonly string _body;

    public GeminiHttpClientFactory(HttpStatusCode status, string body)
    {
        _status = status;
        _body   = body;
    }

    public HttpClient CreateClient(string name) =>
        new(new GeminiFakeHandler(_status, _body)) { BaseAddress = new Uri("https://fake.gemini/") };

    private sealed class GeminiFakeHandler(HttpStatusCode status, string body) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage req, CancellationToken ct) =>
            Task.FromResult(new HttpResponseMessage(status)
            {
                Content = new StringContent(body, Encoding.UTF8, "application/json")
            });
    }
}

internal sealed class CountingGeminiHttpClientFactory : IHttpClientFactory
{
    private readonly (HttpStatusCode, string)[] _responses;
    private int _callIndex;

    public int CallCount => _callIndex;

    public CountingGeminiHttpClientFactory((HttpStatusCode, string)[] responses)
    {
        _responses = responses;
    }

    public HttpClient CreateClient(string name)
    {
        var idx = Interlocked.Increment(ref _callIndex) - 1;
        var (status, body) = _responses[idx % _responses.Length];
        return new HttpClient(new SequencedGeminiHandler(status, body)) { BaseAddress = new Uri("https://fake.gemini/") };
    }

    private sealed class SequencedGeminiHandler(HttpStatusCode status, string body) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage req, CancellationToken ct) =>
            Task.FromResult(new HttpResponseMessage(status)
            {
                Content = new StringContent(body, Encoding.UTF8, "application/json")
            });
    }
}

// Returns Gemini responses in sequence for "gemini" clients; separate fixed status for URL checks.
internal sealed class DualModeHttpClientFactory : IHttpClientFactory
{
    private readonly HttpStatusCode _geminiStatus;
    private readonly string _geminiBody;
    private readonly HttpStatusCode _urlStatus;

    public DualModeHttpClientFactory(HttpStatusCode geminiStatus, string geminiBody, HttpStatusCode urlStatus)
    {
        _geminiStatus = geminiStatus;
        _geminiBody   = geminiBody;
        _urlStatus    = urlStatus;
    }

    public HttpClient CreateClient(string name)
    {
        if (name == "gemini")
            return new HttpClient(new FixedHandler(_geminiStatus, _geminiBody)) { BaseAddress = new Uri("https://fake.gemini/") };
        return new HttpClient(new FixedHandler(_urlStatus, string.Empty));
    }

    private sealed class FixedHandler(HttpStatusCode status, string body) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage req, CancellationToken ct) =>
            Task.FromResult(new HttpResponseMessage(status)
            {
                Content = new StringContent(body, Encoding.UTF8, "application/json")
            });
    }
}

// Returns each Gemini response from a queue in order; URL checks always return 200.
internal sealed class SequencedHttpClientFactory : IHttpClientFactory
{
    private readonly (HttpStatusCode Status, string Body)[] _responses;
    private int _geminiCallIndex;

    public int GeminiCallCount => _geminiCallIndex;

    public SequencedHttpClientFactory((HttpStatusCode, string)[] responses)
    {
        _responses = responses;
    }

    public HttpClient CreateClient(string name)
    {
        if (name == "gemini")
        {
            var idx = Interlocked.Increment(ref _geminiCallIndex) - 1;
            var (status, body) = _responses[idx % _responses.Length];
            return new HttpClient(new FixedHandler(status, body)) { BaseAddress = new Uri("https://fake.gemini/") };
        }
        return new HttpClient(new FixedHandler(HttpStatusCode.OK, string.Empty));
    }

    private sealed class FixedHandler(HttpStatusCode status, string body) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage req, CancellationToken ct) =>
            Task.FromResult(new HttpResponseMessage(status)
            {
                Content = new StringContent(body, Encoding.UTF8, "application/json")
            });
    }
}
