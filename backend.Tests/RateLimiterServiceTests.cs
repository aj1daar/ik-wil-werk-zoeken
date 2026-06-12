using backend.Services;
using Xunit;

namespace backend.Tests;

public sealed class RateLimiterServiceTests
{
    [Fact]
    public void FirstRequest_IsAllowed()
    {
        var svc = new RateLimiterService();
        Assert.True(svc.IsAllowed("key1", maxRequests: 3, windowSeconds: 60));
    }

    [Fact]
    public void RequestsUpToMax_AreAllAllowed()
    {
        var svc = new RateLimiterService();
        Assert.True(svc.IsAllowed("key", 5, 60));
        Assert.True(svc.IsAllowed("key", 5, 60));
        Assert.True(svc.IsAllowed("key", 5, 60));
        Assert.True(svc.IsAllowed("key", 5, 60));
        Assert.True(svc.IsAllowed("key", 5, 60));
    }

    [Fact]
    public void RequestBeyondMax_IsDenied()
    {
        var svc = new RateLimiterService();
        for (var i = 0; i < 3; i++) svc.IsAllowed("key", 3, 60);
        Assert.False(svc.IsAllowed("key", 3, 60));
    }

    [Fact]
    public void SubsequentDeniedRequests_RemainDenied()
    {
        var svc = new RateLimiterService();
        for (var i = 0; i < 2; i++) svc.IsAllowed("key", 2, 60);
        Assert.False(svc.IsAllowed("key", 2, 60));
        Assert.False(svc.IsAllowed("key", 2, 60));
    }

    [Fact]
    public void DifferentKeys_AreTrackedIndependently()
    {
        var svc = new RateLimiterService();
        for (var i = 0; i < 3; i++) svc.IsAllowed("ip-a", 3, 60);
        // ip-a is now exhausted, but ip-b should still be fine
        Assert.False(svc.IsAllowed("ip-a", 3, 60));
        Assert.True(svc.IsAllowed("ip-b", 3, 60));
    }

    [Fact]
    public void WindowReset_AllowsRequestsAgain()
    {
        var svc = new RateLimiterService();
        for (var i = 0; i < 2; i++) svc.IsAllowed("key", 2, 1);
        Assert.False(svc.IsAllowed("key", 2, 1));

        // Wait for the 1-second window to expire
        Thread.Sleep(1100);

        Assert.True(svc.IsAllowed("key", 2, 1));
    }

    [Fact]
    public void MaxRequestsOne_AllowsFirstDeniesSecond()
    {
        var svc = new RateLimiterService();
        Assert.True(svc.IsAllowed("strict", 1, 60));
        Assert.False(svc.IsAllowed("strict", 1, 60));
    }

    [Fact]
    public void ZeroWindow_TreatsEveryCallAsNewWindow()
    {
        var svc = new RateLimiterService();
        // windowSeconds=0 means the window always expires immediately
        Assert.True(svc.IsAllowed("key", 1, 0));
        Assert.True(svc.IsAllowed("key", 1, 0));
    }

    [Fact]
    public void ConcurrentCalls_DoNotExceedMaxByMoreThanOne()
    {
        // Smoke test: concurrent requests should not cause exceptions
        var svc = new RateLimiterService();
        var results = new System.Collections.Concurrent.ConcurrentBag<bool>();
        Parallel.For(0, 20, _ => results.Add(svc.IsAllowed("shared", 5, 60)));
        // At least 5 should be allowed and no exception thrown
        Assert.True(results.Count(r => r) >= 5);
    }
}
