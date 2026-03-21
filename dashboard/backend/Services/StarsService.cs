using System.Text.Json;

namespace FrugalApi.Dashboard.Api.Services;

internal class StarsService : IStarsService
{
    private const string StarsPath = "/data/stars.json";
    private Dictionary<string, int>? _stars;

    public async Task<int?> GetStars(string id)
    {
        _stars ??= await LoadStars();
        return _stars.TryGetValue(id, out var stars) ? stars : null;
    }
    
    public async Task SaveStars(string id, int stars)
    {
        _stars ??= await LoadStars();
        _stars[id] = stars;
        await SaveStars();
    }

    private static async Task<Dictionary<string, int>> LoadStars()
    {
        if (!File.Exists(StarsPath))
            return new();
        var file = await File.ReadAllTextAsync(StarsPath);
        var stars = JsonSerializer.Deserialize<Dictionary<string, int>>(file);
        return stars ?? new();
    }

    private async Task SaveStars()
    {
        await File.WriteAllTextAsync(StarsPath, JsonSerializer.Serialize(_stars));
    }
}