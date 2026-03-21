using System.Text.Json.Serialization;

namespace FrugalApi.Dashboard.Api.Models;

public sealed record RequestMetadata(
    [property: JsonPropertyName("powerWh")] double PowerWh,
    [property: JsonPropertyName("co2")] double Co2,
    [property: JsonPropertyName("waterMl")] double WaterMl,
    [property: JsonPropertyName("costUsd")] double CostUsd
);


public sealed class ModelEnvironmentalMetricsOptions
{
    public const string SectionName = "ModelEnvironmentalMetrics";

    public Dictionary<string, ModelEnvironmentalMetricProfile> Models { get; init; } = new(StringComparer.OrdinalIgnoreCase);
}

public sealed class ModelEnvironmentalMetricProfile
{
    public List<TokenRangeEnvironmentalMetric> TokenRanges { get; init; } = [];
}

public sealed class TokenRangeEnvironmentalMetric
{
    public int MaxTokens { get; init; }
    public double PowerWh { get; init; }
    public double Co2 { get; init; }
    public double WaterMl { get; init; }
    public double CostUsd { get; init; }
}
