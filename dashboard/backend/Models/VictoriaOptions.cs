namespace FrugalApi.Dashboard.Api.Models;

public sealed class VictoriaOptions
{
    public const string SectionName = "Victoria";

    public required string Url { get; init; }
    public string Query { get; init; } = "*";
    public int Size { get; init; } = 500;
}
