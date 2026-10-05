using System.Net;
using System.Text.Json;
using backend;
using backend.Data;
using backend.Services;
using backend.Workers;
using Microsoft.EntityFrameworkCore;

// A key is printed once, here, and never stored: only its hash goes into
// EXPORT_API_KEYS on the server. Runs before the host is built so it needs no
// DATABASE_URL and no JWT_SECRET.
//   dotnet backend.dll new-export-key pipeline
if (args.Length > 0 && args[0] == "new-export-key")
{
    var keyName = args.Length > 1 ? args[1] : "pipeline";
    var (generated, hash) = ExportApiKeyService.GenerateKey();
    Console.WriteLine();
    Console.WriteLine("Key (store in the consumer, shown once, never on this server):");
    Console.WriteLine($"  {generated}");
    Console.WriteLine();
    Console.WriteLine("Add this to EXPORT_API_KEYS on the server (comma-separated for rotation):");
    Console.WriteLine($"  {keyName}={hash}");
    Console.WriteLine();
    return;
}

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers()
    .ConfigureApiBehaviorOptions(o => o.SuppressModelStateInvalidFilter = true)
    .AddJsonOptions(o =>
    {
        o.JsonSerializerOptions.TypeInfoResolverChain.Insert(0, AppJsonSerializerContext.Default);
        o.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    });

builder.Services.AddCors(opts =>
    opts.AddDefaultPolicy(policy =>
    {
        var origin = Environment.GetEnvironmentVariable("ALLOWED_ORIGIN") ?? "*";
        if (origin == "*")
            policy.AllowAnyOrigin();
        else
            policy.WithOrigins(origin);
        policy.WithHeaders("Content-Type", "Authorization")
              .WithMethods("GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS");
    }));

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

// Used only to fetch pasted job-posting links. SSRF-hardened: every resolved IP
// is vetted in JobLinkParser.SafeConnectAsync before a socket opens, and
// redirects are followed manually so each hop is re-checked.
builder.Services.AddHttpClient("joblink", client =>
{
    client.Timeout = TimeSpan.FromSeconds(12);
    client.MaxResponseContentBufferSize = 2 * 1024 * 1024;
    client.DefaultRequestHeaders.Add("User-Agent", "Mozilla/5.0 (compatible; IWWZ-JobLinkBot/1.0)");
})
.ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler
{
    AllowAutoRedirect       = false,
    AutomaticDecompression  = DecompressionMethods.All,
    ConnectTimeout          = TimeSpan.FromSeconds(6),
    ConnectCallback         = JobLinkParser.SafeConnectAsync,
});

// The sponsor export is one response holding the whole register, roughly 10k rows
// of JSON. Compression turns megabytes into a few hundred kilobytes for a daily
// caller on another host.
builder.Services.AddResponseCompression(o =>
{
    o.EnableForHttps = true;
    o.MimeTypes = ["application/json"];
});

var connectionString = Environment.GetEnvironmentVariable("DATABASE_URL")
    ?? throw new InvalidOperationException("DATABASE_URL is not set");

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(connectionString));

builder.Services.AddSingleton<IndSponsorScraper>();
builder.Services.AddSingleton<CompanyEnricher>();
builder.Services.AddSingleton<JobLinkParser>();
builder.Services.AddSingleton<TokenService>();
builder.Services.AddSingleton<RateLimiterService>();
builder.Services.AddSingleton<ExportApiKeyService>();
builder.Services.AddSingleton<backend.Controllers.ExportApiKeyFilter>();
builder.Services.AddSingleton<EmailService>();
builder.Services.AddScoped<UserStore>();
builder.Services.AddScoped<StageStore>();
builder.Services.AddScoped<SponsorStore>();
builder.Services.AddScoped<CompanyListStore>();
builder.Services.AddSingleton<GhostDetectionService>();
builder.Services.AddHostedService<MonthlyIndSponsorSyncWorker>();
builder.Services.AddHostedService<GhostDetectionWorker>();

var app = builder.Build();

// Must run before anything reads the client address: it replaces
// Connection.RemoteIpAddress with the address nginx forwarded, but only when
// the request really came from the local nginx.
app.UseForwardedHeaders(ProxyHeaders.Options());

// Only the export. Compressing a response that mixes a secret with text the
// caller chose is how BREACH works, and the auth endpoints return tokens next to
// an echoed email address. The export holds no secrets and no caller input.
app.UseWhen(
    ctx => ctx.Request.Path.StartsWithSegments("/api/export"),
    branch => branch.UseResponseCompression());

app.UseCors();
app.MapControllers();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await db.Database.MigrateAsync();
    if (!await db.Sponsors.AnyAsync())
    {
        db.Sponsors.AddRange(SeedData.Companies);
        await db.SaveChangesAsync();
    }

    var adminEmail = Environment.GetEnvironmentVariable("ADMIN_EMAIL");
    if (!string.IsNullOrWhiteSpace(adminEmail))
    {
        var adminUser = await db.Users.FirstOrDefaultAsync(
            u => u.Email == adminEmail.Trim().ToLowerInvariant());
        if (adminUser is not null && adminUser.Role != "admin")
        {
            adminUser.Role = "admin";
            await db.SaveChangesAsync();
        }
    }
}

app.Run();
