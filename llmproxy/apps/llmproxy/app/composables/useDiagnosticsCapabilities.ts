import { computed, readonly, ref, shallowRef, watch } from "vue";
import type {
  DiagnosticPromptDefinition,
  DiagnosticsToolDefinition,
  McpServiceDefinition,
} from "../types/dashboard";
import { listMcpManifest } from "../../llmproxy-client";
import { useDashboardStore } from "./useDashboardStore";

function defaultEndpointUrl(): string {
  if (typeof window === "undefined") {
    return "/mcp";
  }

  return `${window.location.origin}/mcp`;
}

const loadingCapabilitiesState = ref(false);
const toolDefinitionsState = shallowRef<DiagnosticsToolDefinition[]>([]);
const promptDefinitionsState = shallowRef<DiagnosticPromptDefinition[]>([]);
const serviceDefinitionsState = shallowRef<McpServiceDefinition[]>([]);
const endpointUrlState = ref(defaultEndpointUrl());

let capabilitiesLoaded = false;
let loadPromise: Promise<void> | null = null;

export function useDiagnosticsCapabilities() {
  const store = useDashboardStore();
  const mcpServerEnabled = computed<boolean | null>(() => store.state.mcpEnabled);

  async function loadCapabilities(): Promise<void> {
    if (mcpServerEnabled.value !== true) {
      toolDefinitionsState.value = [];
      promptDefinitionsState.value = [];
      serviceDefinitionsState.value = [];
      endpointUrlState.value = defaultEndpointUrl();
      loadingCapabilitiesState.value = false;
      capabilitiesLoaded = false;
      return;
    }

    if (capabilitiesLoaded) {
      return;
    }

    if (loadPromise) {
      await loadPromise;
      return;
    }

    loadingCapabilitiesState.value = true;
    loadPromise = (async () => {
      try {
        const manifest = await listMcpManifest();
        endpointUrlState.value = typeof window === "undefined"
          ? manifest.endpoint
          : `${window.location.origin}${manifest.endpoint}`;
        serviceDefinitionsState.value = manifest.services.map((service) => ({
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
        }));
        toolDefinitionsState.value = manifest.tools.map((tool) => ({
          ...tool,
          ...(tool.inputSchema ? { inputSchema: { ...tool.inputSchema } } : {}),
        }));
        promptDefinitionsState.value = manifest.prompts.map((prompt) => ({
          ...prompt,
          arguments: prompt.arguments.map((argument) => ({ ...argument })),
        }));
        capabilitiesLoaded = true;
      } catch (error) {
        store.showToast("MCP server", error instanceof Error ? error.message : String(error));
      } finally {
        loadingCapabilitiesState.value = false;
        loadPromise = null;
      }
    })();

    await loadPromise;
  }

  watch(
    mcpServerEnabled,
    (enabled) => {
      if (enabled !== true) {
        toolDefinitionsState.value = [];
        promptDefinitionsState.value = [];
        serviceDefinitionsState.value = [];
        endpointUrlState.value = defaultEndpointUrl();
        loadingCapabilitiesState.value = false;
        capabilitiesLoaded = false;
        return;
      }
    },
    { immediate: true },
  );

  return {
    endpointUrl: readonly(endpointUrlState),
    loadingCapabilities: readonly(loadingCapabilitiesState),
    mcpServerEnabled,
    serviceDefinitions: readonly(serviceDefinitionsState),
    toolDefinitions: readonly(toolDefinitionsState),
    promptDefinitions: readonly(promptDefinitionsState),
    loadCapabilities,
  };
}
