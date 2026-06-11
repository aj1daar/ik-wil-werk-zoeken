using System.Collections.Concurrent;
using backend.Models;

namespace backend.Services;

public sealed class SponsorStore
{
    public ConcurrentDictionary<string, SponsorCompany>   Companies { get; } = new();
    public ConcurrentDictionary<string, ApplicationStage> Stages    { get; } = new();
}
