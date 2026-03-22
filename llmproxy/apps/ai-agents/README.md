# ai-agents

`ai-agents` is the prompt registry layer. It owns prompt registration and prompt
lookup, but not the business logic for every prompt. Provider apps register prompts
into this layer, and adapters such as `mcp-server` can expose them when both layers are
present.

## Provided routes

Internal adapter routes only:

- `GET /api/ai-agents/internal/services`
- `POST /api/ai-agents/internal/services/:serviceId/prompts/:promptName`
- `POST /api/ai-agents/internal/services/:serviceId/prompts/:promptName/completion`

Primary public server surface:

- `server/ai-agents-capability.ts`
- `server/ai-agents-internal-routes.ts`

Test composition entry point:

- `test/runtime-api.ts`

## Registration

Prompt providers register into the prompt registry through
`nitroApp.$aiAgents?.registerPrompt(...)` in a targeted Nitro plugin.

`nitroApp.$aiAgents` and `event.context.aiAgents` intentionally share the same
prompt-registry surface, so plugins and routes see the same registration and
lookup API.

Each prompt registration may provide:

- prompt metadata and arguments
- `getPrompt(...)` behavior
- optional `complete(...)` behavior for MCP `completion/complete`

Current built-in workspace provider:

- `ai-proxy/server/plugins/aiAgents.nitroPlugin.ts`

## Dependencies

Recommended layer:

- `mcp-server`

Manifest:

- `manifest.json`
