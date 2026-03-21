using System.Text.Json.Serialization;

namespace FrugalApi.Dashboard.Api.Models;

public sealed record RequestMetadata(
    [property: JsonPropertyName("powerWh")]
    double PowerWh,
    [property: JsonPropertyName("co2")] double Co2,
    [property: JsonPropertyName("waterMl")]
    double WaterMl,
    [property: JsonIgnore] double InputCostUsd,
    [property: JsonIgnore] double OutputCostUsd
)
{
    [JsonPropertyName("costUsd")]
    public double TotalCostUsd => InputCostUsd + OutputCostUsd;
}


public sealed class ModelEnvironmentalMetricsOptions
{
    public const string SectionName = "ModelEnvironmentalMetrics";

    public Dictionary<string, ModelEnvironmentalMetricProfile> Models { get; init; } = new(StringComparer.OrdinalIgnoreCase);
}

public sealed class ModelEnvironmentalMetricProfile
{
    public List<TokenRangeEnvironmentalMetric> TokenRanges { get; init; } = [];
    public double InputMtUsd { get; init; }
    public double OutputMtUsd { get; init; }
}

public sealed class TokenRangeEnvironmentalMetric
{
    public int MaxTokens { get; init; }
    public double PowerWh { get; init; }
    public double Co2 { get; init; }
    public double WaterMl { get; init; }
}
