using Azure.Monitor.OpenTelemetry.Exporter;
using backend.Services;
using Microsoft.Azure.Functions.Worker.Builder;
using Microsoft.Azure.Functions.Worker.OpenTelemetry;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

var builder = FunctionsApplication.CreateBuilder(args);

builder.ConfigureFunctionsWebApplication();

builder.Services.AddCors(options =>
    options.AddDefaultPolicy(p => p.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod()));

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

builder.Services.AddSingleton<SponsorStore>();
builder.Services.AddSingleton<IndSponsorScraper>();
builder.Services.AddSingleton<CompanyEnricher>();
builder.Services.AddSingleton<TokenService>();

if (!string.IsNullOrEmpty(Environment.GetEnvironmentVariable("APPLICATIONINSIGHTS_CONNECTION_STRING")))
{
    builder.Services.AddOpenTelemetry()
        .UseFunctionsWorkerDefaults()
        .UseAzureMonitorExporter();
}

builder.Build().Run();
