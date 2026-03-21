using FrugalApi.Dashboard.Api.Models;

namespace FrugalApi.Dashboard.Api.Services;

/// <summary>
/// Service for retrieving trace data.
/// </summary>
internal interface ITraceDataService
{
    /// <summary>
    /// Gets a list of requests that have been recorded.
    /// </summary>
    /// <param name="since">The start date and time for the request filter.</param>
    /// <param name="until">The end date and time for the request filter.</param>
    /// <param name="cancellationToken">A cancellation token to cancel the request.</param>
    /// <returns>A list of requests that have been recorded.</returns>
    Task<List<AiRequestBase>> GetTraceRequestsAsync(
        DateTimeOffset? since,
        DateTimeOffset? until,
        CancellationToken cancellationToken = default);
}
