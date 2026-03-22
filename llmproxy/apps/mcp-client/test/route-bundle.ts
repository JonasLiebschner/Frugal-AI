import type { RouteBundle } from "../../shared/server/route-bundle";
import {
  mcpClientInternalManifestRoutePattern,
  mcpClientInternalPromptCompletionRoutePattern,
  mcpClientInternalPromptRoutePattern,
  mcpClientInternalServersPath,
  mcpClientInternalToolRoutePattern,
} from "../server/mcp-client-capability";
import apiInternalServersGet from "../server/api/mcp-client/internal/servers/index.get";
import apiInternalManifestGet from "../server/api/mcp-client/internal/servers/[serverId]/manifest.get";
import apiInternalToolCallPost from "../server/api/mcp-client/internal/servers/[serverId]/tools/[toolName]/index.post";
import apiInternalPromptGetPost from "../server/api/mcp-client/internal/servers/[serverId]/prompts/[promptName]/index.post";
import apiInternalPromptCompletionPost from "../server/api/mcp-client/internal/servers/[serverId]/prompts/[promptName]/completion.post";

export const mcpClientTestRouteBundle: RouteBundle = {
  get: [
    { path: mcpClientInternalServersPath, handler: apiInternalServersGet },
    { path: mcpClientInternalManifestRoutePattern, handler: apiInternalManifestGet },
  ],
  post: [
    { path: mcpClientInternalToolRoutePattern, handler: apiInternalToolCallPost },
    { path: mcpClientInternalPromptRoutePattern, handler: apiInternalPromptGetPost },
    { path: mcpClientInternalPromptCompletionRoutePattern, handler: apiInternalPromptCompletionPost },
  ],
};
