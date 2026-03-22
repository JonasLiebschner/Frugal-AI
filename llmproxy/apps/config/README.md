# config

`config` is the shared config storage layer. It persists app-named
configuration files under `.data/config/<app>/config.json` or
`$env:DATA_DIR/config/<app>/config.json`.

## Provided routes

- `GET /api/config`
- `PUT /api/config`
- `GET /api/config/schema`
- `GET /api/config/:id`
- `PUT /api/config/:id`

## Nitro capability

- `nitroApp.$config?.resolveConfigFilePath(...)`
- `nitroApp.$config?.readConfig(...)`
- `nitroApp.$config?.writeConfigFile(...)`
- `nitroApp.$config?.registerSchema(...)`
- `nitroApp.$config?.getSchema(...)`
- `nitroApp.$config?.listSchemas()`
- public server API: `server/config-capability.ts`

## Public server surface

- `server/config-capability.ts`
- `server/config-types.ts`
- `server/config-runtime.ts`

Other apps should import `config` through `server/config-capability.ts`.
`config-types.ts` and `config-runtime.ts` stay behind that public surface as the
typed building blocks used by the capability module and app-local runtime code.

## Public runtime

- `createConfigService(...)`
- `createAppConfigStore(...)`
- `resolveConfigFilePath(...)`
- `resolveConfigDirPath(...)`
- `projectConfigValue(...)`
- `listConfigAccessViolations(...)`

## Public client surface

- `config-client.ts`
- `config-paths.ts`

Frontend consumers should import from `config-client.ts`. That public client
surface re-exports the managed config path helpers used for stable display text
around file locations such as `DATA_DIR/config/<app>/config.json`.

## Notes

Each app should provide `config.schema.json` in its app root and register that
schema during Nitro startup. The `config` app aggregates those registrations and
returns them from `GET /api/config/schema`.

`PUT /api/config` and `PUT /api/config/:id` validate incoming payloads against
the registered app schema before writing `DATA_DIR/config/<app>/config.json`.

String fields marked with `writeOnly: true` stay persisted on disk, but public
config reads (`GET /api/config` and `GET /api/config/:id`) redact them before
returning a response.

Fields marked with `readOnly: true` are rejected on public config writes with a
`400` response, so client-side editors cannot overwrite server-owned values.
