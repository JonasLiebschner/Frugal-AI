# llmproxy

`llmproxy` is the end-user app in this workspace. It provides the dashboard, chat UI,
admin API, and request debugging views on top of `ai-client`, `ai-proxy`, and `ai-server`. It can optionally
consume `sse` for live updates and `mcp-server`/`ai-agents` when those layers are present.

## Provided routes

- `GET /`
- `GET /dashboard/config`
- `GET /dashboard/config/connections`
- `GET /dashboard/config/openai`
- `GET /dashboard/config/mcp`
- `GET /dashboard/diagnostics`
- `GET /api/llmproxy/admin/state`
- `GET /api/llmproxy/admin/events`
- `GET /api/llmproxy/admin/connections`
- `POST /api/llmproxy/admin/connections`
- `PUT /api/llmproxy/admin/connections/:id`
- `PATCH /api/llmproxy/admin/connections/:id`
- `DELETE /api/llmproxy/admin/connections/:id`
- `GET /api/llmproxy/admin/mcp-client/servers`
- `POST /api/llmproxy/admin/mcp-client/servers`
- `PUT /api/llmproxy/admin/mcp-client/servers/:id`
- `DELETE /api/llmproxy/admin/mcp-client/servers/:id`
- `PUT /api/llmproxy/admin/config/server`
- `GET /api/llmproxy/admin/requests/:id`
- `GET /api/llmproxy/admin/requests/:id/events`
- `POST /api/llmproxy/admin/requests/:id/cancel`
- `GET /api/llmproxy/admin/diagnostics/requests/:id`

Admin and dashboard public server surfaces:

- `server/llmproxy-admin.ts`
- `server/llmproxy-dashboard.ts`
- `server/llmproxy-sse.ts`
- `server/llmproxy-admin-payloads.ts`
- `server/llmproxy-admin-json.ts`

Shared route helper surface:

- `llmproxy-admin-routes.ts`

Public client surface:

- `llmproxy-client.ts`
- focused client modules such as `llmproxy-dashboard-pages.ts`,
  `llmproxy-dashboard-bootstrap.ts`, `llmproxy-http.ts`, and
  `llmproxy-diagnostics-mcp.ts`

Test composition entry point:

- `test/runtime-api.ts`

## Registration points

`llmproxy` currently exposes one public registration surface for other layers: SSE topic
registration.

Public API:

- `server/llmproxy-sse.ts`

Helper:

- `registerLlmproxySseTopics(...)`

This is what the `sse` layer consumes when it is present. If `sse` is disabled at the
host level, the admin API still works, but live dashboard updates are unavailable.

The admin API edits app-owned runtime config documents. Connection and server
settings live in `DATA_DIR/config/ai-client/config.json`, which resolves to
`.data/config/ai-client/config.json` by default. Outbound `mcp-client`
registrations live separately in `DATA_DIR/config/mcp-client/config.json`.
Both changes apply live without a process restart. The `llmproxy` app itself
currently does not persist a separate app config document.

For live request state, diagnostics, and dashboard SSE, `llmproxy` consumes the
`ai-proxy` capability through `event.context.aiProxy` instead of a separate
request-state context field.

The host admin routes also use `event.context.aiProxy.configService` and
`event.context.aiProxy.loadBalancer` for connection and server configuration
changes, instead of reaching through a separate duplicated AI client event
surface.

## Dependencies

Hard dependency:

- `ai-client`
- `ai-proxy`
- `ai-server`

Recommended layers:

- `sse`
- `mcp-server`
- `ai-agents`

Manifest:

- `manifest.json`
