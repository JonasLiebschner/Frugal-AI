# json-schema

`json-schema` provides the workspace-level JSON Schema contracts and object
projection helpers.

This layer is intentionally separate from `ajv`:

- `json-schema` owns JSON Schema-facing types, app-schema registration, and
  annotation-aware object application such as `readOnly` / `writeOnly`
- `ajv` remains the concrete validator implementation

## Public server APIs

- `server/json-schema-capability.ts`
- `server/json-schema-types.ts`
- `server/json-schema-runtime.ts`

Other apps should import JSON Schema helpers through
`server/json-schema-capability.ts`.

## Public client APIs

- `json-schema-client.ts`
- `json-schema-field-meta.ts`
- `json-schema-display.ts`

Frontend consumers should import from `json-schema-client.ts`. That public
client surface re-exports the field metadata and schema display helpers so host
apps do not need to depend on internal utility paths.

For schema presentation, `json-schema-display.ts` provides generic UI
helpers such as type labels and note summaries for schema fragments, including
local `$ref` targets. It also exposes object-shape helpers for listing
properties, required fields, and `additionalProperties` behavior from referenced
object schemas.

## Runtime behavior

Current runtime semantics implemented here:

- `writeOnly: true`
  - redacted from public read projections
- `readOnly: true`
  - rejected on public write payloads

Supported today:

- annotation-aware projection of JavaScript objects for read/write access
- app config schema registration helpers
- shared JSON Schema validation contracts consumed by `ajv`

Supported structural traversal for projection and access checks:

- `properties`
- `patternProperties`
- `additionalProperties` when it contains a schema
- `items`
- `prefixItems`
- `allOf`
- local `$ref` targets such as `#/$defs/...`

The layer also exposes the standard metadata keywords that are useful for UI or
documentation-driven tooling:

- `title`
- `description`
- `default`
- `examples`
- `deprecated`
- `readOnly`
- `writeOnly`
- `$comment`
- `contentEncoding`
- `contentMediaType`

## Notes on library choice

`ajv` is still the right validation library and stays in its own app. The JSON
Schema metadata keywords above are annotations rather than core validation
rules, so this workspace applies them explicitly in `json-schema` instead of
trying to overload the validator layer with transport- or UI-specific
semantics.

We intentionally do not enable AJV's data-mutating options globally here. AJV
supports behaviors such as assigning `default` values, removing additional
properties, or coercing types, but those are opt-in mutation strategies rather
than neutral schema contracts. If we want them later, they should be enabled
per use case instead of becoming implicit global behavior.
