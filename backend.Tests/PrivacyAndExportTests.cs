using System.Net;
using System.Text;
using backend.Controllers;
using backend.Data;
using backend.Models;
using backend.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace backend.Tests;

/// <summary>
/// What registration asks for, what it records about agreement, and the export
/// that answers "show me everything you hold about me".
/// </summary>
public sealed class PrivacyAndExportTests : IDisposable
{
    private readonly SqliteConnection _conn;
    private readonly AppDbContext _db;
    private readonly string? _previousSecret;

    public PrivacyAndExportTests()
    {
        _previousSecret = Environment.GetEnvironmentVariable("JWT_SECRET");
        Environment.SetEnvironmentVariable("JWT_SECRET", "test-secret-for-privacy-tests");

        _conn = new SqliteConnection("DataSource=:memory:");
        _conn.Open();
        _db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(_conn).Options);
        _db.Database.EnsureCreated();
    }

    public void Dispose()
    {
        Environment.SetEnvironmentVariable("JWT_SECRET", _previousSecret);
        _db.Dispose();
        _conn.Dispose();
    }

    private readonly TokenService _tokens = new();

    private AuthController Controller(string ip = "198.51.100.10", string? bearer = null)
    {
        var controller = new AuthController(
            _tokens,
            new UserStore(_db),
            new EmailService(new NoHttp(), new TestEnv(), NullLogger<EmailService>.Instance),
            new RateLimiterService(),
            new GoogleIdentityService(new NoHttp(), NullLogger<GoogleIdentityService>.Instance),
            new MyDataExporter(_db));

        var http = new DefaultHttpContext();
        http.Connection.RemoteIpAddress = IPAddress.Parse(ip);
        if (bearer is not null) http.Request.Headers.Authorization = bearer;
        controller.ControllerContext = new ControllerContext { HttpContext = http };
        return controller;
    }

    private static RegisterRequest Registration(string email = "someone@example.com") => new()
    {
        Email          = email,
        Password       = "correct horse battery",
        GdprConsentAt  = DateTimeOffset.UtcNow.ToString("o"),
        PrivacyVersion = PrivacyNotice.Version,
    };

    // ── what registration asks for ───────────────────────────────────────────

    [Fact]
    public async Task CreatesAnAccountFromAnAddressAPasswordAndAgreement()
    {
        var result = await Controller().Register(Registration());

        Assert.Equal(201, Assert.IsType<ObjectResult>(result).StatusCode);
        var user = Assert.Single(_db.Users);
        Assert.Equal("someone@example.com", user.Email);
        Assert.Equal(PrivacyNotice.Version, user.PrivacyVersion);
        Assert.NotEqual(string.Empty, user.GdprConsentAt);
    }

    [Fact]
    public async Task AsksForNoNameAndStoresNone()
    {
        await Controller().Register(Registration());

        var user = Assert.Single(_db.Users);
        Assert.Equal(string.Empty, user.FirstName);
        Assert.Equal(string.Empty, user.LastName);
    }

    [Fact]
    public async Task AsksForNoPreferencesAndLeavesTheDefaults()
    {
        await Controller().Register(Registration());

        var user = Assert.Single(_db.Users);
        Assert.Null(user.TargetRole);
        Assert.Null(user.PreferredLocation);
        Assert.Equal("any", user.WorkType);
    }

    [Fact]
    public async Task StillAcceptsANameFromAnOlderPage()
    {
        var body = Registration();
        body.FirstName = "  Jan  ";
        body.LastName  = "de Vries";
        body.Preferences = new PreferencesPayload { TargetRole = "Backend Engineer", WorkType = "hybrid" };

        await Controller().Register(body);

        var user = Assert.Single(_db.Users);
        Assert.Equal("Jan", user.FirstName);
        Assert.Equal("de Vries", user.LastName);
        Assert.Equal("Backend Engineer", user.TargetRole);
        Assert.Equal("hybrid", user.WorkType);
    }

    [Fact]
    public async Task StillRefusesANameNobodyHas()
    {
        var body = Registration();
        body.FirstName = new string('x', 101);

        Assert.Equal(400, Assert.IsType<ObjectResult>(await Controller().Register(body)).StatusCode);
        Assert.Empty(_db.Users);
    }

    // ── agreement to a notice, not to a timestamp ────────────────────────────

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("2020-01-01")]
    [InlineData("v1")]
    public async Task RefusesAgreementToAnythingButTheCurrentNotice(string? version)
    {
        var body = Registration();
        body.PrivacyVersion = version!;

        var result = await Controller().Register(body);
        Assert.Equal(400, Assert.IsType<ObjectResult>(result).StatusCode);
        Assert.Empty(_db.Users);
    }

    [Fact]
    public async Task RefusesRegistrationWithNoConsentAtAll()
    {
        var body = Registration();
        body.GdprConsentAt = string.Empty;

        Assert.Equal(400, Assert.IsType<ObjectResult>(await Controller().Register(body)).StatusCode);
        Assert.Empty(_db.Users);
    }

    [Fact]
    public void TheNoticeVersionIsADate()
    {
        Assert.True(DateOnly.TryParse(PrivacyNotice.Version, out _));
        Assert.True(PrivacyNotice.IsCurrent(PrivacyNotice.Version));
        Assert.True(PrivacyNotice.IsCurrent($" {PrivacyNotice.Version} "));
        Assert.False(PrivacyNotice.IsCurrent(null));
        Assert.False(PrivacyNotice.IsCurrent("1999-01-01"));
    }

    // ── taking your data with you ────────────────────────────────────────────

    private async Task<(User user, string token)> SignedInUserAsync(string email = "someone@example.com")
    {
        var user = new User
        {
            Email = email,
            FirstName = "Jan",
            LastName = "de Vries",
            PasswordHash = PasswordHasher.Hash("correct horse battery"),
            TargetRole = "Backend Engineer",
            PreferredLocation = "Amsterdam",
            WorkType = "hybrid",
            EmailVerified = true,
            GdprConsentAt = "2026-10-16T09:00:00.000Z",
            PrivacyVersion = PrivacyNotice.Version,
        };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();
        return (user, _tokens.CreateToken(user)!);
    }

    private async Task AddDataAsync(User user, string companyId = "c1")
    {
        var application = new ApplicationStage
        {
            Id = Guid.NewGuid().ToString("N"),
            UserId = user.UserId,
            CompanyName = "Adyen N.V.",
            Position = "Senior Backend Engineer",
            Status = "Applied",
            AppliedAt = DateTimeOffset.UtcNow,
        };
        _db.Stages.Add(application);
        _db.StatusHistories.Add(new StatusHistory
        {
            ApplicationId = application.Id,
            UserId = user.UserId,
            Status = "Applied",
            StatusDate = DateOnly.FromDateTime(DateTime.UtcNow),
        });
        _db.ActivityLogs.Add(new ActivityLog
        {
            ApplicationId = application.Id,
            UserId = user.UserId,
            Field = "status",
            OldValue = "Applied",
            NewValue = "Interview",
        });
        _db.Sponsors.Add(new SponsorCompany
        {
            Id = companyId,
            Name = "Adyen N.V.",
            KvKNumber = "12345678",
            IsIndRecognizedSponsor = true,
        });
        _db.CompanyLists.Add(new CompanyListEntry
        {
            UserId = user.UserId,
            SponsorCompanyId = companyId,
            Kind = "interested",
        });
        await _db.SaveChangesAsync();
    }

    [Fact]
    public async Task GivesTheAccountItsOwnData()
    {
        var (user, token) = await SignedInUserAsync();
        await AddDataAsync(user);

        var result = await Controller(bearer: $"Bearer {token}").MyData();
        var data = Assert.IsType<MyDataResponse>(Assert.IsType<OkObjectResult>(result).Value);

        Assert.Equal("someone@example.com", data.Account.Email);
        Assert.Equal(PrivacyNotice.Version, data.Account.PrivacyVersion);
        Assert.True(data.Account.HasPassword);
        Assert.False(data.Account.GoogleLinked);
        Assert.Single(data.Applications);
        Assert.Single(data.StatusHistory);
        Assert.Single(data.Activity);
        var listed = Assert.Single(data.CompanyLists);
        Assert.Equal("Adyen N.V.", listed.CompanyName);
        Assert.Equal("interested", listed.List);
    }

    [Fact]
    public async Task NeverIncludesThePasswordHash()
    {
        var (user, token) = await SignedInUserAsync();
        await AddDataAsync(user);

        var result = await Controller(bearer: $"Bearer {token}").MyData();
        var data = Assert.IsType<MyDataResponse>(Assert.IsType<OkObjectResult>(result).Value);

        var json = System.Text.Json.JsonSerializer.Serialize(data, AppJsonSerializerContext.Default.MyDataResponse);
        Assert.DoesNotContain("SHA256.", json);
        Assert.DoesNotContain(user.PasswordHash, json);
    }

    [Fact]
    public async Task SaysWhenAnAccountHasNoPasswordAndIsLinkedToGoogle()
    {
        var user = new User
        {
            Email = "google@example.com",
            PasswordHash = string.Empty,
            GoogleSubject = "google-subject-1",
            EmailVerified = true,
            GdprConsentAt = "2026-10-16T09:00:00.000Z",
            PrivacyVersion = PrivacyNotice.Version,
        };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        var result = await Controller(bearer: $"Bearer {_tokens.CreateToken(user)}").MyData();
        var data = Assert.IsType<MyDataResponse>(Assert.IsType<OkObjectResult>(result).Value);

        Assert.False(data.Account.HasPassword);
        Assert.True(data.Account.GoogleLinked);
    }

    [Fact]
    public async Task GivesNobodyElsesData()
    {
        var (mine, token) = await SignedInUserAsync("mine@example.com");
        await AddDataAsync(mine, "c1");

        var (theirs, _) = await SignedInUserAsync("theirs@example.com");
        await AddDataAsync(theirs, "c2");

        var result = await Controller(bearer: $"Bearer {token}").MyData();
        var data = Assert.IsType<MyDataResponse>(Assert.IsType<OkObjectResult>(result).Value);

        Assert.Equal("mine@example.com", data.Account.Email);
        Assert.Single(data.Applications);
        Assert.All(data.Applications, a => Assert.Equal(mine.UserId, a.UserId));
        Assert.All(data.Activity, a => Assert.Equal(mine.UserId, a.UserId));
        Assert.All(data.StatusHistory, h => Assert.Equal(mine.UserId, h.UserId));
        Assert.Single(data.CompanyLists);
    }

    [Fact]
    public async Task IsEmptyButValidForAnAccountThatHasDoneNothing()
    {
        var (_, token) = await SignedInUserAsync();

        var result = await Controller(bearer: $"Bearer {token}").MyData();
        var data = Assert.IsType<MyDataResponse>(Assert.IsType<OkObjectResult>(result).Value);

        Assert.Empty(data.Applications);
        Assert.Empty(data.Activity);
        Assert.Empty(data.CompanyLists);
        Assert.NotEqual(string.Empty, data.ExportedAt);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("Bearer not-a-token")]
    [InlineData("Bearer a.b.c")]
    public async Task RefusesAnyoneWhoIsNotSignedIn(string? bearer)
    {
        var result = await Controller(bearer: bearer).MyData();
        Assert.Equal(401, Assert.IsType<ObjectResult>(result).StatusCode);
    }

    [Fact]
    public async Task CannotBeUsedAsAWayToHammerTheDatabase()
    {
        var (_, token) = await SignedInUserAsync();
        var controller = Controller(bearer: $"Bearer {token}");

        for (var i = 0; i < 5; i++) Assert.IsType<OkObjectResult>(await controller.MyData());

        Assert.Equal(429, Assert.IsType<ObjectResult>(await controller.MyData()).StatusCode);
    }

    // ── test doubles ─────────────────────────────────────────────────────────

    private sealed class NoHttp : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(new Refuse(), disposeHandler: false);

        private sealed class Refuse : HttpMessageHandler
        {
            protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) =>
                Task.FromResult(new HttpResponseMessage(HttpStatusCode.ServiceUnavailable)
                {
                    Content = new StringContent("{}", Encoding.UTF8, "application/json"),
                });
        }
    }

    private sealed class TestEnv : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Testing";
        public string ApplicationName { get; set; } = "backend.Tests";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } =
            new Microsoft.Extensions.FileProviders.NullFileProvider();
    }
}
