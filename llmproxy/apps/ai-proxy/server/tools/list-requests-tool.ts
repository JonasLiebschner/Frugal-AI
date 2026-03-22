import { coerceInteger } from "./tool-helpers";
import inputSchema from "./list-requests-tool.input.json";
import outputSchema from "./list-requests-tool.output.json";
import { AI_PROXY_TOOL_SERVICE_METADATA } from "./ai-proxy-tool-service";
import { listAiProxyRequests } from "./internal-tool-client";
import type { AiProxyToolProvider } from "./tool-provider-types";

export const listRequestsToolProvider: AiProxyToolProvider = () => ({
  service: AI_PROXY_TOOL_SERVICE_METADATA,
  definition: {
    name: "list_requests",
    title: "List requests",
    description: "List recent or live AI proxy requests so an LLM can pick a request to inspect next.",
    inputSchema: inputSchema as Record<string, unknown>,
    outputSchema: outputSchema as Record<string, unknown>,
  },
  call: async (args, requestFetch) => {
    const limit = coerceInteger(args.limit, 20, 1, 100);
    const includeLive = args.include_live !== false;
    const onlyWithDetail = args.only_with_detail !== false;
    const requests = await listAiProxyRequests(requestFetch, {
      limit,
      includeLive,
      onlyWithDetail,
    });

    return {
      content: [
        {
          type: "text",
          text: requests.length > 0
            ? `Returned ${requests.length} request summaries from AI proxy diagnostics.`
            : "No matching requests with stored detail are currently available.",
        },
        {
          type: "json",
          json: {
            requests,
          },
        },
      ],
      structuredContent: {
        requests,
      },
    };
  },
});
