namespace FrugalApi.Dashboard.Api.Models;

public sealed class OpenSearchOptions
{
    public const string SectionName = "OpenSearch";

    public required string Url { get; init; }
    public string Index { get; init; } = "otel-traces-*";
    public int Size { get; init; } = 500;
}
