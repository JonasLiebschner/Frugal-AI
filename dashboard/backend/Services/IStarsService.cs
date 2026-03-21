namespace FrugalApi.Dashboard.Api.Services;

/// <summary>
/// Service for saving and retrieving stars.
/// </summary>
public interface IStarsService
{
    /// <summary>
    /// Saves the stars for a request.
    /// </summary>
    /// <param name="id">The unique identifier of the request.</param>
    /// <param name="stars">The number of stars to save.</param>
    Task SaveStars(string id, int stars);
    
    /// <summary>
    /// Retrieves the stars for a request.
    /// </summary>
    /// <param name="id">The unique identifier of the request.</param>
    /// <returns>The number of stars for the request, or null if not found.</returns>
    Task<int?> GetStars(string id);
}