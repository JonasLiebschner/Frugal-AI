import type {
  DiagnosticPromptDefinition,
  DiagnosticPromptPayload,
  DiagnosticsToolDefinition,
  McpHelperRouteDefinition,
  McpManifest,
} from "./app/types/dashboard";
import { fetchWithTimeout, readErrorResponse, readJsonResponse } from "./llmproxy-http";

const diagnosticsClientInfo = {
  name: "llmproxy-dashboard",
  version: "1.0.0",
};
const MCP_REQUEST_TIMEOUT_MS = 10000;
const MCP_PROTOCOL_VERSION = "2025-11-25";
const MCP_SESSION_ID_HEADER = "mcp-session-id";
const MCP_PROTOCOL_VERSION_HEADER = "mcp-protocol-version";
const RECOVERABLE_MCP_SESSION_ERRORS = new Set([
  "MCP requests require an initialized session.",
  "MCP session was not found.",
  "MCP session is not initialized. Send notifications/initialized after initialize.",
]);

let cachedDiagnosticsTools: DiagnosticsToolDefinition[] | null = null;
let cachedDiagnosticsPrompts: DiagnosticPromptDefinition[] | null = null;
let cachedMcpManifest: McpManifest | null = null;
const MCP_ENDPOINT = "/mcp";

interface DiagnosticsMcpSession {
  id: string;
  protocolVersion: string;
}

interface DiagnosticsJsonRpcPayload {
  result?: Record<string, unknown>;
  error?: {
    message?: string;
  };
}

function createMcpRequestHeaders(session?: DiagnosticsMcpSession): Record<string, string> {
  return {
    "content-type": "application/json",
    ...(session ? {
      [MCP_SESSION_ID_HEADER]: session.id,
      [MCP_PROTOCOL_VERSION_HEADER]: session.protocolVersion,
    } : {}),
  };
}

function extractResponseSession(response: Response): DiagnosticsMcpSession {
  const sessionId = response.headers.get(MCP_SESSION_ID_HEADER)?.trim();
  const protocolVersion = response.headers.get(MCP_PROTOCOL_VERSION_HEADER)?.trim() || MCP_PROTOCOL_VERSION;

  if (!sessionId) {
    throw new Error("MCP initialize response did not include an MCP session id.");
  }

  return {
    id: sessionId,
    protocolVersion,
  };
}

function isRecoverableSessionError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return RECOVERABLE_MCP_SESSION_ERRORS.has(error.message);
}

async function readJsonRpcPayload(response: Response): Promise<Record<string, unknown>> {
  const payload = await readJsonResponse<DiagnosticsJsonRpcPayload>(response);
  if (payload.error?.message) {
    throw new Error(payload.error.message);
  }

  return payload.result ?? {};
}

export function createDiagnosticsMcpClient(fetchImpl: typeof fetch = fetch) {
  let session: DiagnosticsMcpSession | null = null;
  let initializationPromise: Promise<void> | null = null;

  async function sendJsonRpc(
    method: string,
    params?: Record<string, unknown>,
    activeSession?: DiagnosticsMcpSession | null,
  ): Promise<Record<string, unknown>> {
    const response = await fetchWithTimeout(MCP_ENDPOINT, {
      method: "POST",
      headers: createMcpRequestHeaders(activeSession ?? undefined),
      timeoutMs: MCP_REQUEST_TIMEOUT_MS,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method,
        params,
      }),
    }, fetchImpl);

    return await readJsonRpcPayload(response);
  }

  async function initializeSession(): Promise<void> {
    if (session) {
      return;
    }

    if (initializationPromise) {
      await initializationPromise;
      return;
    }

    initializationPromise = (async () => {
      const initializeResponse = await fetchWithTimeout(MCP_ENDPOINT, {
        method: "POST",
        headers: createMcpRequestHeaders(),
        timeoutMs: MCP_REQUEST_TIMEOUT_MS,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(),
          method: "initialize",
          params: {
            protocolVersion: MCP_PROTOCOL_VERSION,
            clientInfo: diagnosticsClientInfo,
          },
        }),
      }, fetchImpl);

      await readJsonRpcPayload(initializeResponse);
      const initializedSession = extractResponseSession(initializeResponse);

      const initializedResponse = await fetchWithTimeout(MCP_ENDPOINT, {
        method: "POST",
        headers: createMcpRequestHeaders(initializedSession),
        timeoutMs: MCP_REQUEST_TIMEOUT_MS,
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "notifications/initialized",
        }),
      }, fetchImpl);

      if (!initializedResponse.ok) {
        throw new Error(await readErrorResponse(initializedResponse));
      }

      session = initializedSession;
    })();

    try {
      await initializationPromise;
    } catch (error) {
      session = null;
      throw error;
    } finally {
      initializationPromise = null;
    }
  }

  return {
    async call(method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>> {
      await initializeSession();

      try {
        return await sendJsonRpc(method, params, session);
      } catch (error) {
        if (!isRecoverableSessionError(error)) {
          throw error;
        }

        session = null;
        await initializeSession();
        return await sendJsonRpc(method, params, session);
      }
    },
    async ensureInitialized(): Promise<void> {
      await initializeSession();
    },
  };
}

const diagnosticsMcpClient = createDiagnosticsMcpClient();

function cloneDiagnosticTool(tool: DiagnosticsToolDefinition): DiagnosticsToolDefinition {
  return {
    ...tool,
    ...(tool.inputSchema ? { inputSchema: { ...tool.inputSchema } } : {}),
  };
}

function cloneDiagnosticPrompt(prompt: DiagnosticPromptDefinition): DiagnosticPromptDefinition {
  return {
    ...prompt,
    arguments: prompt.arguments.map((argument) => ({ ...argument })),
  };
}

function cloneMcpManifest(manifest: McpManifest): McpManifest {
  return {
    endpoint: manifest.endpoint,
    services: manifest.services.map((service) => ({
      ...service,
      helperRoutes: service.helperRoutes.map((route) => ({ ...route })),
      tools: service.tools.map((tool) => cloneDiagnosticTool(tool)),
      prompts: service.prompts.map((prompt) => cloneDiagnosticPrompt(prompt)),
    })),
    helperRoutes: manifest.helperRoutes.map((route) => ({ ...route })),
    tools: manifest.tools.map((tool) => cloneDiagnosticTool(tool)),
    prompts: manifest.prompts.map((prompt) => cloneDiagnosticPrompt(prompt)),
  };
}

function normalizeManifestRoute(value: unknown): McpHelperRouteDefinition | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const candidate = value as {
    method?: unknown;
    path?: unknown;
    title?: unknown;
    description?: unknown;
  };

  if (
    (candidate.method !== "GET" && candidate.method !== "POST")
    || typeof candidate.path !== "string"
    || typeof candidate.title !== "string"
    || typeof candidate.description !== "string"
  ) {
    return undefined;
  }

  return {
    method: candidate.method,
    path: candidate.path,
    title: candidate.title,
    description: candidate.description,
  };
}

function normalizeMcpManifest(value: Record<string, unknown>): McpManifest {
  const services = Array.isArray(value.services)
    ? value.services
      .filter((service): service is Record<string, unknown> => typeof service === "object" && service !== null)
      .map((service) => ({
        id: String(service.id ?? ""),
        title: String(service.title ?? service.id ?? ""),
        description: String(service.description ?? ""),
        helperRoutes: Array.isArray(service.helperRoutes)
          ? service.helperRoutes
            .map((route) => normalizeManifestRoute(route))
            .filter((route): route is NonNullable<ReturnType<typeof normalizeManifestRoute>> => Boolean(route))
          : [],
        tools: Array.isArray(service.tools)
          ? service.tools
            .filter((tool): tool is Record<string, unknown> => typeof tool === "object" && tool !== null)
            .map((tool) => ({
              name: String(tool.name ?? ""),
              title: String(tool.title ?? tool.name ?? ""),
              description: String(tool.description ?? ""),
              inputSchema: typeof tool.inputSchema === "object" && tool.inputSchema !== null && !Array.isArray(tool.inputSchema)
                ? { ...tool.inputSchema as Record<string, unknown> }
                : undefined,
            }))
            .filter((tool) => tool.name.length > 0)
          : [],
        prompts: Array.isArray(service.prompts)
          ? service.prompts
            .filter((prompt): prompt is Record<string, unknown> => typeof prompt === "object" && prompt !== null)
            .map((prompt) => ({
              name: String(prompt.name ?? ""),
              title: String(prompt.title ?? prompt.name ?? ""),
              description: String(prompt.description ?? ""),
              arguments: Array.isArray(prompt.arguments)
                ? prompt.arguments.map((argument) => ({
                  name: String((argument as { name?: unknown }).name ?? ""),
                  description: String((argument as { description?: unknown }).description ?? ""),
                  required: (argument as { required?: unknown }).required === true,
                }))
                : [],
            }))
            .filter((prompt) => prompt.name.length > 0)
          : [],
      }))
      .filter((service) => service.id.length > 0)
    : [];

  return {
    endpoint: typeof value.endpoint === "string" && value.endpoint.trim().length > 0
      ? value.endpoint
      : MCP_ENDPOINT,
    services,
    helperRoutes: Array.isArray(value.helperRoutes)
      ? value.helperRoutes
        .map((route) => normalizeManifestRoute(route))
        .filter((route): route is NonNullable<ReturnType<typeof normalizeManifestRoute>> => Boolean(route))
      : services.flatMap((service) => service.helperRoutes.map((route) => ({ ...route }))),
    tools: Array.isArray(value.tools)
      ? value.tools
        .filter((tool): tool is Record<string, unknown> => typeof tool === "object" && tool !== null)
        .map((tool) => ({
          name: String(tool.name ?? ""),
          title: String(tool.title ?? tool.name ?? ""),
          description: String(tool.description ?? ""),
          inputSchema: typeof tool.inputSchema === "object" && tool.inputSchema !== null && !Array.isArray(tool.inputSchema)
            ? { ...tool.inputSchema as Record<string, unknown> }
            : undefined,
        }))
        .filter((tool) => tool.name.length > 0)
      : services.flatMap((service) => service.tools.map((tool) => cloneDiagnosticTool(tool))),
    prompts: Array.isArray(value.prompts)
      ? value.prompts
        .filter((prompt): prompt is Record<string, unknown> => typeof prompt === "object" && prompt !== null)
        .map((prompt) => ({
          name: String(prompt.name ?? ""),
          title: String(prompt.title ?? prompt.name ?? ""),
          description: String(prompt.description ?? ""),
          arguments: Array.isArray(prompt.arguments)
            ? prompt.arguments.map((argument) => ({
              name: String((argument as { name?: unknown }).name ?? ""),
              description: String((argument as { description?: unknown }).description ?? ""),
              required: (argument as { required?: unknown }).required === true,
            }))
            : [],
        }))
        .filter((prompt) => prompt.name.length > 0)
      : services.flatMap((service) => service.prompts.map((prompt) => cloneDiagnosticPrompt(prompt))),
  };
}

function normalizePromptMessage(value: unknown): DiagnosticPromptPayload["messages"][number] | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const candidate = value as {
    role?: unknown;
    content?: {
      type?: unknown;
      text?: unknown;
    };
  };

  if (
    (candidate.role !== "system" && candidate.role !== "user")
    || candidate.content?.type !== "text"
    || typeof candidate.content.text !== "string"
  ) {
    return undefined;
  }

  return {
    role: candidate.role,
    content: {
      type: "text",
      text: candidate.content.text,
    },
  };
}

export async function callDiagnosticsMcp(
  method: string,
  params?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return await diagnosticsMcpClient.call(method, params);
}

export async function ensureDiagnosticsMcpInitialized(): Promise<void> {
  await diagnosticsMcpClient.ensureInitialized();
}

export async function listDiagnosticsTools(): Promise<DiagnosticsToolDefinition[]> {
  if (cachedDiagnosticsTools) {
    return cachedDiagnosticsTools.map(cloneDiagnosticTool);
  }

  const manifest = await listMcpManifest();
  const tools = manifest.tools;
  cachedDiagnosticsTools = tools.map(cloneDiagnosticTool);
  return tools.map(cloneDiagnosticTool);
}

export async function buildDiagnosticsChatTools(): Promise<Array<Record<string, unknown>>> {
  const tools = await listDiagnosticsTools();
  return tools.map((tool) => ({
    type: "function",
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

export async function callDiagnosticsTool(
  name: string,
  args: unknown,
): Promise<Record<string, unknown>> {
  return await callDiagnosticsMcp("tools/call", {
    name,
    arguments: args,
  });
}

export async function listDiagnosticPrompts(): Promise<DiagnosticPromptDefinition[]> {
  if (cachedDiagnosticsPrompts) {
    return cachedDiagnosticsPrompts.map(cloneDiagnosticPrompt);
  }

  const manifest = await listMcpManifest();
  const prompts = manifest.prompts;
  cachedDiagnosticsPrompts = prompts.map(cloneDiagnosticPrompt);
  return prompts.map(cloneDiagnosticPrompt);
}

export async function listMcpManifest(): Promise<McpManifest> {
  await ensureDiagnosticsMcpInitialized();
  if (cachedMcpManifest) {
    return cloneMcpManifest(cachedMcpManifest);
  }

  const manifestPayload = await callDiagnosticsMcp("services/list");
  cachedMcpManifest = normalizeMcpManifest(manifestPayload);
  return cloneMcpManifest(cachedMcpManifest);
}

export async function getDiagnosticPrompt(
  name: string,
  requestId: string,
): Promise<DiagnosticPromptPayload> {
  const payload = await callDiagnosticsMcp("prompts/get", {
    name,
    arguments: {
      request_id: requestId,
    },
  });

  return {
    name: String(payload.name ?? name),
    description: String(payload.description ?? ""),
    messages: Array.isArray(payload.messages)
      ? payload.messages
        .map((message) => normalizePromptMessage(message))
        .filter((message): message is DiagnosticPromptPayload["messages"][number] => Boolean(message))
      : [],
  };
}
