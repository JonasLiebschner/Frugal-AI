# Workspace Apps

This workspace is organized as layered Nuxt apps. `llmproxy` is the host product
app; the other apps are reusable infrastructure, protocol, or domain layers that
the host composes.

## App categories

Infrastructure and shared layers:

- `json-schema`: shared JSON Schema contracts, annotations, and object projection
- `config`: persisted app config storage under `DATA_DIR/config/<app>/config.json`
- `otel`: shared OpenTelemetry trace export and GenAI span infrastructure
- `plugins`: generic plugin registry infrastructure
- `ajv`: shared AJV-backed JSON Schema validation capability
- `sse`: shared server-sent events infrastructure
- `tool-registry`: shared tool registration and execution
- `ai-request-middleware`: shared parsed-request middleware registry for model routing
- `code-editor`: shared Ace-based code viewer/editor UI
- `shared`: neutral cross-app contracts, route-bundle helpers, and test helpers

AI layers:

- `ai-client`: upstream backend config, health checks, load balancing, model inventory
- `ai-proxy`: request orchestration, live request state, diagnostics, built-in tools and prompts
- `ai-server`: OpenAI-compatible HTTP surface
- `ai-agents`: prompt registry and prompt completion

MCP layers:

- `mcp-client`: outbound MCP integration with external MCP servers
- `mcp-server`: inbound MCP protocol adapter for local tools and prompts

Host product layer:

- `llmproxy`: dashboard, admin API, host wiring, and end-user UX

## Dependency rules

- Host apps depend on lower layers, never the other way around.
- Cross-app imports must go through `shared` or through the owning app's public
  surfaces.
- Do not import another app's `server/services/*` or `server/utils/*` directly.
- Do not import another app's `app/components/*`, `app/composables/*`, or
  `app/utils/*` directly. Cross-app frontend imports should go through a
  top-level `*-client.ts` module owned by that app.
- App-owned config belongs to the owning app and lives under
  `DATA_DIR/config/<app>/config.json`.

The repository enforces the cross-app import rule with:

- `npm run check:architecture`

## Recommended app structure

Preferred server-side layout inside an app:

- `config.schema.json`: external JSON Schema for the app's persisted config
- `server/<app>-capability.ts`: public Nitro-facing entry point for the app
- `server/<app>-types.ts`: public DTOs and type contracts
- `server/<app>-runtime.ts`: public runtime constructors or event-context binders
- `server/plugins/*.nitroPlugin.ts`: Nitro wiring only
- `server/api/*` or `server/routes/*`: HTTP surface only
- `server/services/*`: internal implementation details
- `server/utils/*`: internal helpers

Preferred frontend public layout when an app exposes reusable browser helpers:

- `<app>-client.ts`: top-level public client surface for cross-app frontend usage
- additional top-level `<app>-*.ts` modules may sit behind that client surface for
  focused route, HTTP, or feature helpers
- `app/components/*`: app-local components and client internals
- `app/composables/*`: app-local composables and client internals
- `app/utils/*`: app-local client helpers behind the public client surface

Preferred test layout:

- `test/runtime-api.ts`: public test composition surface for the app
- `test/route-bundle.ts`: optional explicit route bundle for integration tests

## Capability vs Runtime

The two names are intentionally different:

- `server/<app>-capability.ts`: the public app surface that other apps are
  allowed to import. This file should describe what the app offers from the
  outside: public types, public helper functions, and the Nitro-facing contract.
- `server/<app>-runtime.ts`: the public runtime construction layer for the app.
  This is where constructors, event-context binders, and runtime factory
  functions live.

In short:

- `capability` answers "what may another app depend on?"
- `runtime` answers "how is that capability created or attached at runtime?"

Typical rule of thumb:

- If another app needs to reference a contract or a stable public helper, import
  from `*-capability.ts`.
- If Nitro plugins or tests need to create or bind the app's runtime objects,
  import from `*-runtime.ts`.
- Request-time H3 context should prefer a single app-scoped capability like
  `event.context.aiClient`, `event.context.mcpClient`, or
  `event.context.mcpServer` over multiple sibling fields for the same app. If a
  feature belongs to an app-owned runtime, prefer reaching it through that app
  capability, for example `event.context.aiProxy.requestState`.

`*-capability.ts` may re-export selected parts of `*-runtime.ts`, but it should
stay focused on the public surface, not become a dump of internal services.

Not every app needs every file, but new apps should follow this shape unless there
is a clear reason not to.

Every app should define `config.schema.json`, even if it currently persists no
own config and therefore uses an empty-object schema. If the app participates in
runtime config persistence, it should also register that schema during Nitro
startup, usually through `server/plugins/configSchema.nitroPlugin.ts`. Fields
marked `writeOnly: true` are accepted on writes but must not be re-exposed by
the public config API. Fields marked `readOnly: true` stay readable but must be
rejected on public writes. `npm run check:architecture` enforces both the
presence of `config.schema.json` and a matching
`createAppConfigSchemaRegistrar("<app>", ...)` registration in the app's Nitro
plugins.

## Current ownership model

- `ai-client` owns backend connectivity and persisted upstream backend config.
- `ai-request-middleware` owns registrable request middleware that can influence
  model routing from parsed request payloads when a request explicitly uses
  `model: "middleware:<id>"`, including configured external HTTP router
  endpoints under `DATA_DIR/config/ai-request-middleware/config.json`.
- `ai-proxy` owns request orchestration, live request state, and diagnostics.
- `ai-server` owns only the public OpenAI-compatible HTTP surface.
- `mcp-client` owns outbound MCP connections and their persisted config.
- `mcp-server` owns only the inbound MCP protocol adapter.
- `llmproxy` owns the host dashboard and admin surface, not the reusable lower-level
  runtime concerns.
- `otel` owns shared OpenTelemetry trace export and app-local exporter config.
