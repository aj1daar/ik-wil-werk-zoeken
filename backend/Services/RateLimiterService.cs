namespace backend.Services;

public sealed class RateLimiterService
{
    private readonly Dictionary<string, (int Count, long WindowStart)> _buckets = new();
    private readonly object _lock = new();

    /// <summary>
    /// Fixed-window rate limiter. Returns true if the request is within limits.
    /// </summary>
    public bool IsAllowed(string key, int maxRequests, int windowSeconds)
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        lock (_lock)
        {
            if (!_buckets.TryGetValue(key, out var entry) || now - entry.WindowStart >= windowSeconds)
            {
                _buckets[key] = (1, now);
                return true;
            }
            if (entry.Count >= maxRequests) return false;
            _buckets[key] = (entry.Count + 1, entry.WindowStart);
            return true;
        }
    }
}
