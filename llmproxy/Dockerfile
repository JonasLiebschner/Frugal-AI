# syntax=docker/dockerfile:1.7

ARG LLMPROXY_REPOSITORY
ARG LLMPROXY_GIT_REF=dev

FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY nuxt.config.ts tsconfig.json ./
COPY apps ./apps

RUN npm ci
RUN npm run build

FROM node:22-alpine AS runtime

ARG LLMPROXY_REPOSITORY
ARG LLMPROXY_GIT_REF

LABEL org.opencontainers.image.source="${LLMPROXY_REPOSITORY}" \
      org.opencontainers.image.version="${LLMPROXY_GIT_REF}"

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4100
ENV NITRO_HOST=0.0.0.0
ENV NITRO_PORT=4100
ENV DATA_DIR=/data

WORKDIR /app

COPY package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.output ./.output

RUN mkdir -p /data \
  && chown -R node:node /app /data

USER node

EXPOSE 4100
VOLUME ["/data"]

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=12 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:4100/healthz').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["node", ".output/server/index.mjs"]
