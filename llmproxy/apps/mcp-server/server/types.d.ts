import type {
  McpServerNitroCapability,
  McpServerEventCapability,
} from "./mcp-server-capability";

declare module "h3" {
  interface H3EventContext {
    mcpServer: McpServerEventCapability;
  }
}

declare module "nitropack" {
  interface NitroApp {
    $mcpServer?: McpServerNitroCapability;
  }
}

export {};
