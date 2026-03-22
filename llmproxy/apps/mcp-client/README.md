# mcp-client

`mcp-client` is the outbound MCP integration layer. It is the place where this
workspace registers external MCP servers and talks to them over streamable HTTP.
The outbound transport is implemented with the official
`@modelcontextprotocol/sdk`, while the surrounding app surface stays Nitro-native.

## Provided routes

- `GET /api/mcp-client/internal/servers`
- `GET /api/mcp-client/internal/servers/:serverId/manifest`
- `POST /api/mcp-client/internal/servers/:serverId/tools/:toolName`
- `POST /api/mcp-client/internal/servers/:serverId/prompts/:promptName`
- `POST /api/mcp-client/internal/servers/:serverId/prompts/:promptName/completion`

## Registration

External MCP servers can register through:

- `nitroApp.$mcpClient?.registerServer(...)`
- `runtimeConfig.private.mcpClientServers`
- persisted config at `DATA_DIR/config/mcp-client/config.json`

The service stores connection metadata for remote MCP systems, such as:

- server id
- title
- endpoint URL
- optional description
- transport type
- optional protocol version
- optional static headers

After registration, other layers can use the Nitro capability or the internal
routes to:

- inspect a remote server surface
- call remote tools
- load remote prompts
- request prompt completions

Request-time H3 handlers should consume the bundled app capability on:

- `event.context.mcpClient`

That event capability exposes:

- outbound MCP client operations like `listServers`, `getManifest`, `callTool`,
  `getPrompt`, `completePrompt`, and `readResource`
- `configService`: the persisted `mcp-client` config service

Runtime-config registration accepts the same shape as `ExternalMcpServerDefinition`
from the public `server/mcp-client-types.ts` surface, for example:

```ts
export default defineNuxtConfig({
  runtimeConfig: {
    private: {
      mcpClientServers: [
        {
          id: "remote-docs",
          title: "Remote Docs",
          endpoint: "https://example.com/mcp",
          transport: "streamable-http",
          protocolVersion: "2025-11-25",
          headers: {
            authorization: "Bearer <token>",
          },
        },
      ],
    },
  },
});
```

At runtime, `mcp-client` merges registrations from three sources:

- persisted config from the `config` app at `DATA_DIR/config/mcp-client/config.json`
- `runtimeConfig.private.mcpClientServers`
- plugin-time `registerServer(...)` calls

At the host level, a consuming app can persist and mutate those config-backed
registrations through its own admin API.

## Public server surface

- `server/mcp-client-capability.ts`
- `server/mcp-client-internal-routes.ts`
- `server/mcp-client-types.ts`
- `test/runtime-api.ts`

## Notes

`mcp-client` does not expose local tools or prompts over `/mcp`; that remains
the responsibility of `mcp-server`.

The service uses the SDK client and its streamable HTTP transport for:

- remote session initialization
- protocol negotiation
- manifest discovery
- remote tool calls
- remote prompt loading
- remote prompt completion requests
