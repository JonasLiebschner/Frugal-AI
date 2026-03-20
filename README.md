# Frugal-AI

The project can be run using docker compose.

## Architecture
The project consists of a router and a end-user dashboard.

### Router
TBD
Any request to a LLM is stored in a database using OpenTelemetry standards (e.g. Tempo).

### Dashboard
The dashboard is structured into backend and frontend.
The backend consumes traces based on the [OTEL standard](https://opentelemetry.io/docs/specs/semconv/gen-ai/) and transforms them for the frontend.

The frontend consumes the previously hold conversations and shows their consumption and metadata.
Additionally a chat window is available, which calls the router for inference.
