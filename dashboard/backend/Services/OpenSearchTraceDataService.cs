using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using FrugalApi.Dashboard.Api.Models;
using Microsoft.Extensions.Options;

namespace FrugalApi.Dashboard.Api.Services;

internal class OpenSearchTraceDataService(
    HttpClient httpClient,
    IOptions<OpenSearchOptions> options,
    ILogger<OpenSearchTraceDataService> logger,
    IStarsService starsService) : ITraceDataService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly OpenSearchOptions _options = options.Value;
    private readonly Dictionary<string, (double Input, double Output)> _modelCosts = new()
    {
        ["deepseek-v3.1:latest"] = (0.15d / 1_000_000d, 0.75d / 1_000_000d),
        ["devstral-2:latest"] = (0.4d / 1_000_000d, 2.0d / 1_000_000d),
        ["frob/kimi-k2.5:latest"] = (0.45d / 1_000_000d, 2.2d / 1_000_000d),
        ["glm-4.7-flash:latest"] = (0.06d / 1_000_000d, 0.4d / 1_000_000d),
        ["lfm2.5-thinking:latest"] = (0d, 0d),
        ["llama3.1:70b"] = (0.4d / 1_000_000d, 0.4d / 1_000_000d),
        ["ministral-3:latest"] = (0.1d / 1_000_000d, 0.1d / 1_000_000d),
        ["qwen3.5:35b"] = (0.1625d / 1_000_000d, 1.3d / 1_000_000d),
    };
    
    private double GetViaModel(string model, int inputTokens, int outputTokens)
    {
        if (_modelCosts.TryGetValue(model, out var cost))
        {
            return cost.Input * inputTokens + cost.Output * outputTokens;
        }
        return 0;
    }

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
            
            var costUsd = GetDouble(source,"operation_cost") ?? GetViaModel(model, inputTokens, outputTokens);

            if (string.IsNullOrWhiteSpace(model))
            {
                continue;
            }
            
            var powerWh = 0.1;
            var environmentalMetric =  new RequestMetadata(
                powerWh,
                powerWh * 0.27, //  E_query (Wh) * CIF (kgC02/kWh)
                (powerWh / 1.25) * 0.04 + powerWh * 0.5, // E_query (Wh) / PUE * WUE_site (L/kWh)+ E_query (Wh) * WUE_source (L/kWh)
                0,
                costUsd);

            requests.Add(new AiRequestBase(
                id,
                model,
                routingMethod,
                prompt,
                inputTokens,
                outputTokens,
                durationMs,
                await starsService.GetStars(id),
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
