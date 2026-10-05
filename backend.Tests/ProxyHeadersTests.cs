using System.Net;
using backend.Controllers;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;

namespace backend.Tests;

// The client address decides who a rate limit applies to, so a caller must not be
// able to choose it. These tests run the real ForwardedHeaders middleware with the
// production options from ProxyHeaders, then read the address the way the
// controllers do.
public sealed class ProxyHeadersTests
{
    private sealed class TestController : ApiControllerBase
    {
        public string Ip() => GetClientIp();
    }

    // Runs the middleware exactly as Program.cs configures it.
    private static async Task<HttpContext> Handle(string? remoteIp, params string[] forwardedFor)
    {
        var context = new DefaultHttpContext();
        context.Connection.RemoteIpAddress = remoteIp is null ? null : IPAddress.Parse(remoteIp);
        if (forwardedFor.Length > 0)
            context.Request.Headers["X-Forwarded-For"] = forwardedFor;

        var middleware = new ForwardedHeadersMiddleware(
            _ => Task.CompletedTask,
            NullLoggerFactory.Instance,
            Options.Create(ProxyHeaders.Options()));

        await middleware.Invoke(context);
        return context;
    }

    private static string ClientIp(HttpContext context) =>
        new TestController { ControllerContext = { HttpContext = context } }.Ip();

    // ── the header is only believed from the local nginx ─────────────────────

    [Fact]
    public async Task TakesTheForwardedAddressFromTheLocalProxy()
    {
        var context = await Handle("127.0.0.1", "203.0.113.7");
        Assert.Equal("203.0.113.7", ClientIp(context));
    }

    [Fact]
    public async Task IgnoresASpoofedHeaderFromAnUntrustedSource()
    {
        var context = await Handle("198.51.100.4", "203.0.113.7");
        Assert.Equal("198.51.100.4", ClientIp(context));
    }

    [Fact]
    public async Task IgnoresASpoofedHeaderFromAPrivateNetworkAddress()
    {
        // 10.0.0.0/8 is trusted by the ForwardedHeaders defaults. ProxyHeaders
        // clears KnownNetworks precisely so it is not.
        var context = await Handle("10.1.2.3", "203.0.113.7");
        Assert.Equal("10.1.2.3", ClientIp(context));
    }

    [Fact]
    public async Task AcceptsTheHeaderOverIPv6MappedLoopback()
    {
        var context = await Handle("::ffff:127.0.0.1", "203.0.113.7");
        Assert.Equal("203.0.113.7", ClientIp(context));
    }

    // ── a caller cannot prepend addresses of its own ─────────────────────────

    [Fact]
    public async Task ReadsOnlyTheLastEntryWhenACallerPrependsItsOwn()
    {
        // nginx appends the address it saw, so the entry it added is the last one.
        // ForwardLimit 1 stops there and the caller's invention is discarded.
        var context = await Handle("127.0.0.1", "1.2.3.4, 203.0.113.7");
        Assert.Equal("203.0.113.7", ClientIp(context));
    }

    [Fact]
    public async Task IgnoresAnUnparseableForwardedAddress()
    {
        var context = await Handle("127.0.0.1", "not-an-ip");
        Assert.Equal("127.0.0.1", ClientIp(context));
    }

    [Fact]
    public async Task IgnoresAnEmptyForwardedHeader()
    {
        var context = await Handle("127.0.0.1", "");
        Assert.Equal("127.0.0.1", ClientIp(context));
    }

    // ── the other headers carry no weight any more ───────────────────────────

    [Fact]
    public async Task IgnoresXClientIpEntirely()
    {
        var context = await Handle("198.51.100.4");
        context.Request.Headers["X-Client-IP"] = "203.0.113.7";
        Assert.Equal("198.51.100.4", ClientIp(context));
    }

    [Fact]
    public void ReportsUnknownWhenThereIsNoConnectionAddress()
    {
        // A TCP connection always has a remote address, so this only happens off
        // TCP. Worth pinning anyway: the value is used as a rate limit key, and an
        // empty string would put every such caller in one bucket by accident.
        Assert.Equal("unknown", ClientIp(new DefaultHttpContext()));
    }
}
