using Azure;
using Azure.Data.Tables;
using backend.Models;

namespace backend.Services;

public sealed class UserStore
{
    private const string TableName = "iwwzusers";

    private TableClient GetClient()
    {
        var conn = Environment.GetEnvironmentVariable("AzureWebJobsStorage")
            ?? throw new InvalidOperationException("AzureWebJobsStorage not set");
        var client = new TableClient(conn, TableName);
        client.CreateIfNotExists();
        return client;
    }

    public async Task<UserEntity?> GetByEmailAsync(string email)
    {
        var rowKey = email.ToLowerInvariant();
        try
        {
            var resp = await GetClient().GetEntityAsync<UserEntity>("users", rowKey);
            return resp.Value;
        }
        catch (RequestFailedException e) when (e.Status == 404)
        {
            return null;
        }
    }

    public async Task<UserEntity?> GetByUserIdAsync(string userId)
    {
        var client = GetClient();
        await foreach (var entity in client.QueryAsync<UserEntity>(
            e => e.PartitionKey == "users" && e.UserId == userId))
            return entity;
        return null;
    }

    public async Task CreateAsync(UserEntity user)
    {
        user.PartitionKey = "users";
        user.RowKey       = user.Email.ToLowerInvariant();
        await GetClient().AddEntityAsync(user);
    }

    public async Task UpdateAsync(UserEntity user)
    {
        await GetClient().UpdateEntityAsync(user, user.ETag, TableUpdateMode.Replace);
    }
}
