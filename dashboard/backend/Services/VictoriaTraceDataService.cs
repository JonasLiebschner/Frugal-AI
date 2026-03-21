using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using FrugalApi.Dashboard.Api.Models;
using Microsoft.Extensions.Options;

namespace FrugalApi.Dashboard.Api.Services;

internal class VictoriaTraceDataService(
    HttpClient httpClient,
    IOptions<VictoriaOptions> options,
    ILogger<VictoriaTraceDataService> logger,
    IStarsService starsService) : ITraceDataService
{
    private readonly VictoriaOptions _options = options.Value;
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
        using var request = new HttpRequestMessage(HttpMethod.Get, BuildQueryPath());

        using var response = await httpClient.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            var errorBody = await response.Content.ReadAsStringAsync(cancellationToken);
            logger.LogWarning("Victoria query failed with status {StatusCode}. Body: {Body}",
                (int)response.StatusCode,
                errorBody);
            return [];
        }

        var responseBody = await response.Content.ReadAsStringAsync(cancellationToken);
        var sources = ParseTraceSources(responseBody);
        if (sources.Count == 0)
        {
            return [];
        }

        var requests = new List<AiRequestBase>(sources.Count);

        foreach (var source in sources)
        {
            var model = GetString(source,
                "gen_ai_request_model",
                "attributes.gen_ai.request.model",
                "span.attributes.gen_ai.request.model",
                "resource.attributes.gen_ai.request.model",
                "span_attr:gen_ai.request.model",
                "llm.model_name");

            var prompt = GetPrompt(source);

            var routingMethod = GetString(source,
                "routing.method",
                "routing_method") ?? "unknown";

            var id = GetString(source,
                "traceId",
                "trace_id",
                "span.traceId",
                "span_id",
                "_stream_id") ?? Guid.NewGuid().ToString("N");

            var createdAt = GetDateTimeOffset(source,
                "start_timestamp",
                "created_at",
                "@timestamp",
                "timestamp",
                "startTime",
                "start_time",
                "start_time_unix_nano",
                "_time") ?? DateTimeOffset.UtcNow;

            var inputTokens = GetInt(source,
                "gen_ai_usage_input_tokens",
                "attributes.gen_ai.usage.input_tokens",
                "span.attributes.gen_ai.usage.input_tokens",
                "span_attr:gen_ai.usage.input_tokens",
                "llm.token_count.prompt") ?? 0;

            var outputTokens = GetInt(source,
                "gen_ai_usage_output_tokens",
                "attributes.gen_ai.usage.output_tokens",
                "span.attributes.gen_ai.usage.output_tokens",
                "span_attr:gen_ai.usage.output_tokens",
                "llm.token_count.completion") ?? 0;

            var durationMs = GetDurationMs(source);
            
            var costUsd = GetDouble(source, "operation_cost") ?? GetViaModel(model ?? string.Empty, inputTokens, outputTokens);

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

    public async Task<AiRequestBase?> GetTraceRequestByIdAsync(
        string id,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(id))
        {
            return null;
        }

        var requests = await GetTraceRequestsAsync(null, null, cancellationToken);
        return requests.FirstOrDefault(x => string.Equals(x.Id, id, StringComparison.Ordinal));
    }

    private string BuildQueryPath()
    {
        var query = string.IsNullOrWhiteSpace(_options.Query) ? "*" : _options.Query;
        var encodedQuery = Uri.EscapeDataString(query);
        var limit = _options.Size.ToString(CultureInfo.InvariantCulture);
        return $"select/logsql/query?query={encodedQuery}&limit={limit}";
    }

    private static List<JsonNode> ParseTraceSources(string body)
    {
        var sources = new List<JsonNode>();
        if (string.IsNullOrWhiteSpace(body))
        {
            return sources;
        }

        var trimmed = body.Trim();
        if (trimmed.StartsWith('{') || trimmed.StartsWith('['))
        {
            try
            {
                var root = JsonNode.Parse(trimmed);
                if (root is not null)
                {
                    sources.AddRange(ExtractSourcesFromJson(root));
                    if (sources.Count > 0)
                    {
                        return sources;
                    }
                }
            }
            catch (JsonException)
            {
                // Response may be NDJSON; handled below.
            }
        }

        foreach (var line in body.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            try
            {
                var node = JsonNode.Parse(line);
                var source = NormalizeSourceNode(node);
                if (source is not null)
                {
                    sources.Add(source);
                }
            }
            catch (JsonException)
            {
                // Ignore malformed lines and continue parsing the rest.
            }
        }

        return sources;
    }

    private static IEnumerable<JsonNode> ExtractSourcesFromJson(JsonNode root)
    {
        if (root is JsonArray array)
        {
            foreach (var item in array)
            {
                var source = NormalizeSourceNode(item);
                if (source is not null)
                {
                    yield return source;
                }
            }

            yield break;
        }

        if (root["hits"]?["hits"] is JsonArray hits)
        {
            foreach (var hit in hits)
            {
                var source = NormalizeSourceNode(hit);
                if (source is not null)
                {
                    yield return source;
                }
            }

            yield break;
        }

        if (root["data"] is JsonArray data)
        {
            foreach (var item in data)
            {
                var source = NormalizeSourceNode(item);
                if (source is not null)
                {
                    yield return source;
                }
            }

            yield break;
        }

        var fallback = NormalizeSourceNode(root);
        if (fallback is not null)
        {
            yield return fallback;
        }
    }

    private static JsonNode? NormalizeSourceNode(JsonNode? node)
    {
        if (node is null)
        {
            return null;
        }

        if (node["_source"] is JsonNode sourceNode)
        {
            return sourceNode;
        }

        if (TryGetValue(node["_msg"], out string? messageJson) &&
            !string.IsNullOrWhiteSpace(messageJson) &&
            messageJson.TrimStart().StartsWith('{'))
        {
            try
            {
                var parsedMessage = JsonNode.Parse(messageJson);
                if (parsedMessage is not null)
                {
                    return parsedMessage;
                }
            }
            catch (JsonException)
            {
                // Ignore and fallback to the original node.
            }
        }

        return node;
    }

    private static string GetPrompt(JsonNode source)
    {
        var directPrompt = GetString(source,
            "prompt",
            "attributes.gen_ai.prompt",
            "span.attributes.gen_ai.prompt",
            "attributes.gen_ai.request.prompt",
            "attributes.request_data.prompt",
            "attributes.request_data.input",
            "request_data.prompt",
            "llm.prompt");
        if (!string.IsNullOrWhiteSpace(directPrompt))
        {
            return directPrompt;
        }

        var requestMessagesNode = GetNodeByPath(source, "attributes.request_data.messages")
                                  ?? GetNodeByPath(source, "request_data.messages")
                                  ?? GetNodeByPath(source, "span_attr:request_data.messages");

        JsonArray? messages = requestMessagesNode as JsonArray;
        if (messages is null &&
            TryGetValue(requestMessagesNode, out string? encodedMessages) &&
            !string.IsNullOrWhiteSpace(encodedMessages))
        {
            try
            {
                messages = JsonNode.Parse(encodedMessages) as JsonArray;
            }
            catch (JsonException)
            {
                // Ignore malformed messages payload and fallback to empty prompt.
            }
        }

        if (messages is null || messages.Count == 0)
        {
            return string.Empty;
        }

        for (var i = messages.Count - 1; i >= 0; i--)
        {
            if (messages[i] is not JsonObject messageNode)
            {
                continue;
            }

            if (!string.Equals(messageNode["role"]?.ToString(), "user", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var userContent = ReadMessageContent(messageNode["content"]);
            if (!string.IsNullOrWhiteSpace(userContent))
            {
                return userContent;
            }
        }

        foreach (var message in messages)
        {
            if (message is not JsonObject messageNode)
            {
                continue;
            }

            var content = ReadMessageContent(messageNode["content"]);
            if (!string.IsNullOrWhiteSpace(content))
            {
                return content;
            }
        }

        return string.Empty;
    }

    private static string? ReadMessageContent(JsonNode? contentNode)
    {
        if (contentNode is null)
        {
            return null;
        }

        if (TryGetValue(contentNode, out string? text) && !string.IsNullOrWhiteSpace(text))
        {
            return text;
        }

        if (contentNode is not JsonArray contentArray)
        {
            return null;
        }

        var parts = new List<string>();
        foreach (var part in contentArray)
        {
            if (part is JsonObject partObject &&
                string.Equals(partObject["type"]?.ToString(), "text", StringComparison.OrdinalIgnoreCase))
            {
                var partText = partObject["text"]?.ToString();
                if (!string.IsNullOrWhiteSpace(partText))
                {
                    parts.Add(partText);
                }
            }
            else if (TryGetValue(part, out string? primitivePart) && !string.IsNullOrWhiteSpace(primitivePart))
            {
                parts.Add(primitivePart);
            }
        }

        return parts.Count == 0 ? null : string.Join('\n', parts);
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
                var fromEpoch = ParseUnixEpoch(unixEpochLong);
                if (fromEpoch.HasValue)
                {
                    return fromEpoch.Value;
                }
            }

            if (TryGetValue(node, out double unixEpochDouble))
            {
                var fromEpoch = ParseUnixEpoch((long)Math.Round(unixEpochDouble));
                if (fromEpoch.HasValue)
                {
                    return fromEpoch.Value;
                }
            }
        }

        return null;
    }

    private static int GetDurationMs(JsonNode source)
    {
        var explicitMs = GetInt(source,
            "attributes.gen_ai.response.duration_ms",
            "span.attributes.gen_ai.response.duration_ms",
            "span_attr:gen_ai.response.duration_ms",
            "duration_ms");
        if (explicitMs.HasValue)
        {
            return explicitMs.Value;
        }

        var startNano = GetLong(source, "start_time_unix_nano");
        var endNano = GetLong(source, "end_time_unix_nano");
        if (startNano.HasValue && endNano.HasValue && endNano.Value >= startNano.Value)
        {
            return (int)Math.Max(0, Math.Round((endNano.Value - startNano.Value) / 1_000_000d));
        }

        var durationNano = GetLong(source, "duration");
        if (durationNano.HasValue)
        {
            return (int)Math.Max(0, Math.Round(durationNano.Value / 1_000_000d));
        }

        return 0;
    }

    private static long? GetLong(JsonNode source, params string[] paths)
    {
        foreach (var path in paths)
        {
            var node = GetNodeByPath(source, path);
            if (TryGetValue(node, out long longValue))
            {
                return longValue;
            }

            if (TryGetValue(node, out int intValue))
            {
                return intValue;
            }

            if (TryGetValue(node, out double doubleValue))
            {
                return (long)Math.Round(doubleValue);
            }

            if (TryGetValue(node, out string? stringValue) && long.TryParse(stringValue, out var parsed))
            {
                return parsed;
            }
        }

        return null;
    }

    private static DateTimeOffset? ParseUnixEpoch(long value)
    {
        try
        {
            var absValue = Math.Abs(value);

            if (absValue >= 100_000_000_000_000_000) // nanoseconds
            {
                var seconds = value / 1_000_000_000;
                var nanosecondsRemainder = value % 1_000_000_000;
                return DateTimeOffset.FromUnixTimeSeconds(seconds).AddTicks(nanosecondsRemainder / 100);
            }

            if (absValue >= 100_000_000_000_000) // microseconds
            {
                var seconds = value / 1_000_000;
                var microsecondsRemainder = value % 1_000_000;
                return DateTimeOffset.FromUnixTimeSeconds(seconds).AddTicks(microsecondsRemainder * 10);
            }

            if (absValue >= 100_000_000_000) // milliseconds
            {
                return DateTimeOffset.FromUnixTimeMilliseconds(value);
            }

            return DateTimeOffset.FromUnixTimeSeconds(value);
        }
        catch (ArgumentOutOfRangeException)
        {
            return null;
        }
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

        for (var i = 0; i < segments.Length; i++)
        {
            if (node is JsonObject jsonObject)
            {
                var remaining = string.Join('.', segments[i..]);
                if (jsonObject.TryGetPropertyValue(remaining, out var dottedRemainder))
                {
                    return dottedRemainder;
                }

                if (jsonObject.TryGetPropertyValue(segments[i], out var directMatch))
                {
                    node = directMatch;
                    continue;
                }

                JsonNode? dottedSegmentMatch = null;
                var matchedLength = 0;
                for (var j = segments.Length - 1; j > i; j--)
                {
                    var candidate = string.Join('.', segments[i..(j + 1)]);
                    if (!jsonObject.TryGetPropertyValue(candidate, out var candidateNode))
                    {
                        continue;
                    }

                    dottedSegmentMatch = candidateNode;
                    matchedLength = j - i + 1;
                    break;
                }

                if (dottedSegmentMatch is null)
                {
                    return null;
                }

                node = dottedSegmentMatch;
                i += matchedLength - 1;
                continue;
            }

            if (node is JsonArray jsonArray && int.TryParse(segments[i], out var index))
            {
                if (index < 0 || index >= jsonArray.Count)
                {
                    return null;
                }

                node = jsonArray[index];
                continue;
            }

            node = node?[segments[i]];
            if (node is null)
            {
                return null;
            }
        }

        return node;
    }
}
