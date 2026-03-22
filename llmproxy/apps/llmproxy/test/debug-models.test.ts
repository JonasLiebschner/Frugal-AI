import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDebugModelOptions,
  isValidDebugModelSelection,
} from "../llmproxy-client";

test("buildDebugModelOptions places auto, middlewares, and explicit models in stable order", () => {
  const options = buildDebugModelOptions(
    [
      { id: "gpt-4.1", ownedBy: "openai" },
      { id: "gpt-4.1-mini", ownedBy: "openai" },
    ],
    [
      { id: "router-b", url: "https://example.com/b", models: { small: "gpt-4.1-mini", large: "gpt-4.1" } },
      { id: "router-a", url: "https://example.com/a", models: { small: "gpt-4.1-mini", large: "gpt-4.1" } },
    ],
  );

  assert.deepEqual(
    options.map((entry) => ({ label: entry.label, value: entry.value, disabled: entry.disabled === true })),
    [
      { label: "auto", value: "auto", disabled: false },
      { label: "----------------", value: "__separator_middlewares__", disabled: true },
      { label: "middleware:router-a", value: "middleware:router-a", disabled: false },
      { label: "middleware:router-b", value: "middleware:router-b", disabled: false },
      { label: "----------------", value: "__separator_models__", disabled: true },
      { label: "gpt-4.1", value: "gpt-4.1", disabled: false },
      { label: "gpt-4.1-mini", value: "gpt-4.1-mini", disabled: false },
    ],
  );
});

test("isValidDebugModelSelection accepts explicit middleware selectors", () => {
  const models = [{ id: "gpt-4.1-mini", ownedBy: "openai" }];
  const middlewares = [{ id: "router-one", url: "https://example.com/route", models: { small: "gpt-4.1-mini", large: "gpt-4.1" } }];

  assert.equal(isValidDebugModelSelection("auto", models, middlewares), true);
  assert.equal(isValidDebugModelSelection("middleware:router-one", models, middlewares), true);
  assert.equal(isValidDebugModelSelection("gpt-4.1-mini", models, middlewares), true);
  assert.equal(isValidDebugModelSelection("middleware:missing", models, middlewares), false);
});
