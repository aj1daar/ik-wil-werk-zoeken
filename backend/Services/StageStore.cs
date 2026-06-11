using Azure;
using Azure.Data.Tables;
using System.Text.Json;
using backend.Models;

namespace backend.Services;

public sealed class StageStore
{
    private const string TableName = "iwwzstages";

    private TableClient GetClient()
    {
        var conn = Environment.GetEnvironmentVariable("AzureWebJobsStorage")
            ?? throw new InvalidOperationException("AzureWebJobsStorage not set");
        var client = new TableClient(conn, TableName);
        client.CreateIfNotExists();
        return client;
    }

    public async Task<IReadOnlyList<ApplicationStage>> GetByUserIdAsync(string userId)
    {
        var stages = new List<ApplicationStage>();
        await foreach (var entity in GetClient().QueryAsync<StageEntity>(e => e.PartitionKey == userId))
            stages.Add(ToModel(entity));
        return stages;
    }

    public async Task<ApplicationStage?> GetAsync(string userId, string id)
    {
        try
        {
            var resp = await GetClient().GetEntityAsync<StageEntity>(userId, id);
            return ToModel(resp.Value);
        }
        catch (RequestFailedException e) when (e.Status == 404)
        {
            return null;
        }
    }

    public async Task UpsertAsync(ApplicationStage stage)
    {
        await GetClient().UpsertEntityAsync(FromModel(stage), TableUpdateMode.Replace);
    }

    public async Task<bool> DeleteAsync(string userId, string id)
    {
        try
        {
            await GetClient().DeleteEntityAsync(userId, id, ETag.All);
            return true;
        }
        catch (RequestFailedException e) when (e.Status == 404)
        {
            return false;
        }
    }

    public async Task DeleteAllByUserIdAsync(string userId)
    {
        var client = GetClient();
        await foreach (var entity in client.QueryAsync<StageEntity>(e => e.PartitionKey == userId))
            await client.DeleteEntityAsync(entity.PartitionKey, entity.RowKey, ETag.All);
    }

    // ── conversion ────────────────────────────────────────────────────────────

    private static ApplicationStage ToModel(StageEntity e) => new()
    {
        Id                 = e.RowKey,
        UserId             = e.PartitionKey,
        SponsorCompanyId   = e.SponsorCompanyId,
        Status             = e.Status,
        Notes              = e.Notes,
        ContactPersonName  = e.ContactPersonName,
        ContactPersonEmail = e.ContactPersonEmail,
        Cities             = JsonSerializer.Deserialize(e.CitiesJson, AppJsonSerializerContext.Default.StringArray) ?? [],
        UpdatedAt          = e.UpdatedAt,
    };

    private static StageEntity FromModel(ApplicationStage s) => new()
    {
        PartitionKey       = s.UserId,
        RowKey             = s.Id,
        SponsorCompanyId   = s.SponsorCompanyId,
        Status             = s.Status,
        Notes              = s.Notes,
        ContactPersonName  = s.ContactPersonName,
        ContactPersonEmail = s.ContactPersonEmail,
        CitiesJson         = JsonSerializer.Serialize(s.Cities, AppJsonSerializerContext.Default.StringArray),
        UpdatedAt          = s.UpdatedAt,
    };
}
