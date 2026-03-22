# ai-server

`ai-server` provides the public OpenAI-compatible HTTP interface. It is intentionally
thin: routes live here, while request execution is delegated into `ai-proxy` and
`ai-client` through Nitro context.

## Provided routes

- `GET /healthz`
- `GET /v1/models`
- `POST /v1/chat/completions`
- `USE /v1/**`

Primary surface:

- `server/routes/*`

Public server shape:

- no app-specific Nitro capability
- public surface is the route tree itself

Test composition entry point:

- `test/runtime-api.ts`

## Dependencies

Hard dependency:

- `ai-proxy`

Manifest:

- `manifest.json`
