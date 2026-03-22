import type {
  EditableAiClientSettings,
  EditableAiRequestRoutingMiddleware,
  EditableOtelConfig,
} from "./app/types/dashboard";
import { formatDuration } from "./app/utils/formatters";

export interface ConfigViewRow {
  key: string;
  value: string;
  title: string;
}

export interface AiRequestMiddlewareRow {
  order: number;
  id: string;
  url: string;
  smallModel: string;
  largeModel: string;
}

export function buildServerConfigRows(
  config: EditableAiClientSettings | null,
  mcpEnabled: boolean | null,
): ConfigViewRow[] {
  if (!config) {
    return [];
  }

  return [
    {
      key: "Request timeout",
      value: `${config.requestTimeoutMs} ms (${formatDuration(config.requestTimeoutMs)})`,
      title: "Maximum time llmproxy waits for an upstream request before aborting it.",
    },
    {
      key: "Queue timeout",
      value: `${config.queueTimeoutMs} ms (${formatDuration(config.queueTimeoutMs)})`,
      title: "Maximum time a request may wait for a free backend slot.",
    },
    {
      key: "Health check interval",
      value: `${config.healthCheckIntervalMs} ms (${formatDuration(config.healthCheckIntervalMs)})`,
      title: "How often llmproxy refreshes backend health state.",
    },
    {
      key: "Recent request limit",
      value: String(config.recentRequestLimit),
      title: "Maximum number of retained request rows kept in memory and shown in the dashboard.",
    },
    ...(mcpEnabled === null
      ? []
      : [{
          key: "MCP server",
          value: mcpEnabled ? "enabled" : "disabled",
          title: "Read-only status from the MCP app runtime configuration.",
        }]),
  ];
}

export function buildOtelConfigRows(config: EditableOtelConfig | null): ConfigViewRow[] {
  if (!config) {
    return [];
  }

  return [
    {
      key: "Exporter",
      value: config.enabled ? "enabled" : "disabled",
      title: "Whether OTLP trace export is currently enabled.",
    },
    {
      key: "Receiver endpoint",
      value: config.endpoint || "Environment/default OTLP resolution",
      title: "Explicit OTLP/HTTP traces endpoint. When empty, OpenTelemetry environment variables and defaults are used.",
    },
    {
      key: "OTLP headers",
      value: config.headersConfigured ? "configured (write-only)" : "not configured",
      title: "Exporter headers are stored write-only. The dashboard never reads the actual header values back.",
    },
    {
      key: "Export timeout",
      value: `${config.timeoutMs} ms (${formatDuration(config.timeoutMs)})`,
      title: "Maximum time a trace export batch may take before timing out.",
    },
    {
      key: "Service name",
      value: config.serviceName,
      title: "OpenTelemetry resource service.name used for exported trace spans.",
    },
    {
      key: "Service namespace",
      value: config.serviceNamespace || "not set",
      title: "Optional OpenTelemetry resource service.namespace.",
    },
    {
      key: "Deployment environment",
      value: config.deploymentEnvironment || "not set",
      title: "Optional OpenTelemetry resource deployment.environment.name.",
    },
    {
      key: "Capture message content",
      value: config.captureMessageContent ? "enabled" : "disabled",
      title: "Whether prompt and response message content is included in exported GenAI trace metadata.",
    },
    {
      key: "Capture tool content",
      value: config.captureToolContent ? "enabled" : "disabled",
      title: "Whether tool definitions and tool payload content is included in exported GenAI trace metadata.",
    },
  ];
}

export function buildAiRequestMiddlewareRows(
  middlewares: readonly EditableAiRequestRoutingMiddleware[],
): AiRequestMiddlewareRow[] {
  return middlewares.map((middleware, index) => ({
    order: index + 1,
    id: middleware.id,
    url: middleware.url,
    smallModel: middleware.models.small,
    largeModel: middleware.models.large,
  }));
}
