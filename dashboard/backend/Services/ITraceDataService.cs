using FrugalApi.Dashboard.Api.Models;

namespace FrugalApi.Dashboard.Api.Services;

public interface ITraceDataService
{
    Task<List<AiRequestBase>> GetTraceRequestsAsync(
        DateTimeOffset? since,
        DateTimeOffset? until,
        CancellationToken cancellationToken = default);
}
