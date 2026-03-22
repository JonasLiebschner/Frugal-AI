import type {
  McpClientNitroCapability,
} from "./mcp-client-capability";

declare module "h3" {
  interface H3EventContext {
    mcpClient: McpClientNitroCapability;
  }
}

declare module "nitropack" {
  interface NitroApp {
    $mcpClient?: McpClientNitroCapability;
  }
}
