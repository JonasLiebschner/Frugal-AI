import type { RequestCatalogRow } from "./request-catalog";

function buildNamedOptions(
  entries: RequestCatalogRow[],
  allLabel: string,
  valueSelector: (entry: RequestCatalogRow) => string | undefined,
): Array<{ value: string; label: string }> {
  const names = Array.from(
    new Set(
      entries
        .map((entry) => valueSelector(entry))
        .filter((value): value is string => Boolean(value)),
    ),
  ).sort((left, right) => left.localeCompare(right));

  return [
    { value: "all", label: allLabel },
    ...names.map((name) => ({ value: name, label: name })),
  ];
}

export function buildOutcomeOptions(entries: RequestCatalogRow[]): Array<{ value: string; label: string }> {
  const options = [{ value: "all", label: "All" }];
  const liveOutcomes = Array.from(
    new Set(
      entries
        .filter((entry) => entry.live)
        .map((entry) => entry.outcome),
    ),
  );

  if (liveOutcomes.includes("queued")) {
    options.push({ value: "queued", label: "Queued" });
  }

  if (liveOutcomes.includes("connected")) {
    options.push({ value: "connected", label: "Connected" });
  }

  if (liveOutcomes.includes("streaming")) {
    options.push({ value: "streaming", label: "Streaming" });
  }

  options.push({ value: "success", label: "Successful" });

  options.push(
    { value: "error", label: "Failed" },
    { value: "cancelled", label: "Cancelled" },
    { value: "rejected", label: "Rejected" },
    { value: "queued_timeout", label: "Queue timeout" },
  );

  return options;
}

export function buildFinishReasonOptions(entries: RequestCatalogRow[]): Array<{ value: string; label: string }> {
  const finishReasons = Array.from(
    new Set(
      entries
        .map((entry) => entry.finishReason)
        .filter((value): value is string => Boolean(value && value.trim().length > 0)),
    ),
  ).sort((left, right) => left.localeCompare(right));

  return [
    { value: "all", label: "All finish reasons" },
    { value: "none", label: "None" },
    ...finishReasons.map((finishReason) => ({ value: finishReason, label: finishReason })),
  ];
}

export function buildModelOptions(entries: RequestCatalogRow[]): Array<{ value: string; label: string }> {
  return buildNamedOptions(entries, "All models", (entry) => entry.model);
}

export function buildMiddlewareOptions(entries: RequestCatalogRow[]): Array<{ value: string; label: string }> {
  return buildNamedOptions(entries, "All middlewares", (entry) => entry.routingMiddlewareId);
}

export function buildRoutingOptions(entries: RequestCatalogRow[]): Array<{ value: string; label: string }> {
  return buildNamedOptions(entries, "All routing outcomes", (entry) => entry.routingMiddlewareProfile);
}

export function buildBackendOptions(entries: RequestCatalogRow[]): Array<{ value: string; label: string }> {
  return buildNamedOptions(entries, "All backends", (entry) => entry.backendName);
}
