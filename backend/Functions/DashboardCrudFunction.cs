using System.Collections.Concurrent;
using System.Net;
using System.Text.Json;
using backend.Models;
using backend.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;

namespace backend.Functions;

public sealed class DashboardCrudFunction
{
    private readonly SponsorStore _store;
    private readonly TokenService _tokens;

    public DashboardCrudFunction(SponsorStore store, TokenService tokens)
    {
        _store = store;
        _tokens = tokens;
    }

    [Function("DashboardCrud")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", "post", "put", "delete", "options",
            Route = "dashboard/{entity}/{id?}")]
        HttpRequestData req,
        string entity,
        string? id)
    {
        // Handle CORS preflight
        if (req.Method.Equals("OPTIONS", StringComparison.OrdinalIgnoreCase))
            return WithCors(req.CreateResponse(HttpStatusCode.OK));

        // JWT auth — bypass when JWT_SECRET is not configured (local dev without secrets)
        if (!string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("JWT_SECRET")))
        {
            req.Headers.TryGetValues("Authorization", out var authHeader);
            if (!_tokens.ValidateToken(authHeader?.FirstOrDefault()))
                return WithCors(CreateTextResponse(req, HttpStatusCode.Unauthorized, "Unauthorized"));
        }

        var response = (entity.ToLowerInvariant(), req.Method.ToUpperInvariant()) switch
        {
            ("users", "GET")      => await GetCollection(req, _store.Users),
            ("users", "POST")     => await CreateItem(req, _store.Users),
            ("users", "PUT")      => await UpdateItem(req, _store.Users, id),
            ("users", "DELETE")   => DeleteItem(req, _store.Users, id),
            ("sponsors", "GET")   => await GetCollection(req, _store.Companies),
            ("sponsors", "POST")  => await CreateItem(req, _store.Companies),
            ("sponsors", "PUT")   => await UpdateItem(req, _store.Companies, id),
            ("sponsors", "DELETE")=> DeleteItem(req, _store.Companies, id),
            ("stages", "GET")     => await GetCollection(req, _store.Stages),
            ("stages", "POST")    => await CreateItem(req, _store.Stages),
            ("stages", "PUT")     => await UpdateItem(req, _store.Stages, id),
            ("stages", "DELETE")  => DeleteItem(req, _store.Stages, id),
            _ => CreateTextResponse(req, HttpStatusCode.BadRequest, "Unsupported route or method")
        };

        return WithCors(response);
    }

    private static HttpResponseData WithCors(HttpResponseData res)
    {
        AuthFunction.AddCors(res);
        return res;
    }

    private static async Task<HttpResponseData> GetCollection<T>(
        HttpRequestData req, ConcurrentDictionary<string, T> store)
    {
        var response = req.CreateResponse(HttpStatusCode.OK);
        await response.WriteAsJsonAsync(store.Values);
        return response;
    }

    private static async Task<HttpResponseData> CreateItem<T>(
        HttpRequestData req, ConcurrentDictionary<string, T> store) where T : class
    {
        var item = await DeserializeEntity<T>(req.Body);
        if (item is null)
            return CreateTextResponse(req, HttpStatusCode.BadRequest, "Invalid payload");

        var id = ExtractId(item);
        store[id] = item;

        var response = req.CreateResponse(HttpStatusCode.Created);
        await response.WriteAsJsonAsync(item);
        return response;
    }

    private static async Task<HttpResponseData> UpdateItem<T>(
        HttpRequestData req, ConcurrentDictionary<string, T> store, string? id) where T : class
    {
        if (string.IsNullOrWhiteSpace(id))
            return CreateTextResponse(req, HttpStatusCode.BadRequest, "id is required for update");

        var item = await DeserializeEntity<T>(req.Body);
        if (item is null)
            return CreateTextResponse(req, HttpStatusCode.BadRequest, "Invalid payload");

        store[id] = SetId(item, id);

        var response = req.CreateResponse(HttpStatusCode.OK);
        await response.WriteAsJsonAsync(store[id]);
        return response;
    }

    private static HttpResponseData DeleteItem<T>(
        HttpRequestData req, ConcurrentDictionary<string, T> store, string? id)
    {
        if (string.IsNullOrWhiteSpace(id))
            return CreateTextResponse(req, HttpStatusCode.BadRequest, "id is required for delete");

        return store.TryRemove(id, out _)
            ? req.CreateResponse(HttpStatusCode.NoContent)
            : CreateTextResponse(req, HttpStatusCode.NotFound, "Not found");
    }

    private static string ExtractId<T>(T item) where T : class => item switch
    {
        User u           => u.Id,
        SponsorCompany s => s.Id,
        ApplicationStage a => a.Id,
        _ => Guid.NewGuid().ToString("N")
    };

    private static T SetId<T>(T item, string id) where T : class => item switch
    {
        User u => (T)(object)new User
        {
            Id = id, Email = u.Email, DisplayName = u.DisplayName
        },
        SponsorCompany s => (T)(object)new SponsorCompany
        {
            Id = id,
            Name = s.Name,
            KvKNumber = s.KvKNumber,
            IsIndRecognizedSponsor = s.IsIndRecognizedSponsor,
            LastVerifiedAt = s.LastVerifiedAt,
            Summary = s.Summary,
            CoreIndustry = s.CoreIndustry,
            TechStackTags = s.TechStackTags,
            FunctionalTags = s.FunctionalTags,
            EnrichedAt = s.EnrichedAt,
        },
        ApplicationStage a => (T)(object)new ApplicationStage
        {
            Id = id,
            SponsorCompanyId = a.SponsorCompanyId,
            Status = a.Status,
            Notes = a.Notes,
            ContactPersonName = a.ContactPersonName,
            ContactPersonEmail = a.ContactPersonEmail,
            Cities = a.Cities,
            UpdatedAt = DateTimeOffset.UtcNow,
        },
        _ => item
    };

    private static HttpResponseData CreateTextResponse(
        HttpRequestData req, HttpStatusCode statusCode, string message)
    {
        var response = req.CreateResponse(statusCode);
        response.WriteString(message);
        return response;
    }

    private static async Task<T?> DeserializeEntity<T>(Stream body) where T : class
    {
        if (typeof(T) == typeof(User))
            return (await JsonSerializer.DeserializeAsync(body, AppJsonSerializerContext.Default.User)) as T;

        if (typeof(T) == typeof(SponsorCompany))
            return (await JsonSerializer.DeserializeAsync(body, AppJsonSerializerContext.Default.SponsorCompany)) as T;

        if (typeof(T) == typeof(ApplicationStage))
            return (await JsonSerializer.DeserializeAsync(body, AppJsonSerializerContext.Default.ApplicationStage)) as T;

        return null;
    }
}
