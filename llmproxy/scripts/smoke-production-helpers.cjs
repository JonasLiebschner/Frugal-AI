const http = require("node:http");
const fs = require("node:fs/promises");
const { setTimeout: delay } = require("node:timers/promises");

const MCP_PROTOCOL_VERSION = "2025-11-25";

async function getFreePort() {
  return await new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : undefined;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        if (typeof port !== "number") {
          reject(new Error("Could not determine a free port for the production smoke test."));
          return;
        }

        resolve(port);
      });
    });
  });
}

function toDebugOutput(stdout, stderr) {
  return [
    "",
    "STDOUT:",
    stdout || "<empty>",
    "",
    "STDERR:",
    stderr || "<empty>",
  ].join("\n");
}

async function waitForServer(baseUrl, stdoutRef, stderrRef) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/healthz`);
      if (response.ok) {
        return;
      }
    } catch {
      // Wait until the server is listening.
    }

    await delay(250);
  }

  throw new Error(`Production server did not become ready.${toDebugOutput(stdoutRef(), stderrRef())}`);
}

async function expectHtml(baseUrl, pathname, stdoutRef, stderrRef) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    headers: {
      accept: "text/html",
    },
  });
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`${pathname} returned ${response.status}.${toDebugOutput(stdoutRef(), stderrRef())}\n\n${body}`);
  }

  if (!response.headers.get("content-type")?.includes("text/html")) {
    throw new Error(`${pathname} did not return HTML.`);
  }

  if (!body.includes("__NUXT_DATA__")) {
    throw new Error(`${pathname} did not include the Nuxt payload bootstrap.`);
  }
}

async function expectJson(baseUrl, pathname, validate, stdoutRef, stderrRef) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    headers: {
      accept: "application/json",
    },
  });
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`${pathname} returned ${response.status}.${toDebugOutput(stdoutRef(), stderrRef())}\n\n${body}`);
  }

  let payload;
  try {
    payload = JSON.parse(body);
  } catch (error) {
    throw new Error(`${pathname} did not return valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  validate(payload);
  return payload;
}

async function expectErrorJson(baseUrl, pathname, expectedStatus, validate, stdoutRef, stderrRef) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    headers: {
      accept: "application/json",
    },
  });
  const body = await response.text();

  if (response.status !== expectedStatus) {
    throw new Error(
      `${pathname} returned ${response.status} instead of ${expectedStatus}.${toDebugOutput(stdoutRef(), stderrRef())}\n\n${body}`,
    );
  }

  let payload;
  try {
    payload = JSON.parse(body);
  } catch (error) {
    throw new Error(`${pathname} did not return valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  validate(payload);
  return payload;
}

async function expectSse(baseUrl, pathname, validate, stdoutRef, stderrRef) {
  const controller = new AbortController();
  const response = await fetch(`${baseUrl}${pathname}`, {
    headers: {
      accept: "text/event-stream",
    },
    signal: controller.signal,
  });

  try {
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`${pathname} returned ${response.status}.${toDebugOutput(stdoutRef(), stderrRef())}\n\n${body}`);
    }

    if (!response.headers.get("content-type")?.includes("text/event-stream")) {
      throw new Error(`${pathname} did not return an SSE content type.`);
    }

    await validate(response);
  } finally {
    controller.abort();
    await response.body?.cancel().catch(() => undefined);
  }
}

async function sendJson(baseUrl, pathname, method, body, validate, stdoutRef, stderrRef) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const responseBody = await response.text();

  if (!response.ok) {
    throw new Error(
      `${method} ${pathname} returned ${response.status}.${toDebugOutput(stdoutRef(), stderrRef())}\n\n${responseBody}`,
    );
  }

  let payload;
  try {
    payload = JSON.parse(responseBody);
  } catch (error) {
    throw new Error(
      `${method} ${pathname} did not return valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  validate(payload);
  return payload;
}

async function expectFileJson(filePath) {
  const content = await fs.readFile(filePath, "utf8");
  return JSON.parse(content);
}

function buildMcpHeaders(session) {
  return {
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
    ...(session ? {
      "mcp-session-id": session.id,
      "mcp-protocol-version": session.protocolVersion,
    } : {}),
  };
}

async function createMcpSession(baseUrl, stdoutRef, stderrRef) {
  const initializeResponse = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: buildMcpHeaders(),
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "smoke-initialize",
      method: "initialize",
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        clientInfo: {
          name: "llmproxy-production-smoke",
          version: "1.0.0",
        },
      },
    }),
  });
  const initializeBody = await initializeResponse.text();

  if (!initializeResponse.ok) {
    throw new Error(`/mcp initialize returned ${initializeResponse.status}.${toDebugOutput(stdoutRef(), stderrRef())}\n\n${initializeBody}`);
  }

  const sessionId = initializeResponse.headers.get("mcp-session-id");
  const protocolVersion = initializeResponse.headers.get("mcp-protocol-version") || MCP_PROTOCOL_VERSION;

  if (!sessionId) {
    throw new Error("/mcp initialize did not return an MCP session id.");
  }

  const initializedResponse = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: buildMcpHeaders({
      id: sessionId,
      protocolVersion,
    }),
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    }),
  });
  const initializedBody = await initializedResponse.text();

  if (initializedResponse.status !== 202) {
    throw new Error(
      `/mcp notifications/initialized returned ${initializedResponse.status}.${toDebugOutput(stdoutRef(), stderrRef())}\n\n${initializedBody}`,
    );
  }

  return {
    id: sessionId,
    protocolVersion,
  };
}

async function sendMcpRequest(baseUrl, session, payload, stdoutRef, stderrRef) {
  const response = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: buildMcpHeaders(session),
    body: JSON.stringify(payload),
  });
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`/mcp ${payload.method} returned ${response.status}.${toDebugOutput(stdoutRef(), stderrRef())}\n\n${body}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    throw new Error(`/mcp ${payload.method} did not return valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (parsed?.error?.message) {
    throw new Error(`/mcp ${payload.method} returned an MCP error: ${parsed.error.message}`);
  }

  return parsed.result;
}

module.exports = {
  MCP_PROTOCOL_VERSION,
  createMcpSession,
  expectErrorJson,
  expectFileJson,
  expectHtml,
  expectJson,
  expectSse,
  getFreePort,
  sendJson,
  sendMcpRequest,
  toDebugOutput,
  waitForServer,
};
