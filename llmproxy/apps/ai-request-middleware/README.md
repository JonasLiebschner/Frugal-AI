# ai-request-middleware

`ai-request-middleware` owns the server-side registry for parsed request
middleware that can influence AI model routing before `ai-client` acquires a
connection.

## Responsibility

- register request-routing middlewares from other apps
- load configured external HTTP routing middlewares from app config
- parse OpenAI-style request payloads into a prompt-aware middleware context
- resolve a specifically requested middleware before load balancing

The app itself does not implement any concrete routing policy. Product- or
environment-specific middleware should live in separate apps and register
through this capability.

Each middleware receives:

- the parsed proxy route with both `requestedModel` and current effective `model`
- a normalized prompt view with `messages`, `systemText`, `userText`, and `lastUserText`
- the currently routable `knownModels` list from `ai-client`

Configured HTTP middlewares reduce that richer prompt context to a plain
classifier query and then map the classifier result to a concrete routed model.

Configured HTTP middlewares are awaited before `ai-client` acquires a
connection. The in-flight request therefore stays blocked at routing time until
the middleware responds or aborts.

Middlewares are not global. A middleware only runs when the client explicitly
uses a model selector of the form `middleware:<id>`, for example
`middleware:external-router`.

Configured middlewares are also exposed through `GET /v1/models` as virtual
selector entries like `middleware:external-router`, including metadata for the
configured classifier URL and the `small`/`large` target-model mapping.

## Public server surface

- [server/ai-request-middleware-capability.ts](C:\Users\julian\Projects\llmproxy\apps\ai-request-middleware\server\ai-request-middleware-capability.ts):
  public types and Nitro capability
- [server/ai-request-middleware-config-service.ts](C:\Users\julian\Projects\llmproxy\apps\ai-request-middleware\server\ai-request-middleware-config-service.ts):
  persisted config loading for configured HTTP middlewares
- [server/ai-request-middleware-http.ts](C:\Users\julian\Projects\llmproxy\apps\ai-request-middleware\server\ai-request-middleware-http.ts):
  external HTTP middleware adapter
- [server/ai-request-middleware-runtime.ts](C:\Users\julian\Projects\llmproxy\apps\ai-request-middleware\server\ai-request-middleware-runtime.ts):
  runtime constructors
- [server/ai-request-middleware-prompt.ts](C:\Users\julian\Projects\llmproxy\apps\ai-request-middleware\server\ai-request-middleware-prompt.ts):
  parsed prompt helpers

## Configuration

Persistent config lives in:

- `DATA_DIR/config/ai-request-middleware/config.json`

Default without `DATA_DIR`:

- `.data/config/ai-request-middleware/config.json`

Shape:

```json
{
  "middlewares": [
    {
      "id": "external-router",
      "url": "https://router.example.com/api/v1/classify",
      "models": {
        "small": "gpt-4.1-mini",
        "large": "gpt-5"
      }
    }
  ]
}
```

Each configured middleware receives an HTTP `POST` with:

- `query`

Example request:

```json
{
  "query": "Explain the thermodynamic principles behind black hole evaporation."
}
```

The JSON response may return:

```json
{
  "result": "large"
}
```

The configured `models.large` or `models.small` mapping is then used as the
effective routed model for the request.

## Registration pattern

Another app can register a middleware during Nitro startup:

```ts
export default defineNitroPlugin((nitroApp) => {
  nitroApp.$aiRequestMiddleware?.registerRoutingMiddleware({
    id: "external-router",
    order: 100,
    route: async ({ prompt, knownModels }) => {
      return {
        model: knownModels[0]?.id,
      };
    },
  });
});
```

Registered middlewares can also define `order`, but that only matters for list
display or future tooling. Runtime routing now selects one concrete middleware
by id instead of evaluating the full registry.
