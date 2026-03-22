# ajv

Provides a shared AJV validation service for the composed Nuxt shell.

This layer is the canonical JSON Schema validation service for runtime consumers such as
`tool-registry` and `mcp-server`.

## Routes

- `POST /api/ajv/validate`

## Public server APIs

- `server/ajv-capability.ts`
- `server/ajv-types.ts`
- `server/ajv-runtime.ts`
  - `../json-schema/server/json-schema-capability.ts`
  - shared JSON Schema contracts consumed via `useSchemaValidationService()`

Other apps should import AJV through `server/ajv-capability.ts`. The
`ajv-types.ts` and `ajv-runtime.ts` modules remain the lower-level building
blocks behind that public surface.

## Test composition APIs

- `test/runtime-api.ts`

## Registration

The Nitro plugin is built from the `plugins` public server surface and the
shared Nitro capability `nitroApp.$plugins`.

Apps that want to add AJV keywords or formats should register them through the
`plugins` registries:

- registry `ajv:keywords`
- registry `ajv:formats`

The built-in AJV layer creates both registries during startup and registers the
default formats there before constructing the shared AJV service.

The `POST /api/ajv/validate` route intentionally stays available as a shell-level
validation endpoint so AJV can be consumed both as a local Nitro capability and
as an internal HTTP validation task.

Runtime consumers should prefer the local Nitro capability exposed as `nitroApp.$ajv`
and the JSON Schema helper `useSchemaValidationService()` over direct AJV
implementation details.
