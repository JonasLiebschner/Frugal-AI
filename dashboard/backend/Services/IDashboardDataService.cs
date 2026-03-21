using FrugalApi.Dashboard.Api.Models;

namespace FrugalApi.Dashboard.Api.Services;

public interface IDashboardDataService
{
    List<string> GetAvailableComparisonModels();

    Task<List<AiRequest>> GetAllRequestsAsync(
        string comparisonModel,
        IReadOnlyCollection<string>? routingMethods,
        double? minValidationScore,
        DateTimeOffset? since,
        DateTimeOffset? until,
        CancellationToken cancellationToken = default);
}
