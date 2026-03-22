# ai-client

`ai-client` owns upstream AI backend connectivity and persisted upstream configuration.
It provides the backend config service, load balancer, health checks, discovered model
inventory, routing snapshots, and final request log emission. It does not expose
public OpenAI-compatible routes.

When the `ai-request-middleware` app is present, `ai-client` also runs parsed
request-routing middleware before it resolves a concrete connection or model.
That middleware path is only activated when the incoming request model uses the
selector form `middleware:<id>`. Configured HTTP routing middlewares from
`ai-request-middleware` are awaited before backend acquisition, so the final
routed model can come from an external router service.

## Provided runtime capability

- Nitro capability: `nitroApp.$aiClient`
- Event context: `event.context.aiClient`
  with `configService` and `loadBalancer`

The Nitro and event surfaces are intentionally created from the same public
helper in `server/ai-client-runtime.ts`, so downstream apps consume one shared
AI client capability shape.

When the `otel` app is enabled, `ai-client` also exports final request telemetry
as OpenTelemetry trace spans. Prompt, output, and tool content stay opt-in via
the `otel` app config and are not exported by default.

Public server surface:

- `server/ai-client-capability.ts`
- `server/ai-client-runtime.ts`
- `server/ai-client-config.ts`
- `server/ai-client-backend-connectors.ts`
- `server/ai-client-diagnostic-http.ts`

Test composition entry point:

- `test/runtime-api.ts`

## Configuration

Persistent config lives in:

- `DATA_DIR/config/ai-client/config.json`

Default without `DATA_DIR`:

- `.data/config/ai-client/config.json`

## Dependencies

Hard dependency:

- `ai-request-middleware`
- `config`
- `otel`

Manifest:

- `manifest.json`
