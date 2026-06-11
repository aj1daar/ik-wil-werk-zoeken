using System.Collections.Concurrent;
using backend.Models;

namespace backend.Services;

public sealed class SponsorStore
{
    public ConcurrentDictionary<string, SponsorCompany> Companies { get; } = new();
}
