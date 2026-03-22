# plugins

Provides a generic plugin registry for Nuxt/Nitro layers.

## Server capability

The Nitro plugin exposes the Nitro capability `nitroApp.$plugins` with:

- `createRegistry(name)`
- `registerItem(registryName, items)`

Other apps can use that capability directly during Nitro plugin startup to create
registries and register items.

Primary public server surface:

- `server/plugins-capability.ts`
- `server/plugins-types.ts`
- `server/plugins-runtime.ts`
- `plugins-registry.ts`

Primary public client surface:

- `plugins-client.ts`

`plugins-registry.ts` is the app-local shared registry core used by both the
server and client public surfaces.
