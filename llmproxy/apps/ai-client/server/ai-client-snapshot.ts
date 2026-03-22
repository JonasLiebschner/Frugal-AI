import { type KnownModel, type ProxySnapshot, type RequestLogEntry } from "../../shared/type-api";
import { toAiClientBackendRuntimeSnapshot, type AiClientBackendRuntime } from "./ai-client-backend-runtime";
import { listConcreteKnownModels } from "./ai-client-model-selection";

interface BuildAiClientSnapshotOptions {
  startedAt: string;
  recentRequestLimit: number;
  queueDepth: number;
  rejectedRequests: number;
  backends: AiClientBackendRuntime[];
  recentRequests: RequestLogEntry[];
}

export function buildAiClientSnapshot(options: BuildAiClientSnapshotOptions): ProxySnapshot {
  const { startedAt, recentRequestLimit, queueDepth, rejectedRequests, backends, recentRequests } = options;
  const runtimeSnapshots = backends.map((backend) => toAiClientBackendRuntimeSnapshot(backend));

  return {
    startedAt,
    queueDepth,
    recentRequestLimit,
    totals: {
      activeRequests: runtimeSnapshots.reduce((sum, backend) => sum + backend.activeRequests, 0),
      successfulRequests: runtimeSnapshots.reduce((sum, backend) => sum + backend.successfulRequests, 0),
      failedRequests: runtimeSnapshots.reduce((sum, backend) => sum + backend.failedRequests, 0),
      cancelledRequests: runtimeSnapshots.reduce((sum, backend) => sum + backend.cancelledRequests, 0),
      rejectedRequests,
    },
    backends: runtimeSnapshots,
    activeConnections: [],
    recentRequests,
  };
}

export function listAiClientKnownModels(backends: AiClientBackendRuntime[]): KnownModel[] {
  const models = new Map<string, KnownModel>();

  for (const backend of backends) {
    for (const model of listConcreteKnownModels(backend)) {
      if (models.has(model.id)) {
        continue;
      }

      models.set(model.id, {
        id: model.id,
        backendId: backend.config.id,
        ownedBy: backend.config.name,
        source: model.source,
      });
    }
  }

  return Array.from(models.values()).sort((left, right) => left.id.localeCompare(right.id));
}
