using System.Text.Json.Serialization;

namespace FrugalApi.Dashboard.Api.Models;

public sealed record AiRequest(
    [property: JsonIgnore]
    AiRequestBase Base,
    [property: JsonPropertyName("comparison")]
    RequestMetadata ComparisonMetadata
) : AiRequestBase(Base.Id, Base.Model, Base.RoutingMethod, Base.Prompt, Base.InputTokens, Base.OutputTokens,
    Base.DurationMs, Base.ValidationScore, Base.CreatedAt, Base.ActualMetadata);

public record AiRequestBase(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("model")] string Model,
    [property: JsonPropertyName("routingMethod")] string RoutingMethod,
    [property: JsonPropertyName("prompt")] string Prompt,
    [property: JsonPropertyName("inputTokens")] int InputTokens,
    [property: JsonPropertyName("outputTokens")] int OutputTokens,
    [property: JsonPropertyName("durationMs")] int DurationMs,
    [property: JsonPropertyName("validationScore")] double ValidationScore,
    [property: JsonPropertyName("created")] DateTimeOffset CreatedAt,
    [property: JsonPropertyName("actual")] RequestMetadata ActualMetadata
);
