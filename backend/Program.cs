using Azure.Monitor.OpenTelemetry.Exporter;
using backend;
using backend.Data;
using backend.Services;
using Microsoft.Azure.Functions.Worker.Builder;
using Microsoft.Azure.Functions.Worker.OpenTelemetry;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

var builder = FunctionsApplication.CreateBuilder(args);

builder.ConfigureFunctionsWebApplication();

builder.Services.AddHttpClient("ind", client =>
{
    client.DefaultRequestHeaders.Add("User-Agent", "ik-wil-werk-zoeken/1.0");
    client.Timeout = TimeSpan.FromSeconds(30);
});

builder.Services.AddHttpClient("gemini", client =>
{
    client.BaseAddress = new Uri("https://generativelanguage.googleapis.com/");
    client.Timeout = TimeSpan.FromSeconds(60);
});

builder.Services.AddHttpClient("resend", client =>
{
    client.Timeout = TimeSpan.FromSeconds(15);
});

var connectionString = Environment.GetEnvironmentVariable("DATABASE_URL")
    ?? throw new InvalidOperationException("DATABASE_URL is not set");

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(connectionString));

builder.Services.AddSingleton<IndSponsorScraper>();
builder.Services.AddSingleton<CompanyEnricher>();
builder.Services.AddSingleton<TokenService>();
builder.Services.AddSingleton<RateLimiterService>();
builder.Services.AddSingleton<EmailService>();
builder.Services.AddScoped<UserStore>();
builder.Services.AddScoped<StageStore>();
builder.Services.AddScoped<SponsorStore>();

if (!string.IsNullOrEmpty(Environment.GetEnvironmentVariable("APPLICATIONINSIGHTS_CONNECTION_STRING")))
{
    builder.Services.AddOpenTelemetry()
        .UseFunctionsWorkerDefaults()
        .UseAzureMonitorExporter();
}

var host = builder.Build();

// Seed sponsor companies on first run (table must already exist — migrations run in CI)
using (var scope = host.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    if (!await db.Sponsors.AnyAsync())
    {
        db.Sponsors.AddRange(SeedData.Companies);
        await db.SaveChangesAsync();
    }
}

host.Run();
