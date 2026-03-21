using System.ComponentModel.DataAnnotations;
using FrugalApi.Dashboard.Api.Models;
using FrugalApi.Dashboard.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace FrugalApi.Dashboard.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public sealed class RequestsController(IDashboardDataService service) : ControllerBase
{
    [HttpGet("comparison-models")]
    [ProducesResponseType<IEnumerable<string>>(StatusCodes.Status200OK)]
    public ActionResult<List<string>> GetComparisonModels()
    {
        return service.GetAvailableComparisonModels();
    }

    [HttpGet]
    [ProducesResponseType<IEnumerable<AiRequest>>(StatusCodes.Status200OK)]
    public async Task<ActionResult<IEnumerable<AiRequest>>> GetRequests(
        [FromQuery, Required] string comparisonModel,
        [FromQuery] string[]? routingMethods = null,
        [FromQuery] double? minValidationScore = null,
        [FromQuery] DateTimeOffset? since = null,
        [FromQuery] DateTimeOffset? until = null,
        CancellationToken cancellationToken = default)
    {
        var requests = await service.GetAllRequestsAsync(
            comparisonModel,
            routingMethods,
            minValidationScore,
            since,
            until,
            cancellationToken);

        return requests;
    }
}
