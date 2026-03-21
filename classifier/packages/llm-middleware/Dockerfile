# syntax=docker/dockerfile:1
# Build context: classifier/ (monorepo root)
# docker build -f packages/llm-middleware/Dockerfile -t frugal-llm-middleware .
#
# Configuration via environment variables:
#   LLM_BASE_URL   default: https://api.openai.com/v1  (e.g. http://ollama:11434/v1)
#   LLM_API_KEY    default: ""                          (not required for Ollama)
#   LLM_MODEL      default: gpt-4o-mini                (e.g. llama3, mistral)
#   PORT           default: 3002

# ── deps + compile ────────────────────────────────────────────────────────────
FROM oven/bun:1-alpine AS build
WORKDIR /app

COPY package.json bun.lock ./
COPY packages/shared/package.json               packages/shared/
COPY packages/simple-middleware/package.json    packages/simple-middleware/
COPY packages/onnx-middleware/package.json      packages/onnx-middleware/
COPY packages/llm-middleware/package.json       packages/llm-middleware/
RUN bun install --frozen-lockfile

COPY packages/shared/ packages/shared/
COPY packages/llm-middleware/ packages/llm-middleware/
COPY tsconfig.json ./

RUN bun build --compile --minify packages/llm-middleware/index.ts --outfile /app/server

# ── runtime ───────────────────────────────────────────────────────────────────
FROM alpine:3

RUN apk add --no-cache libstdc++ && \
    addgroup -S app && adduser -S -G app app

COPY --from=build --chown=app:app /app/server /app/server

USER app

ENV LLM_BASE_URL=https://api.openai.com/v1
ENV LLM_API_KEY=""
ENV LLM_MODEL=gpt-4o-mini
ENV PORT=3002
EXPOSE 3002

CMD ["/app/server"]
