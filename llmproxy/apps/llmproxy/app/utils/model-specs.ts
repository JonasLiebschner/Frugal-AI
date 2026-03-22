import type { JsonValue, ModelDetailField, ModelDetailSection, ModelDetailView, ModelSpec } from "../types/dashboard";
import { formatDate } from "./formatters";
import { isClientRecord } from "./guards";

type MetadataRecord = Record<string, unknown>;

const FIELD_LABELS: Record<string, string> = {
  owned_by: "Owner",
  created: "Created",
  modified_at: "Modified",
  aliases: "Aliases",
  tags: "Tags",
  capabilities: "Capabilities",
  description: "Description",
  type: "Type",
  object: "Object",
  parameters: "Parameters",
  size: "Size",
  digest: "Digest",
  details: "Details",
  meta: "Meta",
  format: "Format",
  quantization: "Quantization",
  family: "Family",
  basename: "Base Name",
  n_ctx_train: "Training Context",
  n_params: "Parameters",
  n_vocab: "Vocabulary",
  name: "Name",
  model: "Model",
};

function matchesModelPattern(pattern: string, value: string): boolean {
  if (pattern === "*") {
    return true;
  }

  if (pattern.includes("*")) {
    const escaped = pattern
      .replaceAll("\\", "\\\\")
      .replaceAll(".", "\\.")
      .replaceAll("+", "\\+")
      .replaceAll("?", "\\?")
      .replaceAll("^", "\\^")
      .replaceAll("$", "\\$")
      .replaceAll("(", "\\(")
      .replaceAll(")", "\\)")
      .replaceAll("{", "\\{")
      .replaceAll("}", "\\}")
      .replaceAll("|", "\\|")
      .replaceAll("[", "\\[")
      .replaceAll("]", "\\]")
      .replaceAll("*", ".*");
    return new RegExp(`^${escaped}$`).test(value);
  }

  return pattern === value;
}

function uniqueStrings(values: unknown): string[] {
  return [...new Set((Array.isArray(values) ? values : []).filter((value) => typeof value === "string" && value.length > 0))];
}

function humanizeLabel(key: string): string {
  if (FIELD_LABELS[key]) {
    return FIELD_LABELS[key];
  }

  const normalized = key
    .split(".")
    .at(-1)
    ?.replaceAll("_", " ")
    .replaceAll("-", " ")
    ?? key;

  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatMetadataScalar(key: string, value: unknown): string {
  if (typeof value === "number") {
    if (key === "created" && value >= 1_000_000_000 && value < 10_000_000_000) {
      try {
        return formatDate(new Date(value * 1000).toISOString());
      } catch {
        return new Intl.NumberFormat("en-US").format(value);
      }
    }

    return new Intl.NumberFormat("en-US").format(value);
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  return String(value);
}

function formatMetadataValue(key: string, value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map((entry) => (
        typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean"
          ? formatMetadataScalar(key, entry)
          : ""
      ))
      .filter(Boolean)
      .join(", ");
  }

  if (isClientRecord(value)) {
    const items = Object.entries(value)
      .map(([childKey, childValue]) => `${humanizeLabel(childKey)}: ${formatMetadataValue(childKey, childValue)}`)
      .filter((entry) => !entry.endsWith(": "));
    return items.join(" · ");
  }

  return formatMetadataScalar(key, value);
}

function buildDiscoveredModelDetailMap(discoveredModelDetails: unknown): Map<string, { id: string; metadata?: JsonValue }> {
  const entries = Array.isArray(discoveredModelDetails) ? discoveredModelDetails : [];
  const map = new Map<string, { id: string; metadata?: JsonValue }>();

  for (const entry of entries) {
    if (!isClientRecord(entry) || typeof entry.id !== "string" || entry.id.length === 0) {
      continue;
    }

    map.set(entry.id, {
      id: entry.id,
      metadata: entry.metadata as JsonValue | undefined,
    });
  }

  return map;
}

function pushField(fields: ModelDetailField[], key: string, value: unknown): void {
  if (value === undefined || value === null || value === "") {
    return;
  }

  const formatted = formatMetadataValue(key, value);
  if (!formatted) {
    return;
  }

  fields.push({
    label: humanizeLabel(key),
    value: formatted,
  });
}

function collectResidualFields(
  sectionTitle: string,
  value: unknown,
  pathPrefix = "",
): ModelDetailSection | null {
  if (!isClientRecord(value)) {
    return null;
  }

  const fields: ModelDetailField[] = [];
  for (const [key, childValue] of Object.entries(value)) {
    const nextPath = pathPrefix ? `${pathPrefix}.${key}` : key;
    if (isClientRecord(childValue)) {
      const nested = collectResidualFields(sectionTitle, childValue, nextPath);
      if (nested) {
        fields.push(...nested.fields);
      }
      continue;
    }

    pushField(fields, nextPath, childValue);
  }

  if (fields.length === 0) {
    return null;
  }

  return {
    title: sectionTitle,
    fields,
  };
}

function buildModelDetailView(
  model: string,
  metadata: JsonValue | undefined,
  routeSummary: string,
): ModelDetailView | undefined {
  if (!isClientRecord(metadata)) {
    return undefined;
  }

  const metadataRecord = metadata as MetadataRecord;

  const summary: ModelDetailField[] = [
    { label: "Model", value: model },
    { label: "Routing", value: routeSummary },
  ];
  pushField(summary, "owned_by", metadataRecord.owned_by);
  pushField(summary, "created", metadataRecord.created);

  const sections: ModelDetailSection[] = [];

  const identityFields: ModelDetailField[] = [];
  pushField(identityFields, "aliases", metadataRecord.aliases);
  pushField(identityFields, "tags", metadataRecord.tags);
  pushField(identityFields, "description", metadataRecord.description);
  pushField(identityFields, "type", metadataRecord.type);
  pushField(identityFields, "object", metadataRecord.object);
  if (identityFields.length > 0) {
    sections.push({ title: "Identity", fields: identityFields });
  }

  const capabilityFields: ModelDetailField[] = [];
  pushField(capabilityFields, "capabilities", metadataRecord.capabilities);
  pushField(capabilityFields, "parameters", metadataRecord.parameters);
  if (capabilityFields.length > 0) {
    sections.push({ title: "Capabilities", fields: capabilityFields });
  }

  const detailsFields: ModelDetailField[] = [];
  if (isClientRecord(metadataRecord.details)) {
    for (const [key, value] of Object.entries(metadataRecord.details)) {
      pushField(detailsFields, key, value);
    }
  }
  if (detailsFields.length > 0) {
    sections.push({ title: "Details", fields: detailsFields });
  }

  const metaFields: ModelDetailField[] = [];
  if (isClientRecord(metadataRecord.meta)) {
    for (const [key, value] of Object.entries(metadataRecord.meta)) {
      pushField(metaFields, key, value);
    }
  }
  if (metaFields.length > 0) {
    sections.push({ title: "Capacity", fields: metaFields });
  }

  const residualMetadata: MetadataRecord = {};
  for (const [key, value] of Object.entries(metadataRecord)) {
    if (["id", "owned_by", "created", "aliases", "tags", "description", "type", "object", "capabilities", "parameters", "details", "meta"].includes(key)) {
      continue;
    }

    residualMetadata[key] = value;
  }

  const residualSection = collectResidualFields("Additional Metadata", residualMetadata);
  if (residualSection) {
    sections.push(residualSection);
  }

  return {
    title: model,
    subtitle: routeSummary,
    summary,
    sections,
    rawMetadata: metadataRecord as JsonValue,
  };
}

export function buildModelSpecs(
  configuredModels: unknown,
  discoveredModels: unknown,
  discoveredModelDetails: unknown,
): ModelSpec[] {
  const configured = uniqueStrings(configuredModels);
  const discovered = uniqueStrings(discoveredModels);
  const discoveredDetailMap = buildDiscoveredModelDetailMap(discoveredModelDetails);
  const explicitConfigured = configured.filter((pattern) => pattern !== "*");
  const hasWildcard = configured.includes("*");
  const specs: ModelSpec[] = [];

  if (discovered.length > 0) {
    for (const model of discovered) {
      const allowed = configured.length === 0 || configured.some((pattern) => matchesModelPattern(pattern, model));
      let routeSummary = "Discovered from /v1/models.";
      const metadata = discoveredDetailMap.get(model)?.metadata;

      if (allowed) {
        if (configured.length === 0) {
          routeSummary = "Routable because no explicit model allowlist is configured.";
        } else if (hasWildcard) {
          routeSummary = 'Routable because this backend whitelist includes "*".';
        } else {
          routeSummary = "Routable because this model matches the backend whitelist.";
        }
      } else {
        routeSummary = "Discovered, but not routable here because it is not whitelisted.";
      }

      specs.push({
        text: model,
        className: `chip ${allowed ? "good" : "bad"}`,
        detail: buildModelDetailView(model, metadata, routeSummary),
      });
    }

    for (const model of explicitConfigured) {
      if (discovered.includes(model)) {
        continue;
      }

      specs.push({
        text: model,
        className: "chip good",
      });
    }

    return specs;
  }

  for (const model of explicitConfigured) {
    specs.push({
      text: model,
      className: "chip good",
    });
  }

  const anyAllowed = hasWildcard || configured.length === 0;
  specs.push({
    text: "any",
    className: `chip ${anyAllowed ? "good" : "bad"}`,
  });

  return specs;
}
