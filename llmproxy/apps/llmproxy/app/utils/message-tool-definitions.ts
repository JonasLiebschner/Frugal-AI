import { escapeHtml } from "../../../code-editor/code-editor-client";
import {
  getJsonSchemaNotes,
  getJsonSchemaObjectShape,
  getJsonSchemaTypeLabel,
} from "../../../json-schema/json-schema-client";
import { formatUiValue } from "./formatters";
import { isClientRecord } from "./guards";

function renderParameterIconHtml(count?: number): string {
  if (typeof count === "number") {
    const countTitle = `${count} ${count === 1 ? "parameter" : "parameters"}`;
    return `<span class="tool-inline-count-icon" aria-hidden="true" title="${escapeHtml(countTitle)}">${count}</span>`;
  }

  return (
    `<span class="tool-inline-icon tool-inline-icon-parameter" aria-hidden="true">` +
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">` +
        `<path d="M9.5 6.75h8"></path>` +
        `<path d="M9.5 12h8"></path>` +
        `<path d="M9.5 17.25h5.5"></path>` +
        `<circle cx="6" cy="6.75" r="1.25"></circle>` +
        `<circle cx="6" cy="12" r="1.25"></circle>` +
        `<circle cx="6" cy="17.25" r="1.25"></circle>` +
      `</svg>` +
    `</span>`
  );
}

function renderToolTitleMarkerHtml(): string {
  return `<span class="tool-title-marker" aria-hidden="true">&lt;/&gt;</span>`;
}

function renderToolDisclosureHtml(
  label: string,
  bodyHtml: string,
  count: number,
): string {
  if (!bodyHtml) {
    return "";
  }

  return (
      `<details class="tool-disclosure">` +
      `<summary class="tool-disclosure-summary">` +
        `<span class="tool-disclosure-summary-main">` +
          renderParameterIconHtml(count) +
          `<span>${escapeHtml(label)}</span>` +
        `</span>` +
      `</summary>` +
      `<div class="tool-disclosure-body">` +
        `<div class="tool-parameter-panel">` +
          bodyHtml +
        `</div>` +
      `</div>` +
    `</details>`
  );
}

function renderToolParameterHtml(
  rootSchema: unknown,
  name: string,
  definition: unknown,
  requiredNames: Set<string>,
): string {
  const schema = isClientRecord(definition) ? definition : null;
  const typeLabel = schema ? getJsonSchemaTypeLabel(rootSchema, schema) : "value";
  const description =
    schema && typeof schema.description === "string" && schema.description.trim().length > 0
      ? schema.description.trim()
      : "";
  const notes = schema ? getJsonSchemaNotes(rootSchema, schema) : [];

  return (
    `<div class="tool-parameter-row">` +
      `<div class="tool-parameter-head">` +
        `<span class="tool-parameter-name"><span class="tool-parameter-type-label">${escapeHtml(typeLabel)}</span><span>${escapeHtml(name)}</span></span>` +
        `<span class="badge ${requiredNames.has(name) ? "good" : "neutral"}">${requiredNames.has(name) ? "required" : "optional"}</span>` +
      `</div>` +
      (description ? `<div class="tool-parameter-description">${escapeHtml(description)}</div>` : "") +
      (notes.length > 0 ? `<div class="tool-parameter-note">${escapeHtml(notes.join(" | "))}</div>` : "") +
    `</div>`
  );
}

function renderFunctionToolHtml(tool: Record<string, any>, index: number): string {
  const fn = isClientRecord(tool.function) ? tool.function : null;
  const name =
    fn && typeof fn.name === "string" && fn.name.trim().length > 0
      ? fn.name.trim()
      : `Tool ${index + 1}`;
  const description =
    fn && typeof fn.description === "string" && fn.description.trim().length > 0
      ? fn.description.trim()
      : "";
  const schema = fn && isClientRecord(fn.parameters) ? fn.parameters : null;
  const objectShape = schema ? getJsonSchemaObjectShape(schema, schema) : null;
  const properties = objectShape?.properties ?? [];
  const requiredNames = objectShape?.requiredNames ?? new Set<string>();

  const summaryBadges = [
    objectShape?.allowsAdditionalProperties !== false
      ? `<span class="badge neutral" title="${escapeHtml("Additional undeclared fields are allowed in this tool's arguments object. The model may send keys that are not listed in the declared parameter schema.")}">extra fields allowed</span>`
      : "",
    typeof fn?.strict === "boolean" ? `<span class="badge ${fn.strict ? "good" : "neutral"}">${fn.strict ? "strict" : "non-strict"}</span>` : "",
  ].filter(Boolean).join("");
  const parametersHtml = properties
    .map(([propertyName, propertyDefinition]) => renderToolParameterHtml(schema, propertyName, propertyDefinition, requiredNames))
    .join("");

  return (
    `<article class="tool-definition-card">` +
      `<div class="tool-definition-head">` +
        `<div>` +
          `<div class="tool-definition-title">${renderToolTitleMarkerHtml()}<span>${escapeHtml(name)}</span></div>` +
        `</div>` +
        (summaryBadges ? `<div class="message-meta">${summaryBadges}</div>` : "") +
      `</div>` +
      (description ? `<p class="tool-definition-description">${escapeHtml(description)}</p>` : "") +
      renderToolDisclosureHtml(
        "Parameters",
        properties.length > 0 ? `<div class="tool-parameter-list">${parametersHtml}</div>` : "",
        properties.length,
      ) +
    `</article>`
  );
}

function renderGenericToolHtml(tool: Record<string, any>, index: number): string {
  const toolType =
    typeof tool.type === "string" && tool.type.trim().length > 0
      ? tool.type.trim()
      : `tool-${index + 1}`;
  const fields = Object.entries(tool).filter(([key]) => key !== "type");
  const fieldsHtml = fields.map(([key, value]) => (
    `<div class="tool-parameter-row">` +
      `<div class="tool-parameter-head">` +
        `<span class="tool-parameter-name">${renderParameterIconHtml()}<span>${escapeHtml(key)}</span></span>` +
      `</div>` +
      `<div class="tool-parameter-description">${escapeHtml(formatUiValue(value) || "n/a")}</div>` +
    `</div>`
  )).join("");

  return (
    `<article class="tool-definition-card">` +
      `<div class="tool-definition-head">` +
        `<div>` +
          `<div class="tool-definition-title">${renderToolTitleMarkerHtml()}<span>${escapeHtml(toolType)}</span></div>` +
          `<div class="tool-definition-subtitle">Tool ${index + 1}</div>` +
        `</div>` +
        `<div class="message-meta"><span class="badge neutral">${escapeHtml(toolType)}</span></div>` +
      `</div>` +
      renderToolDisclosureHtml(
        "Parameters",
        fields.length > 0 ? `<div class="tool-parameter-list">${fieldsHtml}</div>` : "",
        fields.length,
      ) +
    `</article>`
  );
}

export function renderToolsHtml(tools: unknown): string {
  if (!Array.isArray(tools) || tools.length === 0) {
    return '<div class="empty">No tools were included in this request.</div>';
  }

  return (
    `<div class="tool-definition-list">` +
      tools.map((tool, index) => {
        if (!isClientRecord(tool)) {
          return (
            `<article class="tool-definition-card">` +
              `<div class="tool-definition-head">` +
                `<div>` +
                  `<div class="tool-definition-title">${renderToolTitleMarkerHtml()}<span>Tool ${index + 1}</span></div>` +
                  `<div class="tool-definition-subtitle">Stored tool payload</div>` +
                `</div>` +
              `</div>` +
              `<div class="tool-parameter-description">${escapeHtml(formatUiValue(tool) || "No readable tool payload was stored.")}</div>` +
            `</article>`
          );
        }

        if (tool.type === "function" && isClientRecord(tool.function)) {
          return renderFunctionToolHtml(tool, index);
        }

        return renderGenericToolHtml(tool, index);
      }).join("") +
    `</div>`
  );
}
