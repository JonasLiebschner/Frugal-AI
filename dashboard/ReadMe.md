# Dashboard 

The dashboard shows all handled requests with their used models, power consumption, CO2 emissions and estimated water consumption.

A user can seelect a comparision model, to evaluate the behaviour against a static model selection.
The requests are filtered by user, except for the admin who can view all.

Graphs showing requests over time are also part of the visualization.

The user interface also includes a chat window, where the user can issue new requests.

## llmproxy Config

The chat calls llmproxy directly from the frontend.

Set the proxy URLs in:

- `frontend/src/environments/environment.dev.ts`
- `frontend/src/environments/environment.ts`

Example:

```ts
export const environment = {
  api_url: "http://localhost:8080",
  llmproxy_base_url: "https://llmproxy.frugalai.haupt.dev/v1",
  openai_models_url: "https://llmproxy.frugalai.haupt.dev/v1/models",
};
```

## Tech Stack

- Angular 22 (with signals and signals-forms), charts are rendered with ngx-echarts
- Docker

