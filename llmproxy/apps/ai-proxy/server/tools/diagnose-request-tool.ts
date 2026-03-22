import { asRequiredString } from "./tool-helpers";
import inputSchema from "./diagnose-request-tool.input.json";
import outputSchema from "./diagnose-request-tool.output.json";
import { AI_PROXY_TOOL_SERVICE_METADATA } from "./ai-proxy-tool-service";
import { getAiProxyRequestDiagnostics } from "./internal-tool-client";
import type { AiProxyToolProvider } from "./tool-provider-types";

export const diagnoseRequestToolProvider: AiProxyToolProvider = () => ({
  service: AI_PROXY_TOOL_SERVICE_METADATA,
  definition: {
    name: "diagnose_request",
    title: "Diagnose request",
    description: "Run the AI proxy's built-in heuristics for one request and return findings plus troubleshooting guidance.",
    inputSchema: inputSchema as Record<string, unknown>,
    outputSchema: outputSchema as Record<string, unknown>,
  },
  call: async (args, requestFetch) => {
    const requestId = asRequiredString(args.request_id, 'diagnose_request requires a string "request_id".');
    const report = await getAiProxyRequestDiagnostics(requestFetch, requestId);
    return {
      content: [
        {
          type: "text",
          text: typeof report.summary === "string"
            ? report.summary
            : "Loaded diagnostics report for the requested AI proxy request.",
        },
        {
          type: "json",
          json: report,
        },
      ],
      structuredContent: report,
    };
  },
});
