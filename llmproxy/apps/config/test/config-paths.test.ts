import assert from "node:assert/strict";
import test from "node:test";

import { getDefaultManagedConfigPath, getManagedConfigPath } from "../config-client";

test("config path helpers derive managed config locations from the app package name", () => {
  assert.equal(getManagedConfigPath("ai-client"), "DATA_DIR/config/ai-client/config.json");
  assert.equal(getDefaultManagedConfigPath("ai-client"), ".data/config/ai-client/config.json");
  assert.equal(getManagedConfigPath("mcp-client"), "DATA_DIR/config/mcp-client/config.json");
});
