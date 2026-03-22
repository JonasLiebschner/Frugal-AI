import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveDashboardPage,
  resolveDashboardPagePath,
} from "../llmproxy-client";
import { resolveDashboardConfigTabPath } from "../llmproxy-client";

test("resolveDashboardPagePath returns stable dashboard page paths", () => {
  assert.equal(resolveDashboardPagePath("overview"), "/dashboard");
  assert.equal(resolveDashboardPagePath("logs"), "/dashboard/logs");
  assert.equal(resolveDashboardPagePath("playground"), "/dashboard/playground");
  assert.equal(resolveDashboardPagePath("config"), "/dashboard/config");
});

test("resolveDashboardPage recognizes logs route paths used by summary drilldowns", () => {
  assert.equal(resolveDashboardPage("/dashboard/logs", true), "logs");
});

test("resolveDashboardPage recognizes nested config routes", () => {
  assert.equal(resolveDashboardPage("/dashboard/config/connections", true), "config");
  assert.equal(resolveDashboardPage("/dashboard/config/openai", true), "config");
  assert.equal(resolveDashboardPage("/dashboard/config/mcp", true), "config");
});

test("resolveDashboardConfigTabPath returns stable config tab routes", () => {
  assert.equal(resolveDashboardConfigTabPath("general"), "/dashboard/config");
  assert.equal(resolveDashboardConfigTabPath("connections"), "/dashboard/config/connections");
  assert.equal(resolveDashboardConfigTabPath("openai"), "/dashboard/config/openai");
  assert.equal(resolveDashboardConfigTabPath("mcp"), "/dashboard/config/mcp");
});
