import type {
  McpHelperRouteDefinition,
  McpPromptArgumentDefinition,
  McpPromptDefinition,
  McpServiceDefinition,
  McpToolDefinition,
} from "./app/types/dashboard";

export type ConnectorParameterSupport = "forwarded" | "mapped" | "ignored" | "dropped";

export interface OpenAiCompatibilityNote {
  title: string;
  description: string;
}

export interface OpenAiParameterSupportRow {
  parameter: string;
  openai: ConnectorParameterSupport;
  ollama: ConnectorParameterSupport;
  llamaCpp: ConnectorParameterSupport;
  notes: string;
}

export interface OpenAiSupportLegendRow {
  state: ConnectorParameterSupport;
  description: string;
}

export interface OpenAiRouteRow {
  route: string;
  purpose: string;
}

export interface McpServiceDocsView extends McpServiceDefinition {
  helperRoutes: McpServiceDefinition["helperRoutes"];
  toolsForRenderer: Array<{
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>;
}

type ReadonlyMcpPromptDefinition = Omit<McpPromptDefinition, "arguments"> & {
  arguments: readonly McpPromptArgumentDefinition[];
};

type ReadonlyMcpServiceDefinition = Omit<McpServiceDefinition, "helperRoutes" | "tools" | "prompts"> & {
  helperRoutes: readonly McpHelperRouteDefinition[];
  tools: readonly McpToolDefinition[];
  prompts: readonly ReadonlyMcpPromptDefinition[];
};

export function buildOpenAiRouteRows(baseUrl: string): OpenAiRouteRow[] {
  return [
    {
      route: `GET ${baseUrl}/v1/models`,
      purpose: "List the aggregated model catalog exposed by llmproxy in the standard OpenAI-compatible model-list format.",
    },
    {
      route: `POST ${baseUrl}/v1/chat/completions`,
      purpose: "Run chat completions through llmproxy with the normal OpenAI-compatible request body, including streaming, tools, and generation parameters.",
    },
  ];
}

export const openAiCompatibilityNotes: OpenAiCompatibilityNote[] = [
  {
    title: "OpenAI connections",
    description:
      "Forward the OpenAI-compatible request body almost unchanged. llmproxy only removes top_k, min_p, and repeat_penalty before sending the request upstream.",
  },
  {
    title: "Ollama connections",
    description:
      "Translate the supported OpenAI-style fields into Ollama's native /api/chat payload. Fields not listed in the matrix below are not connector-mapped for Ollama.",
  },
  {
    title: "llama.cpp connections",
    description:
      "Forward the OpenAI-compatible request body unchanged, including llama.cpp-style sampler fields such as top_k, min_p, and repeat_penalty.",
  },
];

export const openAiSupportLegend: OpenAiSupportLegendRow[] = [
  {
    state: "forwarded",
    description: "llmproxy sends the field upstream unchanged. The upstream backend still needs to understand it.",
  },
  {
    state: "mapped",
    description: "llmproxy translates the field into the connector's native request format.",
  },
  {
    state: "ignored",
    description: "llmproxy accepts the field on the public route, but this connector does not emit it upstream.",
  },
  {
    state: "dropped",
    description: "llmproxy removes the field before forwarding the upstream request.",
  },
];

export const openAiParameterSupportRows: OpenAiParameterSupportRow[] = [
  {
    parameter: "model",
    openai: "forwarded",
    ollama: "mapped",
    llamaCpp: "forwarded",
    notes: "Required model id. Ollama receives it as the native model field.",
  },
  {
    parameter: "messages",
    openai: "forwarded",
    ollama: "mapped",
    llamaCpp: "forwarded",
    notes: "Ollama normalizes chat messages, multimodal content, and tool-call payloads into its native message format.",
  },
  {
    parameter: "stream",
    openai: "forwarded",
    ollama: "mapped",
    llamaCpp: "forwarded",
    notes: "Accepted on all connectors. llmproxy may still enable upstream streaming internally when it needs streaming transport.",
  },
  {
    parameter: "tools",
    openai: "forwarded",
    ollama: "mapped",
    llamaCpp: "forwarded",
    notes: "Ollama receives native tools, and assistant tool-call arguments are normalized into JSON objects when possible.",
  },
  {
    parameter: "tool_choice",
    openai: "forwarded",
    ollama: "ignored",
    llamaCpp: "forwarded",
    notes: "Currently not translated into Ollama's native /api/chat payload.",
  },
  {
    parameter: "temperature",
    openai: "forwarded",
    ollama: "mapped",
    llamaCpp: "forwarded",
    notes: "Mapped to Ollama options.temperature.",
  },
  {
    parameter: "top_p",
    openai: "forwarded",
    ollama: "mapped",
    llamaCpp: "forwarded",
    notes: "Mapped to Ollama options.top_p.",
  },
  {
    parameter: "top_k",
    openai: "dropped",
    ollama: "mapped",
    llamaCpp: "forwarded",
    notes: "Removed only for openai connections. Ollama maps it to options.top_k.",
  },
  {
    parameter: "min_p",
    openai: "dropped",
    ollama: "mapped",
    llamaCpp: "forwarded",
    notes: "Removed only for openai connections. Ollama maps it to options.min_p.",
  },
  {
    parameter: "repeat_penalty",
    openai: "dropped",
    ollama: "mapped",
    llamaCpp: "forwarded",
    notes: "Removed only for openai connections. Ollama maps it to options.repeat_penalty.",
  },
  {
    parameter: "seed",
    openai: "forwarded",
    ollama: "mapped",
    llamaCpp: "forwarded",
    notes: "Mapped to Ollama options.seed.",
  },
  {
    parameter: "stop",
    openai: "forwarded",
    ollama: "mapped",
    llamaCpp: "forwarded",
    notes: "String and string[] are accepted. Ollama always receives stop sequences as an array.",
  },
  {
    parameter: "max_completion_tokens",
    openai: "forwarded",
    ollama: "mapped",
    llamaCpp: "forwarded",
    notes: "Preferred completion limit field. Ollama maps it to options.num_predict when max_tokens is not set.",
  },
  {
    parameter: "max_tokens",
    openai: "forwarded",
    ollama: "mapped",
    llamaCpp: "forwarded",
    notes: "Alternate alias. Ollama also maps it to options.num_predict and it takes precedence if both limit fields are present.",
  },
  {
    parameter: "response_format",
    openai: "forwarded",
    ollama: "mapped",
    llamaCpp: "forwarded",
    notes: "Ollama receives this as format. llmproxy also accepts a direct format field for Ollama-native callers.",
  },
  {
    parameter: "keep_alive",
    openai: "forwarded",
    ollama: "mapped",
    llamaCpp: "forwarded",
    notes: "Mainly useful for Ollama. Other upstreams only honor it if they support the same field name.",
  },
];

export function mapToolDefinitionsForRenderer(tools: readonly McpToolDefinition[]) {
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema ?? {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  }));
}

export function buildMcpServicesForDocs(services: readonly ReadonlyMcpServiceDefinition[]): McpServiceDocsView[] {
  return services.map((service) => ({
    ...service,
    helperRoutes: service.helperRoutes.map((route) => ({ ...route })),
    tools: service.tools.map((tool) => ({
      ...tool,
      ...(tool.inputSchema ? { inputSchema: { ...tool.inputSchema } } : {}),
    })),
    prompts: service.prompts.map((prompt) => ({
      ...prompt,
      arguments: prompt.arguments.map((argument) => ({ ...argument })),
    })),
    toolsForRenderer: mapToolDefinitionsForRenderer(service.tools),
  }));
}
