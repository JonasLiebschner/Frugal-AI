using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using FrugalApi.Dashboard.Api.Models;
using Microsoft.Extensions.Options;

namespace FrugalApi.Dashboard.Api.Services;

public sealed class OpenSearchTraceDataService(
    HttpClient httpClient,
    IOptions<OpenSearchOptions> options,
    IOptions<ModelEnvironmentalMetricsOptions> environmentalMetricsOptions,
    ILogger<OpenSearchTraceDataService> logger) : ITraceDataService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly OpenSearchOptions _options = options.Value;
    private readonly ModelEnvironmentalMetricsOptions _environmentalMetrics = environmentalMetricsOptions.Value;

    public async Task<List<AiRequestBase>> GetTraceRequestsAsync(
        DateTimeOffset? since,
        DateTimeOffset? until,
        CancellationToken cancellationToken = default)
    {
        var requestBody = BuildSearchRequestBody(_options.Size);
        using var request = new HttpRequestMessage(HttpMethod.Post, $"/{_options.Index}/_search")
        {
            Content = new StringContent(requestBody, Encoding.UTF8, "application/json")
        };

        using var response = await httpClient.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            var errorBody = await response.Content.ReadAsStringAsync(cancellationToken);
            logger.LogWarning("OpenSearch query failed with status {StatusCode}. Body: {Body}",
                (int)response.StatusCode,
                errorBody);
            return [];
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        var root = await JsonNode.ParseAsync(stream, cancellationToken: cancellationToken);

        var hits = root?["hits"]?["hits"]?.AsArray();
        if (hits is null || hits.Count == 0)
        {
            return [];
        }

        var requests = new List<AiRequestBase>(hits.Count);

        foreach (var hit in hits)
        {
            var source = hit?["_source"];
            if (source is null)
            {
                continue;
            }

            var model = GetString(source,
                "gen_ai_request_model",
                "attributes.gen_ai.request.model",
                "span.attributes.gen_ai.request.model",
                "resource.attributes.gen_ai.request.model",
                "llm.model_name");

            var prompt = GetString(source,
                "attributes.gen_ai.prompt",
                "span.attributes.gen_ai.prompt",
                "attributes.gen_ai.request.prompt",
                "llm.prompt") ?? string.Empty;

            var routingMethod = GetString(source,
                "attributes.frugal.routing.method",
                "span.attributes.frugal.routing.method",
                "routing.method") ?? "unknown";

            var id = GetString(source,
                "traceId",
                "trace_id",
                "span.traceId",
                "span_id") ?? Guid.NewGuid().ToString("N");

            var createdAt = GetDateTimeOffset(source,
                "start_timestamp",
                "created_at",
                "@timestamp",
                "timestamp",
                "startTime",
                "start_time") ?? DateTimeOffset.UtcNow;

            var inputTokens = GetInt(source,
                "gen_ai_usage_input_tokens",
                "attributes.gen_ai.usage.input_tokens",
                "span.attributes.gen_ai.usage.input_tokens",
                "llm.token_count.prompt") ?? 0;

            var outputTokens = GetInt(source,
                "gen_ai_usage_output_tokens",
                "attributes.gen_ai.usage.output_tokens",
                "span.attributes.gen_ai.usage.output_tokens",
                "llm.token_count.completion") ?? 0;

            var durationMs = GetInt(source,
                "attributes.gen_ai.response.duration_ms",
                "span.attributes.gen_ai.response.duration_ms",
                "duration_ms")
                ?? (int)Math.Round((GetDouble(source, "duration") ?? 0) * 1000);

            var validationScore = GetDouble(source,
                "attributes.frugal.validation.score",
                "span.attributes.frugal.validation.score",
                "validation.score") ?? 0;

            var costUsd = GetDouble(source,
                "operation_cost",
                "attributes.frugal.metrics.cost_usd",
                "span.attributes.frugal.metrics.cost_usd") ?? 0;

            if (string.IsNullOrWhiteSpace(model))
            {
                continue;
            }

            var environmentalMetric = GetEnvironmentalMetric(model, inputTokens + outputTokens, costUsd);

            requests.Add(new AiRequestBase(
                id,
                model,
                routingMethod,
                prompt,
                inputTokens,
                outputTokens,
                durationMs,
                validationScore,
                createdAt,
                environmentalMetric));
        }

        return requests
            .OrderByDescending(x => x.CreatedAt)
            .ToList();
    }

    private static string BuildSearchRequestBody(int size)
    {
        var request = new Dictionary<string, object>
        {
            ["size"] = size,
            ["query"] = new Dictionary<string, object> { ["match_all"] = new Dictionary<string, object>() }
        };

        return JsonSerializer.Serialize(request, JsonOptions);
    }

    private static string? GetString(JsonNode source, params string[] paths)
    {
        foreach (var path in paths)
        {
            if (!TryGetValue(GetNodeByPath(source, path), out string? value))
            {
                continue;
            }

            if (!string.IsNullOrWhiteSpace(value))
            {
                return value;
            }
        }

        return null;
    }

    private static int? GetInt(JsonNode source, params string[] paths)
    {
        foreach (var path in paths)
        {
            var node = GetNodeByPath(source, path);
            if (TryGetValue(node, out int intValue))
            {
                return intValue;
            }

            if (TryGetValue(node, out long longValue))
            {
                return (int)Math.Clamp(longValue, int.MinValue, int.MaxValue);
            }

            if (TryGetValue(node, out double doubleValue))
            {
                return (int)Math.Round(doubleValue);
            }

            if (TryGetValue(node, out string? stringValue) && int.TryParse(stringValue, out var parsed))
            {
                return parsed;
            }
        }

        return null;
    }

    private static double? GetDouble(JsonNode source, params string[] paths)
    {
        foreach (var path in paths)
        {
            var node = GetNodeByPath(source, path);
            if (TryGetValue(node, out double doubleValue))
            {
                return doubleValue;
            }

            if (TryGetValue(node, out float floatValue))
            {
                return floatValue;
            }

            if (TryGetValue(node, out long longValue))
            {
                return longValue;
            }

            if (TryGetValue(node, out string? stringValue) && double.TryParse(stringValue, out var parsed))
            {
                return parsed;
            }
        }

        return null;
    }

    private static DateTimeOffset? GetDateTimeOffset(JsonNode source, params string[] paths)
    {
        foreach (var path in paths)
        {
            var node = GetNodeByPath(source, path);
            if (TryGetValue(node, out DateTimeOffset dateTimeOffset))
            {
                return dateTimeOffset;
            }

            if (TryGetValue(node, out string? stringValue) && DateTimeOffset.TryParse(stringValue, out var parsed))
            {
                return parsed;
            }

            if (TryGetValue(node, out long unixEpochLong))
            {
                return unixEpochLong > 9_999_999_999
                    ? DateTimeOffset.FromUnixTimeMilliseconds(unixEpochLong)
                    : DateTimeOffset.FromUnixTimeSeconds(unixEpochLong);
            }

            if (TryGetValue(node, out double unixEpochDouble))
            {
                var rounded = (long)Math.Round(unixEpochDouble);
                return rounded > 9_999_999_999
                    ? DateTimeOffset.FromUnixTimeMilliseconds(rounded)
                    : DateTimeOffset.FromUnixTimeSeconds(rounded);
            }
        }

        return null;
    }

    private static bool TryGetValue<T>(JsonNode? node, out T value)
    {
        if (node is JsonValue jsonValue && jsonValue.TryGetValue<T>(out var parsed))
        {
            value = parsed;
            return true;
        }

        value = default!;
        return false;
    }

    private RequestMetadata GetEnvironmentalMetric(string model, int totalTokens, double costUsd)
    {
        if (_environmentalMetrics.Models.TryGetValue(model, out var metric))
        {
            return new(metric.PowerWh * totalTokens, metric.Co2 * totalTokens, metric.WaterMl * totalTokens, costUsd);
        }

        logger.LogWarning("No environmental metric configured for model {Model}. Falling back to zero values.", model);
        return new(0, 0, 0, costUsd);
    }

    private static JsonNode? GetNodeByPath(JsonNode source, string path)
    {
        var node = source;
        var segments = path.Split('.', StringSplitOptions.RemoveEmptyEntries);

        foreach (var segment in segments)
        {
            node = node?[segment];
            if (node is null)
            {
                return null;
            }
        }

        return node;
    }
}
