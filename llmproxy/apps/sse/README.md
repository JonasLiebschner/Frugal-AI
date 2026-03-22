# sse

`sse` provides shared server-sent events infrastructure. It is intentionally generic so
other frontend apps can reuse it without depending on `llmproxy`. If the host disables
this layer, the rest of the system can still run without live updates.

## Provided routes

This app does not provide standalone public HTTP routes by itself. It provides the shared
SSE transport and topic registry that other apps attach to.

Primary public server surface:

- `server/sse-capability.ts`

## Registration

Topic providers register through `nitroApp.$sse?.registerHandler(...)`.

Relevant types:

- `SseCapability`
- `SseTopicProvider`
- `SseTopicDefinition`

## Dependencies

Hard dependencies:

- none

Manifest:

- `manifest.json`
