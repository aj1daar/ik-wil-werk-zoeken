using backend.Controllers;
using backend.Models;
using Xunit;

namespace backend.Tests;

// Unit tests for DashboardController.BuildStatusFlow — pure aggregation from
// chronological StatusHistory rows into a branching status tree (nodes with
// total/current counts, edges between consecutive statuses per application).

public sealed class StatusFlowTests
{
    private static StatusHistory H(string appId, string status, int year, int month, int day, int hour = 0)
        => new()
        {
            ApplicationId = appId,
            UserId        = "u1",
            Status        = status,
            StatusDate    = new DateOnly(year, month, day),
            CreatedAt     = new DateTimeOffset(year, month, day, hour, 0, 0, TimeSpan.Zero),
        };

    [Fact]
    public void NoHistory_ReturnsNoNodes()
    {
        var result = DashboardController.BuildStatusFlow([], new Dictionary<string, string>());
        Assert.Empty(result.Nodes);
        Assert.Empty(result.Edges);
    }

    [Fact]
    public void SingleApplied_OneNodeNoEdges()
    {
        var history = new[] { H("a1", "Applied", 2026, 1, 1) };
        var status  = new Dictionary<string, string> { ["a1"] = "Applied" };

        var result = DashboardController.BuildStatusFlow(history, status);

        var node = Assert.Single(result.Nodes);
        Assert.Equal("Applied", node.Status);
        Assert.Equal(1, node.Total);
        Assert.Equal(1, node.Current);
        Assert.Empty(result.Edges);
    }

    [Fact]
    public void AppliedThenInterview_CreatesOneEdge()
    {
        var history = new[]
        {
            H("a1", "Applied", 2026, 1, 1),
            H("a1", "InterviewScheduled", 2026, 1, 5),
        };
        var status = new Dictionary<string, string> { ["a1"] = "InterviewScheduled" };

        var result = DashboardController.BuildStatusFlow(history, status);

        Assert.Equal(2, result.Nodes.Length);
        var edge = Assert.Single(result.Edges);
        Assert.Equal("Applied", edge.From);
        Assert.Equal("InterviewScheduled", edge.To);
        Assert.Equal(1, edge.Count);

        var applied = result.Nodes.Single(n => n.Status == "Applied");
        Assert.Equal(1, applied.Total);
        Assert.Equal(0, applied.Current); // moved on, not sitting there any more

        var interview = result.Nodes.Single(n => n.Status == "InterviewScheduled");
        Assert.Equal(1, interview.Total);
        Assert.Equal(1, interview.Current);
    }

    [Fact]
    public void TwoApplicationsBranchDifferently_EdgesFanOutFromSameSource()
    {
        var history = new[]
        {
            H("a1", "Applied", 2026, 1, 1),
            H("a1", "InterviewScheduled", 2026, 1, 5),
            H("a2", "Applied", 2026, 1, 2),
            H("a2", "Rejected", 2026, 1, 3),
        };
        var status = new Dictionary<string, string> { ["a1"] = "InterviewScheduled", ["a2"] = "Rejected" };

        var result = DashboardController.BuildStatusFlow(history, status);

        var applied = result.Nodes.Single(n => n.Status == "Applied");
        Assert.Equal(2, applied.Total); // both apps passed through Applied
        Assert.Equal(0, applied.Current);

        Assert.Equal(2, result.Edges.Length);
        Assert.Contains(result.Edges, e => e.From == "Applied" && e.To == "InterviewScheduled" && e.Count == 1);
        Assert.Contains(result.Edges, e => e.From == "Applied" && e.To == "Rejected" && e.Count == 1);
    }

    [Fact]
    public void ConsecutiveDuplicateStatus_CollapsedIntoOneHop()
    {
        // e.g. the journey UI let the user edit an OnHold entry's date without
        // changing the status — history now has two OnHold rows in a row.
        var history = new[]
        {
            H("a1", "Applied", 2026, 1, 1),
            H("a1", "OnHold", 2026, 1, 5),
            H("a1", "OnHold", 2026, 1, 10),
        };
        var status = new Dictionary<string, string> { ["a1"] = "OnHold" };

        var result = DashboardController.BuildStatusFlow(history, status);

        Assert.Equal(2, result.Nodes.Length);
        var edge = Assert.Single(result.Edges);
        Assert.Equal("Applied", edge.From);
        Assert.Equal("OnHold", edge.To);
        Assert.Equal(1, edge.Count);
    }

    [Fact]
    public void SameDayStatusChanges_OrderFollowsCreatedAtNotArrayOrder()
    {
        // Both entries share a StatusDate; the caller is expected to have
        // already sorted by StatusDate then CreatedAt, so BuildStatusFlow
        // must trust that order rather than re-deriving it from StatusDate.
        var history = new[]
        {
            H("a1", "Applied", 2026, 1, 1, hour: 9),
            H("a1", "InterviewScheduled", 2026, 1, 1, hour: 10), // same day, later CreatedAt
            H("a1", "OnHold", 2026, 1, 1, hour: 11),             // same day, later still
        };
        var status = new Dictionary<string, string> { ["a1"] = "OnHold" };

        var result = DashboardController.BuildStatusFlow(history, status);

        Assert.Equal(2, result.Edges.Length);
        Assert.Contains(result.Edges, e => e.From == "Applied" && e.To == "InterviewScheduled");
        Assert.Contains(result.Edges, e => e.From == "InterviewScheduled" && e.To == "OnHold");
        // Not a direct Applied to OnHold edge — the middle hop must be respected.
        Assert.DoesNotContain(result.Edges, e => e.From == "Applied" && e.To == "OnHold");
    }

    [Fact]
    public void CurrentStatusMissingFromHistory_AppendedAsFinalHop()
    {
        // Defensive: a status change made through a path that skipped writing
        // a StatusHistory row still needs to show up as where the app is now.
        var history = new[] { H("a1", "Applied", 2026, 1, 1) };
        var status  = new Dictionary<string, string> { ["a1"] = "Accepted" };

        var result = DashboardController.BuildStatusFlow(history, status);

        Assert.Equal(2, result.Nodes.Length);
        var accepted = result.Nodes.Single(n => n.Status == "Accepted");
        Assert.Equal(1, accepted.Total);
        Assert.Equal(1, accepted.Current);
        var edge = Assert.Single(result.Edges);
        Assert.Equal("Applied", edge.From);
        Assert.Equal("Accepted", edge.To);
    }

    [Fact]
    public void MultipleAppsThroughSameEdge_CountAccumulates()
    {
        var history = new[]
        {
            H("a1", "Applied", 2026, 1, 1),
            H("a1", "Rejected", 2026, 1, 2),
            H("a2", "Applied", 2026, 1, 1),
            H("a2", "Rejected", 2026, 1, 2),
            H("a3", "Applied", 2026, 1, 1),
            H("a3", "Rejected", 2026, 1, 2),
        };
        var status = new Dictionary<string, string> { ["a1"] = "Rejected", ["a2"] = "Rejected", ["a3"] = "Rejected" };

        var result = DashboardController.BuildStatusFlow(history, status);

        var edge = Assert.Single(result.Edges);
        Assert.Equal(3, edge.Count);
        var rejected = result.Nodes.Single(n => n.Status == "Rejected");
        Assert.Equal(3, rejected.Total);
        Assert.Equal(3, rejected.Current);
    }

    [Fact]
    public void ApplicationNotInCurrentStatusMap_StillCountedFromHistoryAlone()
    {
        // GetStatusFlow only passes ids that are in range into currentStatusById;
        // history rows for apps outside range are filtered out by the caller before
        // this method runs, but if one slips through it should still fold in fine.
        var history = new[] { H("a1", "Applied", 2026, 1, 1), H("a1", "OnHold", 2026, 1, 2) };
        var status = new Dictionary<string, string>(); // a1 missing

        var result = DashboardController.BuildStatusFlow(history, status);

        Assert.Equal(2, result.Nodes.Length);
        var edge = Assert.Single(result.Edges);
        Assert.Equal("Applied", edge.From);
        Assert.Equal("OnHold", edge.To);
    }
}
