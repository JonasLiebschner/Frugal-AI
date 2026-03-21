using System.ComponentModel.DataAnnotations;
using FrugalApi.Dashboard.Api.Models;
using FrugalApi.Dashboard.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace FrugalApi.Dashboard.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public sealed class RequestsController(IDashboardDataService service, IStarsService starsService) : ControllerBase
{
    /// <summary>
    /// Sets the star ratings for a specific request.
    /// </summary>
    /// <param name="id">The unique identifier of the request to be rated.</param>
    /// <param name="stars">The star rating to be assigned, ranging from 0 to 5.</param>
    /// <returns>True if the star rating was successfully set; otherwise, false.</returns>
    [Route("stars/{id}")]
    [HttpPut]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<ActionResult> SetRequestStars(string id, [FromQuery, Required, Range(1, 5)] int stars)
    {
        await starsService.SaveStars(id, stars);
        return Ok();
    }

    /// <summary>
    /// Retrieves a list of comparison models.
    /// </summary>
     /// <returns>A collection of comparison models.</returns>
    [HttpGet("comparison-models")]
    [ProducesResponseType<IEnumerable<string>>(StatusCodes.Status200OK)]
    public ActionResult<List<string>> GetComparisonModels()
    {
        return service.GetAvailableComparisonModels();
    }
    
    /// <summary>
    /// Retrieves a request by its unique identifier.
    /// </summary>
    /// <param name="id">The unique identifier of the request to retrieve.</param>
    /// <param name="cancellationToken">A cancellation token to cancel the request.</param>
    /// <returns>The requested AiRequest object if found, otherwise NotFound.</returns>
    [HttpGet]
    [Route("{id}")]
    [ProducesResponseType<AiRequest>(StatusCodes.Status200OK)]
    public async Task<ActionResult<AiRequest>> GetRequestById(string id, CancellationToken cancellationToken = default)
    {
        var request = await service.GetRequestById(id, cancellationToken);
        if (request == null)
        {
            return NotFound();
        }

        return Ok(request);
    }

    /// <summary>
    /// Retrieves a collection of requests based on the specified filter criteria.
    /// </summary>
    /// <param name="comparisonModel">The comparison model to filter requests by.</param>
    /// <param name="routingMethods">An optional array of routing methods to filter requests by.</param>
    /// <param name="minValidationScore">An optional minimum validation score to filter requests by.</param>
    /// <param name="since">An optional date and time to filter requests by.</param>
    /// <param name="until">An optional date and time to filter requests by.</param>
    /// <param name="cancellationToken">A cancellation token to cancel the request.</param>
    /// <returns>A collection of requests matching the specified criteria.</returns>
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
