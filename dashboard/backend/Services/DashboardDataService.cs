using FrugalApi.Dashboard.Api.Models;

namespace FrugalApi.Dashboard.Api.Services;

public sealed class DashboardDataService : IDashboardDataService
{
    private static readonly Dictionary<string, (double Power, double Co2, double Water, double Cost)> ModelEfficiency = new(StringComparer.OrdinalIgnoreCase)
    {
        ["gpt-4.1-mini"] = (1.0, 1.0, 1.0, 1.0),
        ["gpt-4.1"] = (1.55, 1.52, 1.45, 3.2),
        ["gpt-4o-mini"] = (1.12, 1.10, 1.08, 1.35),
        ["claude-3.7-sonnet"] = (1.42, 1.38, 1.33, 2.8),
        ["llama-3.3-70b"] = (1.9, 1.86, 1.75, 1.9)
    };

    private readonly List<AiRequestBase> _requests =
    [
        new(
            "REQ-5001",
            "gpt-4.1",
            "round-robin",
            "Summarize vendor invoices",
            68,
            104,
            1850,
            4.4,
            DateTimeOffset.Parse("2026-03-20T08:05:00Z"),
            new(2.2, 1.1, 16, 0.0005)
        ),
        new(
            "REQ-5002",
            "gpt-4.1",
            "latency-first",
            "Create sprint release notes",
            87,
            136,
            2460,
            4.1,
            DateTimeOffset.Parse("2026-03-20T08:40:00Z"),
            new(2.8, 1.5, 19, 0.0007)
        ),
        new(
            "REQ-5003",
            "gpt-4.1",
            "cost-optimized",
            "Draft customer response email",
            54,
            89,
            1410,
            4.6,
            DateTimeOffset.Parse("2026-03-20T09:12:00Z"),
            new(
                1.6,
                0.8,
                11, 0.0004)
        ),
        new(
            "REQ-5005",
            "gpt-4.1",
            "round-robin",
            "Refactor SQL query",
            62,
            93,
            1680,
            4.3,
            DateTimeOffset.Parse("2026-03-20T11:37:00Z"),
            new(
                2.0,
                1.0,
                14, 0.0005 )
        )
    ];
    
    public List<AiRequest> GetAllRequests(
        string comparisonModel,
        IReadOnlyCollection<string>? routingMethods,
        double? minValidationScore,
        DateTimeOffset? since,
        DateTimeOffset? until)
    {
        var selectedRoutingMethods = routingMethods?.Where(x => !string.IsNullOrWhiteSpace(x)).ToArray() ?? [];

        var requests = GetRequests(comparisonModel);

        return FilterRequestsAndAtComparision(requests, comparisonModel, selectedRoutingMethods, minValidationScore ?? 0, since ?? DateTimeOffset.MinValue, until ?? DateTimeOffset.MaxValue);
    }

    private IReadOnlyList<AiRequestBase> GetRequests(string comparisonModel)
    {
            return _requests
                .OrderByDescending(x => x.CreatedAt)
                .ToList();
    }


    private RequestMetadata EstimateComparisonMetrics(AiRequestBase aiRequest, string comparisonModel)
    {
        var baseline = ModelEfficiency["gpt-4.1-mini"];
        var current = ModelEfficiency.TryGetValue(aiRequest.Model, out var currentMetrics) ? currentMetrics : baseline;
        var comparison = ModelEfficiency.TryGetValue(comparisonModel, out var comparisonMetrics) ? comparisonMetrics : baseline;

        return new(
            Math.Round(aiRequest.ActualMetadata.PowerWh * (comparison.Power / current.Power), 3),
            Math.Round(aiRequest.ActualMetadata.Co2 * (comparison.Co2 / current.Co2), 3),
            Math.Round(aiRequest.ActualMetadata.WaterMl * (comparison.Water / current.Water), 3),
            Math.Round(aiRequest.ActualMetadata.CostUsd * (comparison.Cost / current.Cost), 6)
        );
    }

    private List<AiRequest> FilterRequestsAndAtComparision(
        IEnumerable<AiRequestBase> requests,
        string comparisonModel,
        IReadOnlyCollection<string> routingMethods,
        double minValidationScore,
        DateTimeOffset since,
        DateTimeOffset until)
    {
        var selectedRoutingMethods = routingMethods.Where(x => !string.IsNullOrWhiteSpace(x)).ToHashSet(StringComparer.OrdinalIgnoreCase);

        return requests
            .Where(x => (selectedRoutingMethods.Count == 0 || selectedRoutingMethods.Contains(x.RoutingMethod)) &&
                        x.ValidationScore >= minValidationScore &&
                        x.CreatedAt >= since &&
                        x.CreatedAt <= until)
            .Select(x => new AiRequest(x, EstimateComparisonMetrics(x, comparisonModel)))
            .ToList();
    }
}
