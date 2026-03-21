using FrugalApi.Dashboard.Api.Models;
using Microsoft.Extensions.Options;

namespace FrugalApi.Dashboard.Api.Services;

internal sealed class DashboardDataService(ITraceDataService traceDataService, 
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

    public Task<AiRequestBase?> GetRequestById(string id, CancellationToken cancellationToken = default)
    {
        return traceDataService.GetTraceRequestByIdAsync(id, cancellationToken);
        
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
        if (!environmentalMetricsOptions.Value.Models.TryGetValue(comparisonModel, out var comparisonProfile))
            throw new InvalidOperationException($"No environmental metrics configured for model {comparisonModel}.");

        var totalTokens = aiRequest.InputTokens + aiRequest.OutputTokens;
        var orderedRanges = comparisonProfile.TokenRanges.OrderBy(x => x.MaxTokens).ToList();
        var rangeMetrics = orderedRanges.FirstOrDefault(x => totalTokens <= x.MaxTokens)
                           ?? orderedRanges.LastOrDefault();

        if (rangeMetrics is null)
            throw new InvalidOperationException($"No token ranges configured for model {comparisonModel}.");

        var inputCostUsd = (aiRequest.InputTokens * comparisonProfile.InputMtUsd) / 1_000_000d;
        var outputCostUsd = (aiRequest.OutputTokens * comparisonProfile.OutputMtUsd) / 1_000_000d;

        return new(totalTokens * rangeMetrics.PowerWh,
            totalTokens * rangeMetrics.Co2,
            totalTokens * rangeMetrics.WaterMl,
            inputCostUsd,
            outputCostUsd);
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
                        (x.ValidationScore >= minValidationScore || (x.ValidationScore is null && minValidationScore == 0)) &&
                        x.CreatedAt >= since &&
                        x.CreatedAt <= until)
            .Select(x => new AiRequest(x, EstimateComparisonMetrics(x, comparisonModel)))
            .ToList();
    }
}
