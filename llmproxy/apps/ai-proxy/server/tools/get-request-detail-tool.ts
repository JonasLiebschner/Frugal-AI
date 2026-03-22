import { asRequiredString } from "./tool-helpers";
import inputSchema from "./get-request-detail-tool.input.json";
import outputSchema from "./get-request-detail-tool.output.json";
import { AI_PROXY_TOOL_SERVICE_METADATA } from "./ai-proxy-tool-service";
import { getAiProxyRequestDetail } from "./internal-tool-client";
import type { AiProxyToolProvider } from "./tool-provider-types";

export const getRequestDetailToolProvider: AiProxyToolProvider = () => ({
  service: AI_PROXY_TOOL_SERVICE_METADATA,
  definition: {
    name: "get_request_detail",
    title: "Get request detail",
    description: "Fetch the stored request payload, response payload, and final metadata for one request.",
    inputSchema: inputSchema as Record<string, unknown>,
    outputSchema: outputSchema as Record<string, unknown>,
  },
  call: async (args, requestFetch) => {
    const requestId = asRequiredString(args.request_id, 'get_request_detail requires a string "request_id".');
    const detail = await getAiProxyRequestDetail(requestFetch, requestId);

    return {
      content: [
        {
          type: "text",
          text: `Loaded stored detail for request ${requestId}.`,
        },
        {
          type: "json",
          json: detail,
        },
      ],
      structuredContent: detail,
    };
  },
});
