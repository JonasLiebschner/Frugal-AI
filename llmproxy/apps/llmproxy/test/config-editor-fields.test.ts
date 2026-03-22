import assert from "node:assert/strict";
import test from "node:test";

import {
  createAiRequestMiddlewareEditorFields,
  createDefaultBackendEditorFields,
  createOtelEditorFields,
  createServerEditorFields,
  isDefaultBackendEditorFields,
} from "../llmproxy-client";

test("createDefaultBackendEditorFields prefers schema defaults for supported fields", () => {
  const schema = {
    type: "object",
    properties: {
      connections: {
        type: "array",
        items: {
          type: "object",
          properties: {
            connector: { type: "string", default: "ollama" },
            enabled: { type: "boolean", default: false },
            maxConcurrency: { type: "integer", default: 4 },
          },
        },
      },
    },
  };

  assert.deepEqual(
    createDefaultBackendEditorFields(schema),
    {
      id: "",
      name: "",
      baseUrl: "",
      connector: "ollama",
      enabled: false,
      maxConcurrency: "4",
      healthPath: "",
      modelsText: "*",
      headersText: "",
      apiKey: "",
      apiKeyEnv: "",
      clearApiKey: false,
      timeoutMs: "",
      monitoringTimeoutMs: "",
      monitoringIntervalMs: "",
      energyUsageUrl: "",
    },
  );
});

test("createServerEditorFields falls back to schema defaults when no config is loaded", () => {
  const schema = {
    type: "object",
    properties: {
      requestTimeoutMs: { type: "integer", default: 600000 },
      queueTimeoutMs: { type: "integer", default: 30000 },
      healthCheckIntervalMs: { type: "integer", default: 10000 },
      recentRequestLimit: { type: "integer", default: 1000 },
    },
  };

  assert.deepEqual(
    createServerEditorFields(null, schema),
    {
      requestTimeoutMs: "600000",
      queueTimeoutMs: "30000",
      healthCheckIntervalMs: "10000",
      recentRequestLimit: "1000",
    },
  );
});

test("createServerEditorFields prefers loaded config values over schema defaults", () => {
  const schema = {
    type: "object",
    properties: {
      requestTimeoutMs: { type: "integer", default: 600000 },
      queueTimeoutMs: { type: "integer", default: 30000 },
      healthCheckIntervalMs: { type: "integer", default: 10000 },
      recentRequestLimit: { type: "integer", default: 1000 },
    },
  };

  assert.deepEqual(
    createServerEditorFields({
      requestTimeoutMs: 120000,
      queueTimeoutMs: 45000,
      healthCheckIntervalMs: 5000,
      recentRequestLimit: 250,
    }, schema),
    {
      requestTimeoutMs: "120000",
      queueTimeoutMs: "45000",
      healthCheckIntervalMs: "5000",
      recentRequestLimit: "250",
    },
  );
});

test("createOtelEditorFields falls back to schema defaults when no config is loaded", () => {
  const schema = {
    type: "object",
    properties: {
      enabled: { type: "boolean", default: false },
      endpoint: { type: "string", default: "https://collector.example.com/v1/traces" },
      timeoutMs: { type: "integer", default: 10000 },
      serviceName: { type: "string", default: "llmproxy" },
      serviceNamespace: { type: "string", default: "proxy" },
      deploymentEnvironment: { type: "string", default: "production" },
      captureMessageContent: { type: "boolean", default: false },
      captureToolContent: { type: "boolean", default: true },
    },
  };

  assert.deepEqual(
    createOtelEditorFields(null, schema),
    {
      enabled: false,
      endpoint: "https://collector.example.com/v1/traces",
      headersText: "",
      clearHeaders: false,
      timeoutMs: "10000",
      serviceName: "llmproxy",
      serviceNamespace: "proxy",
      deploymentEnvironment: "production",
      captureMessageContent: false,
      captureToolContent: true,
    },
  );
});

test("createOtelEditorFields prefers loaded config values over schema defaults", () => {
  const schema = {
    type: "object",
    properties: {
      enabled: { type: "boolean", default: false },
      endpoint: { type: "string", default: "https://collector.example.com/v1/traces" },
      timeoutMs: { type: "integer", default: 10000 },
      serviceName: { type: "string", default: "llmproxy" },
      serviceNamespace: { type: "string", default: "proxy" },
      deploymentEnvironment: { type: "string", default: "production" },
      captureMessageContent: { type: "boolean", default: false },
      captureToolContent: { type: "boolean", default: true },
    },
  };

  assert.deepEqual(
    createOtelEditorFields({
      enabled: true,
      endpoint: "https://otel.internal/v1/traces",
      headersConfigured: true,
      timeoutMs: 2500,
      serviceName: "llmproxy-prod",
      serviceNamespace: "edge",
      deploymentEnvironment: "staging",
      captureMessageContent: true,
      captureToolContent: false,
    }, schema),
    {
      enabled: true,
      endpoint: "https://otel.internal/v1/traces",
      headersText: "",
      clearHeaders: false,
      timeoutMs: "2500",
      serviceName: "llmproxy-prod",
      serviceNamespace: "edge",
      deploymentEnvironment: "staging",
      captureMessageContent: true,
      captureToolContent: false,
    },
  );
});

test("createAiRequestMiddlewareEditorFields defaults to empty fields", () => {
  assert.deepEqual(createAiRequestMiddlewareEditorFields(), {
    id: "",
    url: "",
    smallModel: "",
    largeModel: "",
  });
});

test("createAiRequestMiddlewareEditorFields prefers loaded config values", () => {
  assert.deepEqual(createAiRequestMiddlewareEditorFields({
    id: "router-one",
    url: "https://router.example.com/route",
    models: {
      small: "gpt-4.1-mini",
      large: "gpt-5",
    },
  }), {
    id: "router-one",
    url: "https://router.example.com/route",
    smallModel: "gpt-4.1-mini",
    largeModel: "gpt-5",
  });
});

test("isDefaultBackendEditorFields matches the no-schema create defaults", () => {
  assert.equal(isDefaultBackendEditorFields(createDefaultBackendEditorFields()), true);
});

test("isDefaultBackendEditorFields detects when create fields were already edited", () => {
  const fields = createDefaultBackendEditorFields();
  fields.name = "Edited backend";

  assert.equal(isDefaultBackendEditorFields(fields), false);
});
