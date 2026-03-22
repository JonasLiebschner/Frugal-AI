import type { Tracer } from "@opentelemetry/api";
import type { BasicTracerProvider, SpanExporter } from "@opentelemetry/sdk-trace-base";

import { toErrorMessage } from "../../shared/server/core-utils";
import { createOtelConfigService } from "./otel-config-service";
import type { OtelConfig, OtelConfigService, OtelService, OtelTraceInput, OtelTracesService } from "./otel-types";
import {
  type OtelTraceDebugContext,
  OtelRequestDebugTracker,
  RequestDebugDelegatingSpanExporter,
  RequestDebugOtlpHttpTraceExporter,
} from "./otel-trace-exporter";

export interface OtelServiceOptions {
  configService?: OtelConfigService;
  createExporter?: (config: OtelConfig) => SpanExporter;
}

class RuntimeOtelTracesService implements OtelTracesService {
  private config: OtelConfig = {
    enabled: false,
    timeoutMs: 10_000,
    serviceName: "llmproxy",
    captureMessageContent: false,
    captureToolContent: false,
  };
  private provider?: BasicTracerProvider;
  private readonly tracers = new Map<string, Tracer>();
  private readonly requestDebugTracker = new OtelRequestDebugTracker();

  public constructor(
    private readonly createExporter: (
      config: OtelConfig,
      requestDebugTracker: OtelRequestDebugTracker,
    ) => SpanExporter,
  ) {}

  public get enabled(): boolean {
    return this.config.enabled;
  }

  public get captureMessageContent(): boolean {
    return this.config.enabled && this.config.captureMessageContent;
  }

  public get captureToolContent(): boolean {
    return this.config.enabled && this.config.captureToolContent;
  }

  public async updateConfig(config: OtelConfig): Promise<void> {
    const previousProvider = this.provider;
    this.provider = config.enabled
      ? await this.createProvider(config)
      : undefined;
    this.config = config;
    this.tracers.clear();

    if (previousProvider) {
      await previousProvider.shutdown().catch((error: unknown) => {
        console.error(`Failed to shut down previous OTel tracer provider: ${toErrorMessage(error)}`);
      });
    }
  }

  public record(
    scopeName: string,
    spanInput: OtelTraceInput,
    debugContext?: OtelTraceDebugContext,
  ): void {
    const tracer = this.getTracer(scopeName);
    if (!tracer) {
      return;
    }

    if (debugContext) {
      this.requestDebugTracker.register(debugContext);
    }

    try {
      const span = tracer.startSpan(spanInput.name, {
        kind: spanInput.kind,
        startTime: spanInput.startTime,
        attributes: spanInput.attributes,
      });
      if (spanInput.events) {
        for (const event of spanInput.events) {
          span.addEvent(event.name, event.attributes, event.time);
        }
      }
      if (spanInput.status) {
        span.setStatus(spanInput.status);
      }
      span.end(spanInput.endTime);
    } catch (error) {
      console.error(`Failed to record OTel span for "${scopeName}": ${toErrorMessage(error)}`);
    }
  }

  public async forceFlush(): Promise<void> {
    if (!this.provider) {
      return;
    }

    await this.provider.forceFlush();
  }

  public async shutdown(): Promise<void> {
    const provider = this.provider;
    this.provider = undefined;
    this.tracers.clear();

    if (!provider) {
      return;
    }

    await provider.shutdown();
  }

  private async createProvider(config: OtelConfig): Promise<BasicTracerProvider> {
    const [{ BatchSpanProcessor, BasicTracerProvider }, { resourceFromAttributes }] = await Promise.all([
      importExternalModule<typeof import("@opentelemetry/sdk-trace-base")>("@opentelemetry/sdk-trace-base"),
      importExternalModule<typeof import("@opentelemetry/resources")>("@opentelemetry/resources"),
    ]);

    return new BasicTracerProvider({
      resource: resourceFromAttributes(buildResourceAttributes(config)),
      spanProcessors: [
        new BatchSpanProcessor(this.createExporter(config, this.requestDebugTracker), {
          exportTimeoutMillis: config.timeoutMs,
        }),
      ],
    });
  }

  private getTracer(scopeName: string): Tracer | undefined {
    if (!this.provider || !this.config.enabled) {
      return undefined;
    }

    const existing = this.tracers.get(scopeName);
    if (existing) {
      return existing;
    }

    const tracer = this.provider.getTracer(scopeName);
    this.tracers.set(scopeName, tracer);
    return tracer;
  }
}

export async function createOtelService(
  options: OtelServiceOptions = {},
): Promise<OtelService> {
  const configService = options.configService ?? createOtelConfigService();
  const traces = new RuntimeOtelTracesService(
    options.createExporter
      ? (config, requestDebugTracker) => new RequestDebugDelegatingSpanExporter(
        options.createExporter!(config),
        requestDebugTracker,
      )
      : createOtlpTraceExporter,
  );

  async function reload(): Promise<OtelConfig> {
    const config = await configService.load();
    await traces.updateConfig(config);
    return config;
  }

  await reload();

  return {
    configService,
    traces,
    reload,
    stop: async () => {
      await traces.shutdown();
    },
  };
}

export function createOtelNitroCapability(
  service: OtelService,
): OtelService {
  return {
    configService: service.configService,
    traces: service.traces,
    reload: service.reload,
    stop: service.stop,
  };
}

function buildResourceAttributes(config: OtelConfig): Record<string, string> {
  return {
    "service.name": config.serviceName,
    ...(config.serviceNamespace ? { "service.namespace": config.serviceNamespace } : {}),
    ...(config.deploymentEnvironment
      ? { "deployment.environment.name": config.deploymentEnvironment }
      : {}),
  };
}

function createOtlpTraceExporter(
  config: OtelConfig,
  requestDebugTracker: OtelRequestDebugTracker,
): SpanExporter {
  return new RequestDebugOtlpHttpTraceExporter(
    config,
      requestDebugTracker,
  );
}

function importExternalModule<T>(specifier: string): Promise<T> {
  return Function("modulePath", "return import(modulePath);")(specifier) as Promise<T>;
}
