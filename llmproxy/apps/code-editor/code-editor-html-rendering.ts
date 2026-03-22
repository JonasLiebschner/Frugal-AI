function prettyCodeJson(value: unknown): string {
  if (value === undefined) {
    return "";
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatCodeUiValue(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return prettyCodeJson(value).replace(/\s+/g, " ").trim();
}

function escapeCodeHtml(value: unknown): string {
  return formatCodeUiValue(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeRenderedCodeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function tryParseJsonString(value: unknown): unknown {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const first = trimmed[0];
  const looksLikeJson =
    first === "{" ||
    first === "[" ||
    first === '"' ||
    first === "-" ||
    (first >= "0" && first <= "9") ||
    trimmed === "true" ||
    trimmed === "false" ||
    trimmed === "null";

  if (!looksLikeJson) {
    return undefined;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

function tryParseJsonSequence(value: string): unknown[] | null {
  const blocks = value
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (blocks.length < 2) {
    return null;
  }

  const docs = [];
  for (const block of blocks) {
    const parsed = tryParseJsonString(block);
    if (parsed === undefined) {
      return null;
    }

    docs.push(parsed);
  }

  return docs;
}

function getJsonDocuments(value: unknown): unknown[] | null {
  if (value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    const sequence = tryParseJsonSequence(value);
    if (sequence) {
      return sequence;
    }

    const parsed = tryParseJsonString(value);
    return parsed === undefined ? null : [parsed];
  }

  if (typeof value === "object" || typeof value === "number" || typeof value === "boolean") {
    return [value];
  }

  return null;
}

function syntaxHighlightJson(jsonText: string): string {
  return escapeRenderedCodeHtml(jsonText).replace(
    /("(\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let className = "json-number";

      if (match[0] === '"') {
        className = match.endsWith(":") ? "json-key" : "json-string";
      } else if (match === "true" || match === "false") {
        className = "json-boolean";
      } else if (match === "null") {
        className = "json-null";
      }

      return `<span class="${className}">${match}</span>`;
    },
  );
}

function renderCodeInnerHtml(value: unknown): { html: string; isJson: boolean } {
  const docs = getJsonDocuments(value);
  if (docs) {
    return {
      html: docs.map((doc) => syntaxHighlightJson(prettyCodeJson(doc))).join("\n\n"),
      isJson: true,
    };
  }

  return {
    html: escapeCodeHtml(value ?? ""),
    isJson: false,
  };
}

export function renderCodeBlockHtml(value: unknown, baseClass = "turn-content"): string {
  const rendered = renderCodeInnerHtml(value);
  const className = rendered.isJson ? `${baseClass} json-view` : baseClass;
  return `<pre class="${escapeCodeHtml(className)}">${rendered.html}</pre>`;
}

export function renderCodeInnerBlock(value: unknown): { html: string; isJson: boolean } {
  return renderCodeInnerHtml(value);
}

export function escapeHtml(value: unknown): string {
  return escapeCodeHtml(value);
}
