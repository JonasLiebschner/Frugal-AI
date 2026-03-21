using FrugalApi.Dashboard.Api.Models;

namespace FrugalApi.Dashboard.Api.Services;

/// <summary>
/// Service for retrieving dashboard data.
/// </summary>
public interface IDashboardDataService
{
    /// <summary>
    /// Gets a list of available comparison models.
    /// </summary>
    /// <returns>Collection of comparison models.</returns>
    List<string> GetAvailableComparisonModels();

    /// <summary>
    /// Gets all requests matching the specified criteria.
    /// </summary>
    /// <param name="comparisonModel">The comparison model to filter requests by.</param>
    /// <param name="routingMethods">An optional array of routing methods to filter requests by.</param>
    /// <param name="minValidationScore">An optional minimum validation score to filter requests by.</param>
    /// <param name="since">An optional date and time to filter requests by.</param>
    /// <param name="until">An optional date and time to filter requests by.</param>
    /// <param name="cancellationToken">A cancellation token to cancel the request.</param>
    /// <returns>Requests matching the criteria</returns>
    Task<List<AiRequest>> GetAllRequestsAsync(
        string comparisonModel,
        IReadOnlyCollection<string>? routingMethods,
        double? minValidationScore,
        DateTimeOffset? since,
        DateTimeOffset? until,
        CancellationToken cancellationToken = default);
}
