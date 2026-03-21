# syntax=docker/dockerfile:1
# Build context: classifier/ (monorepo root)
# docker build -t frugal-ai-middleware .
#
# Select which middleware to run via the MIDDLEWARE env var:
#   MIDDLEWARE=simple  (default) — heuristic classifier,    PORT default 3000
#   MIDDLEWARE=onnx               — ModernBERT ONNX model,  PORT default 3001
#   MIDDLEWARE=llm                — LLM via OpenAI-compat,  PORT default 3002

# ── deps ──────────────────────────────────────────────────────────────────────
FROM oven/bun:1-slim AS deps
WORKDIR /app

COPY package.json bun.lock ./
COPY packages/shared/package.json               packages/shared/
COPY packages/simple-middleware/package.json    packages/simple-middleware/
COPY packages/onnx-middleware/package.json      packages/onnx-middleware/
COPY packages/llm-middleware/package.json       packages/llm-middleware/
RUN bun install --frozen-lockfile

# ── runtime ───────────────────────────────────────────────────────────────────
FROM oven/bun:1-slim
WORKDIR /app

RUN groupadd --system app && useradd --system --gid app --no-create-home app

# Root node_modules (shared deps + native binaries like onnxruntime-node)
COPY --from=deps --chown=app:app /app/node_modules ./node_modules

# Per-package node_modules (workspace symlinks)
COPY --from=deps --chown=app:app /app/packages/shared/node_modules            ./packages/shared/node_modules
COPY --from=deps --chown=app:app /app/packages/simple-middleware/node_modules  ./packages/simple-middleware/node_modules
COPY --from=deps --chown=app:app /app/packages/onnx-middleware/node_modules    ./packages/onnx-middleware/node_modules
COPY --from=deps --chown=app:app /app/packages/llm-middleware/node_modules     ./packages/llm-middleware/node_modules

# Source
COPY --chown=app:app packages/shared/          packages/shared/
COPY --chown=app:app packages/simple-middleware/index.ts packages/simple-middleware/classifier.ts packages/simple-middleware/package.json packages/simple-middleware/tsconfig.json ./packages/simple-middleware/
COPY --chown=app:app packages/onnx-middleware/index.ts packages/onnx-middleware/classifier.ts packages/onnx-middleware/tokenizer.ts packages/onnx-middleware/package.json packages/onnx-middleware/tsconfig.json ./packages/onnx-middleware/
COPY --chown=app:app packages/llm-middleware/index.ts packages/llm-middleware/classifier.ts packages/llm-middleware/package.json packages/llm-middleware/tsconfig.json ./packages/llm-middleware/
COPY --chown=app:app tsconfig.json ./

USER app

ENV MIDDLEWARE=simple
VOLUME /models
EXPOSE 3000 3001 3002

CMD bun run packages/${MIDDLEWARE}-middleware/index.ts
