import type { RequestFetch } from "../../../shared/server/request-fetch";
import {
  aiProxyInternalRequestsPath,
  buildAiProxyInternalRequestDiagnosticsPath,
  buildAiProxyInternalRequestPath,
} from "../ai-proxy-capability";

interface InternalRequestListPayload {
  requests: Array<Record<string, unknown>>;
}

interface InternalRequestDetailPayload {
  detail: Record<string, unknown>;
}

interface InternalRequestDiagnosticsPayload {
  report: Record<string, unknown>;
}

export async function listAiProxyRequests(
  requestFetch: RequestFetch,
  input: {
    limit: number;
    includeLive: boolean;
    onlyWithDetail: boolean;
  },
): Promise<Array<Record<string, unknown>>> {
  const payload = await requestFetch<InternalRequestListPayload>(
    aiProxyInternalRequestsPath,
    {
      query: {
        limit: input.limit,
        include_live: input.includeLive,
        only_with_detail: input.onlyWithDetail,
      },
    },
  );

  return payload.requests;
}

export async function getAiProxyRequestDetail(
  requestFetch: RequestFetch,
  requestId: string,
): Promise<Record<string, unknown>> {
  const payload = await requestFetch<InternalRequestDetailPayload>(
    buildAiProxyInternalRequestPath(requestId),
  );

  return payload.detail;
}

export async function getAiProxyRequestDiagnostics(
  requestFetch: RequestFetch,
  requestId: string,
): Promise<Record<string, unknown>> {
  const payload = await requestFetch<InternalRequestDiagnosticsPayload>(
    buildAiProxyInternalRequestDiagnosticsPath(requestId),
  );

  return payload.report;
}
