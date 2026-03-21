# syntax=docker/dockerfile:1
# Build context: classifier/ (monorepo root)
# docker build -f packages/onnx-middleware/Dockerfile -t frugal-onnx-middleware .
#
# ── Model volume ──────────────────────────────────────────────────────────────
# The ONNX model and tokenizer are NOT bundled into this image.
# Mount a directory containing the following files at /models at runtime:
#
#   /models/
#   ├── model_int8.onnx         (quantized ModernBERT — recommended)
#   │   or model.onnx           (float32 — ~268 MB, higher precision)
#   ├── tokenizer.json          (HuggingFace fast-tokenizer config)
#   └── tokenizer_config.json   (optional, loaded automatically if present)
#
# docker run -v /path/to/model_output:/models frugal-onnx-middleware
#
# Override the defaults via environment variables if needed:
#   MODEL_PATH      default: /models/model_int8.onnx
#   TOKENIZER_PATH  default: /models/tokenizer.json
#   PORT            default: 3001
#
# Training output from train.py is placed in packages/onnx-middleware/model_output/
# and maps 1:1 to the expected mount layout above.
# ─────────────────────────────────────────────────────────────────────────────

# ── deps: install workspace dependencies ─────────────────────────────────────
# Use Debian-based image here to match glibc requirement of onnxruntime-node
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

# Root-level node_modules (.bun cache with actual package files, incl. onnxruntime-node native binaries)
COPY --from=deps --chown=app:app /app/node_modules ./node_modules

# Per-package node_modules (workspace symlinks: shared → ../../shared, onnxruntime-node → .bun/..., etc.)
COPY --from=deps --chown=app:app /app/packages/onnx-middleware/node_modules ./packages/onnx-middleware/node_modules

# Source: shared library + middleware entry points (no tests, no model files)
COPY --chown=app:app packages/shared/index.ts packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/
COPY --chown=app:app packages/onnx-middleware/index.ts packages/onnx-middleware/classifier.ts packages/onnx-middleware/tokenizer.ts packages/onnx-middleware/package.json packages/onnx-middleware/tsconfig.json ./packages/onnx-middleware/
COPY --chown=app:app tsconfig.json ./

USER app

ENV MODEL_PATH=/models/model_int8.onnx
ENV TOKENIZER_PATH=/models/tokenizer.json
ENV PORT=3001

VOLUME /models
EXPOSE 3001

CMD ["bun", "run", "packages/onnx-middleware/index.ts"]
