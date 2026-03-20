using FrugalApi.Dashboard.Api.Models;

namespace FrugalApi.Dashboard.Api.Services;

public interface IDashboardDataService
{
    List<string> GetAvailableComparisonModels();

    List<AiRequest> GetAllRequests(
        string comparisonModel,
        IReadOnlyCollection<string>? routingMethods,
        double? minValidationScore,
        DateTimeOffset? since,
        DateTimeOffset? until);
}
