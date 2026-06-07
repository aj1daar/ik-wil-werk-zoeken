using System.Collections.Concurrent;
using System.Net;
using System.Text.Json;
using backend;
using backend.Models;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;

namespace backend.Functions;

public sealed class DashboardCrudFunction
{
    private static readonly ConcurrentDictionary<string, User> Users = new();
    private static readonly ConcurrentDictionary<string, SponsorCompany> SponsorCompanies = new();
    private static readonly ConcurrentDictionary<string, ApplicationStage> ApplicationStages = new();

    [Function("DashboardCrud")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Function, "get", "post", "put", "delete", Route = "dashboard/{entity}/{id?}")]
        HttpRequestData req,
        string entity,
        string? id)
    {
        return (entity.ToLowerInvariant(), req.Method.ToUpperInvariant()) switch
        {
            ("users", "GET") => await GetCollection(req, Users),
            ("users", "POST") => await CreateItem(req, Users),
            ("users", "PUT") => await UpdateItem(req, Users, id),
            ("users", "DELETE") => DeleteItem(req, Users, id),
            ("sponsors", "GET") => await GetCollection(req, SponsorCompanies),
            ("sponsors", "POST") => await CreateItem(req, SponsorCompanies),
            ("sponsors", "PUT") => await UpdateItem(req, SponsorCompanies, id),
            ("sponsors", "DELETE") => DeleteItem(req, SponsorCompanies, id),
            ("stages", "GET") => await GetCollection(req, ApplicationStages),
            ("stages", "POST") => await CreateItem(req, ApplicationStages),
            ("stages", "PUT") => await UpdateItem(req, ApplicationStages, id),
            ("stages", "DELETE") => DeleteItem(req, ApplicationStages, id),
            _ => CreateTextResponse(req, HttpStatusCode.BadRequest, "Unsupported route or method")
        };
    }

    private static async Task<HttpResponseData> GetCollection<T>(HttpRequestData req, ConcurrentDictionary<string, T> store)
    {
        var response = req.CreateResponse(HttpStatusCode.OK);
        await response.WriteAsJsonAsync(store.Values);
        return response;
    }

    private static async Task<HttpResponseData> CreateItem<T>(HttpRequestData req, ConcurrentDictionary<string, T> store) where T : class
    {
        var item = await DeserializeEntity<T>(req.Body);
        if (item is null)
        {
            return CreateTextResponse(req, HttpStatusCode.BadRequest, "Invalid payload");
        }

        var id = ExtractId(item);
        store[id] = item;

        var response = req.CreateResponse(HttpStatusCode.Created);
        await response.WriteAsJsonAsync(item);
        return response;
    }

    private static async Task<HttpResponseData> UpdateItem<T>(HttpRequestData req, ConcurrentDictionary<string, T> store, string? id) where T : class
    {
        if (string.IsNullOrWhiteSpace(id))
        {
            return CreateTextResponse(req, HttpStatusCode.BadRequest, "id is required for update");
        }

        var item = await DeserializeEntity<T>(req.Body);
        if (item is null)
        {
            return CreateTextResponse(req, HttpStatusCode.BadRequest, "Invalid payload");
        }

        store[id] = SetId(item, id);

        var response = req.CreateResponse(HttpStatusCode.OK);
        await response.WriteAsJsonAsync(store[id]);
        return response;
    }

    private static HttpResponseData DeleteItem<T>(HttpRequestData req, ConcurrentDictionary<string, T> store, string? id)
    {
        if (string.IsNullOrWhiteSpace(id))
        {
            return CreateTextResponse(req, HttpStatusCode.BadRequest, "id is required for delete");
        }

        return store.TryRemove(id, out _) ? req.CreateResponse(HttpStatusCode.NoContent) : CreateTextResponse(req, HttpStatusCode.NotFound, "Not found");
    }

    private static string ExtractId<T>(T item) where T : class
    {
        return item switch
        {
            User user => user.Id,
            SponsorCompany sponsor => sponsor.Id,
            ApplicationStage stage => stage.Id,
            _ => Guid.NewGuid().ToString("N")
        };
    }

    private static T SetId<T>(T item, string id) where T : class
    {
        return item switch
        {
            User user => (T)(object)new User { Id = id, Email = user.Email, DisplayName = user.DisplayName },
            SponsorCompany sponsor => (T)(object)new SponsorCompany
            {
                Id = id,
                Name = sponsor.Name,
                KvKNumber = sponsor.KvKNumber,
                IsIndRecognizedSponsor = sponsor.IsIndRecognizedSponsor,
                LastVerifiedAt = sponsor.LastVerifiedAt
            },
            ApplicationStage stage => (T)(object)new ApplicationStage
            {
                Id = id,
                UserId = stage.UserId,
                SponsorCompanyId = stage.SponsorCompanyId,
                Stage = stage.Stage,
                UpdatedAt = stage.UpdatedAt
            },
            _ => item
        };
    }

    private static HttpResponseData CreateTextResponse(HttpRequestData req, HttpStatusCode statusCode, string message)
    {
        var response = req.CreateResponse(statusCode);
        response.WriteString(message);
        return response;
    }

    private static async Task<T?> DeserializeEntity<T>(Stream body) where T : class
    {
        if (typeof(T) == typeof(User))
        {
            return (await JsonSerializer.DeserializeAsync(body, AppJsonSerializerContext.Default.User)) as T;
        }

        if (typeof(T) == typeof(SponsorCompany))
        {
            return (await JsonSerializer.DeserializeAsync(body, AppJsonSerializerContext.Default.SponsorCompany)) as T;
        }

        if (typeof(T) == typeof(ApplicationStage))
        {
            return (await JsonSerializer.DeserializeAsync(body, AppJsonSerializerContext.Default.ApplicationStage)) as T;
        }

        return null;
    }
}
