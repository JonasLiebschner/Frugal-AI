using System.Text.Json.Serialization;

namespace FrugalApi.Dashboard.Api.Models;

public sealed record RequestMetadata(
    [property: JsonPropertyName("powerWh")] double PowerWh,
    [property: JsonPropertyName("co2")] double Co2,
    [property: JsonPropertyName("waterMl")] double WaterMl,
    [property: JsonPropertyName("costUsd")] double CostUsd
);
