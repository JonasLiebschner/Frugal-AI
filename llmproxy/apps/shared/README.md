# shared

`shared` contains workspace-level infrastructure that is reused by multiple apps. It is
not a product app on its own and does not expose public product routes.

## Provided routes

None.

## Contents

Shared server helpers:

- `server/route-bundle.ts` for route bundle registration
- `server/nitro-lifecycle-hooks.ts` for shared Nitro plugin lifecycle wiring
- neutral contracts in `server/*-capability.ts` or `types/*` only when multiple apps
  truly share them

Shared test helpers:

- `test/nitro-test-host.ts`

## Registration

This layer does not provide a runtime registration API. It exists to host shared
implementation helpers used by the other apps.

`shared` should stay small and neutral:

- no host-specific product logic
- no app-owned persisted config models
- no dumping ground for helpers that belong clearly to one app
