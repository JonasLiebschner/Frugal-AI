# syntax=docker/dockerfile:1
# Build context: classifier/ (monorepo root)
# docker build -f packages/simple-middleware/Dockerfile -t frugal-simple-middleware .

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
COPY packages/simple-middleware/ packages/simple-middleware/
COPY tsconfig.json ./

# Compile to standalone binary — no bun runtime needed at runtime
RUN bun build --compile --minify packages/simple-middleware/index.ts --outfile /app/server

# ── runtime ───────────────────────────────────────────────────────────────────
FROM alpine:3

RUN apk add --no-cache libstdc++ && \
    addgroup -S app && adduser -S -G app app

COPY --from=build --chown=app:app /app/server /app/server

USER app

ENV PORT=3000
EXPOSE 3000

CMD ["/app/server"]
