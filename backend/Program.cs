using Azure.Monitor.OpenTelemetry.Exporter;
using backend;
using backend.Services;
using Microsoft.Azure.Functions.Worker.Builder;
using Microsoft.Azure.Functions.Worker.OpenTelemetry;
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

builder.Services.AddSingleton<SponsorStore>();
builder.Services.AddSingleton<IndSponsorScraper>();
builder.Services.AddSingleton<CompanyEnricher>();
builder.Services.AddSingleton<TokenService>();
builder.Services.AddSingleton<EmailService>();
builder.Services.AddSingleton<UserStore>();
builder.Services.AddSingleton<StageStore>();

if (!string.IsNullOrEmpty(Environment.GetEnvironmentVariable("APPLICATIONINSIGHTS_CONNECTION_STRING")))
{
    builder.Services.AddOpenTelemetry()
        .UseFunctionsWorkerDefaults()
        .UseAzureMonitorExporter();
}

var host = builder.Build();

// Pre-populate with dummy companies so the UI works before the first IND sync
var store = host.Services.GetRequiredService<SponsorStore>();
foreach (var c in SeedData.Companies)
    store.Companies[c.Id] = c;

host.Run();
