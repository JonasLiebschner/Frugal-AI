# otel

`otel` provides shared OpenTelemetry trace export infrastructure for the workspace.
It owns persisted exporter configuration and exposes a reusable server capability
that lower apps can use to emit request-scoped trace spans.

## Provided runtime capability

- Nitro capability: `nitroApp.$otel`
- Event context: `event.context.otel`
  with `configService`, `traces`, and `reload()`

Public server surface:

- `server/otel-capability.ts`
- `server/otel-runtime.ts`
- `server/otel-config.ts`

Public shared/client surface:

- `otel-public-config.ts`
- `otel-client.ts`

## Configuration

Persistent config lives in:

- `DATA_DIR/config/otel/config.json`

Default without `DATA_DIR`:

- `.data/config/otel/config.json`

Important fields:

- `enabled`: turn OTLP trace export on or off
- `endpoint`: optional explicit OTLP/HTTP traces endpoint
- `headers`: optional OTLP headers such as auth tokens
- `timeoutMs`: export timeout per batch
- `serviceName`: OpenTelemetry `service.name`
- `serviceNamespace`: optional OpenTelemetry `service.namespace`
- `deploymentEnvironment`: optional OpenTelemetry `deployment.environment.name`
- `captureMessageContent`: opt in to serialized input and output message payload attributes
- `captureToolContent`: opt in to serialized tool definition and payload attributes

The content flags default to `false`. The OpenTelemetry GenAI semantic conventions
explicitly warn that prompt, instruction, tool, and output content can be large
and sensitive, so production export should stay metadata-only unless you
intentionally opt in.

When AI request routing middleware is used, exported trace spans also include
workspace-specific routing metadata:

- `llmproxy.routing.middleware.id`
- `llmproxy.routing.middleware.profile`

`headers` is marked `writeOnly` in the app schema. Dashboard and API reads never
return stored header values; they only expose whether headers are configured.
To update headers, send a new object. To remove them, use the explicit clear
toggle in the dashboard or admin payload.

When `enabled` is `true` and `endpoint` is omitted, the runtime follows the
standard OpenTelemetry OTLP environment-variable conventions such as
`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`, `OTEL_EXPORTER_OTLP_TRACES_HEADERS`, and
`OTEL_EXPORTER_OTLP_TRACES_TIMEOUT`.

## Dependencies

Hard dependency:

- `config`

Manifest:

- `manifest.json`
