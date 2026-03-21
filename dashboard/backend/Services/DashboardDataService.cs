using FrugalApi.Dashboard.Api.Models;
using Microsoft.Extensions.Options;

namespace FrugalApi.Dashboard.Api.Services;

public sealed class DashboardDataService(ITraceDataService traceDataService, 
    IOptions<ModelEnvironmentalMetricsOptions> environmentalMetricsOptions) : IDashboardDataService
{
    public List<string> GetAvailableComparisonModels()
    {
        return environmentalMetricsOptions.Value.Models.Keys.OrderBy(x => x, StringComparer.OrdinalIgnoreCase).ToList();
    }

    public async Task<List<AiRequest>> GetAllRequestsAsync(
        string comparisonModel,
        IReadOnlyCollection<string>? routingMethods,
        double? minValidationScore,
        DateTimeOffset? since,
        DateTimeOffset? until,
        CancellationToken cancellationToken = default)
    {
        var selectedRoutingMethods = routingMethods?.Where(x => !string.IsNullOrWhiteSpace(x)).ToArray() ?? [];

        var requests = await GetRequestsAsync(since, until, cancellationToken);

        return FilterRequestsAndAtComparison(requests, comparisonModel, selectedRoutingMethods, minValidationScore ?? 0, since ?? DateTimeOffset.MinValue, until ?? DateTimeOffset.MaxValue);
    }

    private async Task<IReadOnlyList<AiRequestBase>> GetRequestsAsync(
        DateTimeOffset? since,
        DateTimeOffset? until,
        CancellationToken cancellationToken)
    {
        return await traceDataService.GetTraceRequestsAsync(since, until, cancellationToken);
    }

    private RequestMetadata EstimateComparisonMetrics(AiRequestBase aiRequest, string comparisonModel)
    {
        if (!environmentalMetricsOptions.Value.Models.TryGetValue(comparisonModel, out var comparisonMetrics))
            throw new InvalidOperationException($"No environmental metrics configured for model {comparisonModel}.");

        var totalTokens = aiRequest.InputTokens + aiRequest.OutputTokens;
        return new(totalTokens * comparisonMetrics.PowerWh,
                totalTokens * comparisonMetrics.Co2,
                totalTokens * comparisonMetrics.WaterMl,
                totalTokens * comparisonMetrics.CostUsd);
    }

    private List<AiRequest> FilterRequestsAndAtComparison(
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
