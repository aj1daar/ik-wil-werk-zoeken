using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Extensions.Timer;
using Microsoft.Extensions.Logging;

namespace backend.Functions;

public sealed class MonthlyIndSponsorSyncFunction
{
    [Function("MonthlyIndSponsorSync")]
    public void Run([TimerTrigger("0 0 0 1 * *")] TimerInfo timerInfo, FunctionContext context)
    {
        var logger = context.GetLogger<MonthlyIndSponsorSyncFunction>();
        logger.LogInformation("Monthly IND sponsor sync initiated at {Timestamp}", DateTimeOffset.UtcNow);
        logger.LogInformation("Timer schedule status: Last={Last} Next={Next}", timerInfo.ScheduleStatus?.Last, timerInfo.ScheduleStatus?.Next);
    }
}
