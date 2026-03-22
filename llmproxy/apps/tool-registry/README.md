# tool-registry

`tool-registry` is the canonical tool registry layer. It stores tool definitions and
tool handlers, but it does not expose those tools over a protocol by itself. Protocol
adapters such as `mcp-server` consume this registry.

## Provided routes

Internal adapter routes only:

- `GET /api/tool-registry/internal/services`
- `POST /api/tool-registry/internal/services/:serviceId/tools/:toolName`

Primary public server surface:

- `server/tool-registry-capability.ts`
- `server/tool-registry-internal-routes.ts`

Test composition entry point:

- `test/runtime-api.ts`

## Registration

Tool providers register through `nitroApp.$toolRegistry?.registerTool(...)` in a
targeted Nitro plugin.

`nitroApp.$toolRegistry` and `event.context.toolRegistry` intentionally share the
same registry surface, so plugins and routes see the same registration and
lookup API.

Relevant types:

- `ToolProvider`
- `ToolDefinition`
- `ToolRegistration`
- `ToolCallResult`

Tool contract rules:

- every tool must provide `inputSchema`
- a tool may provide `outputSchema`
- when `outputSchema` is omitted, successful output is treated as raw bytes

Recommended structure for provider apps:

- one tool implementation per file
- external JSON schema files next to the implementation
- `<tool-name>.input.json`
- optional `<tool-name>.output.json`

## Dependencies

Hard dependencies:

- `ajv`

Recommended layer:

- `mcp-server`

Manifest:

- `manifest.json`
