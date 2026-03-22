import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeAiClientConfig,
  normalizeAiClientSettings,
  resolveConnectionHeaders,
} from "../server/ai-client-capability";

test("normalizeAiClientSettings falls back to defaults for invalid values", () => {
  assert.deepEqual(
    normalizeAiClientSettings({
      requestTimeoutMs: -1,
      queueTimeoutMs: 0,
      healthCheckIntervalMs: -50,
      recentRequestLimit: 1.25,
    }),
    {
      requestTimeoutMs: 600_000,
      queueTimeoutMs: 30_000,
      healthCheckIntervalMs: 10_000,
      recentRequestLimit: 1000,
    },
  );
});

test("resolveConnectionHeaders prefers env-backed api keys over stored values", () => {
  process.env.TEST_PROXY_API_KEY = "from-env";

  try {
    assert.deepEqual(
      resolveConnectionHeaders({
        id: "primary",
        name: "Primary",
        baseUrl: "http://127.0.0.1:8080",
        connector: "openai",
        enabled: true,
        maxConcurrency: 1,
        headers: {
          "x-cluster": "a",
        },
        apiKey: "from-config",
        apiKeyEnv: "TEST_PROXY_API_KEY",
      }),
      {
        "x-cluster": "a",
        authorization: "Bearer from-env",
      },
    );
  } finally {
    delete process.env.TEST_PROXY_API_KEY;
  }
});

test("normalizeAiClientConfig rejects duplicate connection ids", () => {
  assert.throws(
    () =>
      normalizeAiClientConfig(
        {
          connections: [
            {
              id: "primary",
              name: "Primary",
              baseUrl: "http://127.0.0.1:8080",
              enabled: true,
              maxConcurrency: 1,
            },
            {
              id: "primary",
              name: "Primary Duplicate",
              baseUrl: "http://127.0.0.1:8081",
              enabled: true,
              maxConcurrency: 1,
            },
          ],
        },
        ".data/config/ai-client/config.json",
      ),
    /Duplicate connection id "primary"/,
  );
});
