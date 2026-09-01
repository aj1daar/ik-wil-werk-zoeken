using backend.Data;
using backend.Services;
using Microsoft.Extensions.DependencyInjection;

namespace backend.Workers;

// Periodically sweeps applications stuck in "Applied" for 2+ months into
// "Ghosted". Runs on startup (so a redeploy doesn't leave stale apps waiting
// out the interval) and then on a fixed cadence — cheap query, coarse
// threshold, no need for tighter scheduling.
public sealed class GhostDetectionWorker : BackgroundService
{
    private readonly GhostDetectionService _detector;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<GhostDetectionWorker> _logger;

    public GhostDetectionWorker(
        GhostDetectionService detector,
        IServiceScopeFactory scopeFactory,
        ILogger<GhostDetectionWorker> logger)
    {
        _detector = detector;
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            await RunSweepAsync(stoppingToken);
            try { await Task.Delay(GhostDetectionService.MinRunInterval, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }

    private async Task RunSweepAsync(CancellationToken ct)
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var ghosted = await _detector.SweepAsync(db, DateTimeOffset.UtcNow, ct);
            if (ghosted > 0)
                _logger.LogInformation("Marked {Count} stale application(s) as Ghosted", ghosted);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogError(ex, "Ghost detection sweep failed");
        }
    }
}
