# mcp-server

`mcp-server` is the protocol adapter layer for the MCP specification version `2025-11-25`.
It owns the MCP transport, session lifecycle, protocol negotiation, and JSON-RPC method
handling. It does not own tool or prompt business logic:

- tools come from `tool-registry`
- prompts come from `ai-agents`

## Provided routes

- `POST /mcp`
  Handles Streamable HTTP MCP JSON-RPC requests and notifications.
- `GET /mcp`
  Returns `405` because this adapter does not expose an SSE stream over `GET /mcp`.
- `DELETE /mcp`
  Closes an initialized MCP session identified by the `mcp-session-id` header.
- `GET /mcp/manifest`
  Helper endpoint that exposes the composed MCP adapter surface.

## Supported MCP methods

Lifecycle and base protocol:

- `initialize`
- `ping`
- `notifications/initialized`
- JSON-RPC request / notification / response envelope parsing

Server features currently exposed:

- `tools/list`
- `tools/call`
- `prompts/list`
- `prompts/get`
- `completion/complete`
- `resources/list`
- `resources/read`
- `resources/templates/list`

Helper extension:

- `services/list`

Explicitly unsupported:

- `logging/setLevel`
- SSE streaming over `GET /mcp`
- task-augmented `tools/call`
- resource template completions

## Registration

Preferred integration path:

- register tools into `tool-registry`
- register prompts into `ai-agents` from the provider app that owns them

`mcp-server` will discover both registries and expose their public surface over the protocol.

Low-level MCP handler registration is available for adapter-style extensions through:

- `nitroApp.$mcpServer?.registerHandler(...)`
- `event.context.mcpServer`

`nitroApp.$mcpServer` exposes the adapter registration surface plus the shared
`transport`, while `event.context.mcpServer` exposes the request-bound route
surface plus the same `transport`.

Request-time H3 handlers should use the bundled server capability on
`event.context.mcpServer`. That event capability exposes:

- `isEnabled()`
- `getManifest()`
- `handleRequest(...)`
- `transport`

## Session and headers

The MCP HTTP transport uses the standard session headers:

- `mcp-session-id`
- `mcp-protocol-version`

`initialize` negotiates the protocol version, creates a session, and returns both headers.
Clients must then send `notifications/initialized` before regular requests.

## Runtime config

The enable/disable state belongs to the `mcp-server` app itself and is read from Nuxt runtime
config in `server/plugins/mcpServer.nitroPlugin.ts`.

Relevant runtime config keys:

- `private.mcpEnabled`
- `private.mcpAllowedOrigins`
- `private.mcpSessionTtlMs`

Example env overrides:

- `NUXT_PRIVATE_MCP_ENABLED=false`
- `NUXT_PRIVATE_MCP_ALLOWED_ORIGINS='["https://example.com"]'`
- `NUXT_PRIVATE_MCP_SESSION_TTL_MS=3600000`

## Public server surface

- `server/mcp-server-capability.ts`
- `nuxt.config.ts`

Test composition entry point:

- `test/runtime-api.ts`

## Dependencies

Hard runtime dependencies:

- `ajv`

Optional adapter sources:

- `tool-registry`
- `ai-agents`

Manifest:

- `manifest.json`
