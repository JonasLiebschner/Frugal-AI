import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createConfigTestService } from "../../config/test/runtime-api";
import configSchema from "../config.schema.json";
import { createAiRequestMiddlewareConfigService } from "../server/ai-request-middleware-capability";

test("ai-request-middleware config defaults to an empty middleware list", async () => {
  const service = createAiRequestMiddlewareConfigService({
    config: createConfigTestService({
      schemas: {
        "ai-request-middleware": configSchema,
      },
    }),
  });

  const config = await service.load();
  assert.deepEqual(config, {
    middlewares: [],
  });
});

test("ai-request-middleware config rejects duplicate ids", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ai-request-middleware-config-"));
  const configPath = path.join(tempDir, "config.json");

  try {
    await writeFile(configPath, `${JSON.stringify({
      middlewares: [
        {
          id: "router-one",
          url: "https://router.example.com/route",
          models: {
            small: "gpt-4.1-mini",
            large: "gpt-5",
          },
        },
        {
          id: "router-one",
          url: "https://router.example.com/route-two",
          models: {
            small: "gpt-4.1-mini",
            large: "gpt-5",
          },
        },
      ],
    }, null, 2)}\n`, "utf8");

    const service = createAiRequestMiddlewareConfigService({
      config: createConfigTestService({
        configFilePaths: {
          "ai-request-middleware": configPath,
        },
        schemas: {
          "ai-request-middleware": configSchema,
        },
      }),
    });

    await assert.rejects(
      async () => await service.load(),
      /Duplicate ai-request-middleware id "router-one"/u,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("ai-request-middleware config rejects invalid urls", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ai-request-middleware-config-url-"));
  const configPath = path.join(tempDir, "config.json");

  try {
    await writeFile(configPath, `${JSON.stringify({
      middlewares: [
        {
          id: "router-one",
          url: "not-a-url",
          models: {
            small: "gpt-4.1-mini",
            large: "gpt-5",
          },
        },
      ],
    }, null, 2)}\n`, "utf8");

    const service = createAiRequestMiddlewareConfigService({
      config: createConfigTestService({
        configFilePaths: {
          "ai-request-middleware": configPath,
        },
        schemas: {
          "ai-request-middleware": configSchema,
        },
      }),
    });

    await assert.rejects(
      async () => await service.load(),
      /requires a valid http\(s\) url/u,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("ai-request-middleware config service creates, replaces, and deletes middlewares", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ai-request-middleware-config-crud-"));
  const configPath = path.join(tempDir, "config.json");

  try {
    const service = createAiRequestMiddlewareConfigService({
      config: createConfigTestService({
        configFilePaths: {
          "ai-request-middleware": configPath,
        },
        schemas: {
          "ai-request-middleware": configSchema,
        },
      }),
    });

    const created = await service.createMiddleware({
      id: "router-one",
      url: "https://router.example.com/route",
      models: {
        small: "gpt-4.1-mini",
        large: "gpt-5",
      },
    });
    assert.deepEqual(created, {
      id: "router-one",
      url: "https://router.example.com/route",
      models: {
        small: "gpt-4.1-mini",
        large: "gpt-5",
      },
    });

    const replaced = await service.replaceMiddleware("router-one", {
      id: "router-two",
      url: "https://router.example.com/route-two",
      models: {
        small: "gpt-4.1-nano",
        large: "gpt-5-mini",
      },
    });
    assert.deepEqual(replaced, {
      id: "router-two",
      url: "https://router.example.com/route-two",
      models: {
        small: "gpt-4.1-nano",
        large: "gpt-5-mini",
      },
    });

    const listed = await service.listEditableMiddlewares();
    assert.deepEqual(listed, [{
      id: "router-two",
      url: "https://router.example.com/route-two",
      models: {
        small: "gpt-4.1-nano",
        large: "gpt-5-mini",
      },
    }]);

    await service.deleteMiddleware("router-two");

    const config = await service.load();
    assert.deepEqual(config, {
      middlewares: [],
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
