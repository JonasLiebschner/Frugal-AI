# ai-proxy

`ai-proxy` wires `ai-client` into higher-level AI features. It owns live request state,
diagnostics, internal inspection routes, built-in tool providers, and built-in prompt
providers. It does not own the public OpenAI-compatible HTTP surface.

## Provided routes

Internal inspection routes only:

- `GET /api/ai-proxy/internal/requests`
- `GET /api/ai-proxy/internal/requests/:id`
- `GET /api/ai-proxy/internal/diagnostics/requests/:id`

Primary public server surfaces:

- `server/ai-proxy-runtime.ts`
- `server/ai-proxy-diagnostics.ts`
- `server/ai-proxy-live-requests.ts`
- `server/ai-proxy-routing.ts`
- `server/ai-proxy-internal-routes.ts`

Test composition entry point:

- `test/runtime-api.ts`

## Registration and plugin integration

`ai-proxy` publishes runtime context and registers optional integrations into other apps.

Runtime integration:

- Nitro plugin: `server/plugins/aiProxy.nitroPlugin.ts`
- event context: `event.context.aiProxy`

The Nitro plugin builds `ai-proxy` directly from the shared `ai-client`
capability instead of wiring `configService` and `loadBalancer` fields by hand.

Request-time handlers should read live request state through that app capability,
for example:

- `event.context.aiProxy.requestState`

The same capability also exposes the AI runtime pieces that the host admin
surface needs:

- `event.context.aiProxy.configService`
- `event.context.aiProxy.loadBalancer`

Tool registration into `tool-registry`:

- Nitro plugin: `server/plugins/toolRegistry.nitroPlugin.ts`
- tool providers: `server/tools/*.ts`
- service metadata: `server/tools/ai-proxy-tool-service.ts`

Prompt registration into `ai-agents`:

- Nitro plugin: `server/plugins/aiAgents.nitroPlugin.ts`
- prompt providers: `server/prompts/*.ts`
- service metadata: `server/prompts/ai-proxy-prompt-service.ts`

## Dependencies

Hard dependencies:

- `ai-client`

Recommended layers:

- `tool-registry`
- `ai-agents`
- `sse`

Manifest:

- `manifest.json`
