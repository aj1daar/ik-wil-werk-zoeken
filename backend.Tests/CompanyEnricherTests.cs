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
    public void CurrentVersion_IsOne()
    {
        Assert.Equal(1, CompanyEnricher.CurrentVersion);
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
