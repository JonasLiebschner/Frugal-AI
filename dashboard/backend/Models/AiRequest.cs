using System.Text.Json.Serialization;

namespace FrugalApi.Dashboard.Api.Models;

public sealed record AiRequest(
    [property: JsonIgnore]
    AiRequestBase Base,
    RequestMetadata ComparisonMetadata
) : AiRequestBase(Base.Id, Base.Model, Base.RoutingMethod, Base.Prompt, Base.InputTokens, Base.OutputTokens,
    Base.DurationMs, Base.ValidationScore, Base.CreatedAt, Base.ActualMetadata);

public record AiRequestBase(
    string Id,
    string Model,
    string RoutingMethod,
    string Prompt,
    int InputTokens,
    int OutputTokens,
    int DurationMs,
    double ValidationScore,
    DateTimeOffset CreatedAt,
    RequestMetadata ActualMetadata
);