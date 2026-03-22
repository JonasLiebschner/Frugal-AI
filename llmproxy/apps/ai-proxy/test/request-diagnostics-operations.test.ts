import assert from "node:assert/strict";
import test from "node:test";
import { getDiagnosticsReport } from "../server/ai-proxy-diagnostics";

test("getDiagnosticsReport returns undefined when the request detail is missing", () => {
  assert.equal(
    getDiagnosticsReport(
      {
        getSnapshot: () => ({
          startedAt: "2026-03-16T00:00:00.000Z",
          queueDepth: 0,
          recentRequestLimit: 1000,
          totals: {
            activeRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            cancelledRequests: 0,
            rejectedRequests: 0,
          },
          backends: [],
          activeConnections: [],
          recentRequests: [],
        }),
        getRequestDetail: () => undefined,
      },
      "missing",
    ),
    undefined,
  );
});
