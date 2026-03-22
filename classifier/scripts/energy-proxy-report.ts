import { isAbsolute, resolve } from "node:path";

interface ComparisonSummary {
  name: string;
  kind: "direct" | "middleware";
  accuracy: number;
  correct: number;
  total: number;
  totalCompletionTokens?: number;
  totalReasoningTokensKnown?: number;
  totalAnswerTokensKnown?: number;
  totalDurationMs?: number;
  averageDurationMs?: number;
  routedModels?: Record<string, number>;
  agreesWithSmall?: number;
  agreesWithLarge?: number;
}

interface ComparisonReport {
  generatedAt: string;
  endpoint: string;
  dataset: string;
  rowsEvaluated: number;
  smallModel: string;
  largeModel: string;
  middlewareModels: string[];
  summaries: ComparisonSummary[];
}

interface EnergyConfig {
  tokenUnitWeight: number;
  durationMsUnitWeight: number;
  modelFactors: Record<string, number>;
  middlewareMultipliers: Record<string, number>;
}

interface EnergyRow {
  entity: string;
  kind: "direct" | "middleware";
  rowIndex: number;
  selectedModel: string;
  answer: string | null;
  correct: boolean;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs: number;
  loadUnits: number;
  modelFactor: number;
  middlewareMultiplier: number;
  proxyEnergy: number;
}

interface EnergySummary {
  entity: string;
  kind: "direct" | "middleware";
  rows: number;
  correct: number;
  accuracy: number;
  selectedModels: Record<string, number>;
  totalLoadUnits: number;
  totalProxyEnergy: number;
  proxyEnergyPerRow: number;
  proxyEnergyPerCorrect: number | null;
}

interface MiddlewareSummaryRow {
  comparison: ComparisonSummary;
  energy: EnergySummary;
}

const DEFAULT_COMPARISON_JSON = resolve(process.cwd(), "../tmp/highscattered_first30_comparison.json");
const DEFAULT_COMBINED_CSV = resolve(process.cwd(), "../tmp/highscattered_first30_all_results.csv");
const DEFAULT_OUTPUT_DIR = resolve(process.cwd(), "../tmp");

function resolveCliPath(path: string): string {
  return isAbsolute(path) ? path : resolve(process.cwd(), path);
}

function parseArgs(argv: string[]) {
  let comparisonJson = DEFAULT_COMPARISON_JSON;
  let combinedCsv = DEFAULT_COMBINED_CSV;
  let outputDir = DEFAULT_OUTPUT_DIR;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--comparison-json") {
      comparisonJson = resolveCliPath(argv[++i]!);
      continue;
    }
    if (arg === "--combined-csv") {
      combinedCsv = resolveCliPath(argv[++i]!);
      continue;
    }
    if (arg === "--output-dir") {
      outputDir = resolveCliPath(argv[++i]!);
      continue;
    }
    if (arg === "--help") {
      console.log(`Usage:
  bun run scripts/energy-proxy-report.ts [options]

Options:
  --comparison-json <path>  default: ../tmp/highscattered_first30_comparison.json
  --combined-csv <path>     default: ../tmp/highscattered_first30_all_results.csv
  --output-dir <path>       default: ../tmp
`);
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { comparisonJson, combinedCsv, outputDir };
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let currentField = "";
  let currentRow: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    const next = text[i + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        currentField += "\"";
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentField);
      currentField = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        i++;
      }
      currentRow.push(currentField);
      currentField = "";
      if (currentRow.length > 1 || currentRow[0] !== "") {
        rows.push(currentRow);
      }
      currentRow = [];
      continue;
    }

    currentField += char;
  }

  currentRow.push(currentField);
  if (currentRow.length > 1 || currentRow[0] !== "") {
    rows.push(currentRow);
  }

  return rows;
}

function toNumber(value: string | undefined): number {
  if (!value) {
    return 0;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toBool(value: string | undefined): boolean {
  return value?.toLowerCase() === "true";
}

function toMaybeString(value: string | undefined): string | null {
  return value && value.length > 0 ? value : null;
}

function escapeCsv(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

function buildDefaultConfig(report: ComparisonReport): EnergyConfig {
  return {
    tokenUnitWeight: 1,
    durationMsUnitWeight: 0.001,
    modelFactors: {
      [report.smallModel]: 1,
      [report.largeModel]: 3,
    },
    middlewareMultipliers: {
      direct: 1,
      "middleware:simple": 1,
      "middleware:onnx": 1.2,
      "middleware:llm": 1.1,
    },
  };
}

async function loadConfig(configPath: string, report: ComparisonReport): Promise<EnergyConfig> {
  const file = Bun.file(configPath);
  if (!(await file.exists())) {
    const config = buildDefaultConfig(report);
    await Bun.write(configPath, JSON.stringify(config, null, 2));
    return config;
  }

  return JSON.parse(await file.text()) as EnergyConfig;
}

function calcLoadUnits(totalTokens: number, durationMs: number, config: EnergyConfig): number {
  return totalTokens * config.tokenUnitWeight + durationMs * config.durationMsUnitWeight;
}

function getEntityNames(report: ComparisonReport): string[] {
  return [report.smallModel, report.largeModel, ...report.middlewareModels];
}

function buildEnergyRows(report: ComparisonReport, csvRows: string[][], config: EnergyConfig): EnergyRow[] {
  const header = csvRows[0]!;
  const records = csvRows.slice(1);
  const entities = getEntityNames(report);
  const energyRows: EnergyRow[] = [];

  for (const row of records) {
    const record = Object.fromEntries(header.map((key, index) => [key, row[index] ?? ""]));
    const rowIndex = Number.parseInt(record["row_index"] ?? "0", 10);

    for (const entity of entities) {
      const kind: "direct" | "middleware" = report.middlewareModels.includes(entity) ? "middleware" : "direct";
      const selectedModel =
        kind === "middleware" ? (record[`${entity}_routed_model`] || entity) : entity;
      const totalTokens = toNumber(record[`${entity}_total_tokens`]);
      const durationMs = toNumber(record[`${entity}_duration_ms`]);
      const loadUnits = calcLoadUnits(totalTokens, durationMs, config);
      const modelFactor = config.modelFactors[selectedModel] ?? 1;
      const middlewareMultiplier =
        kind === "middleware" ? (config.middlewareMultipliers[entity] ?? 1) : (config.middlewareMultipliers.direct ?? 1);

      energyRows.push({
        entity,
        kind,
        rowIndex,
        selectedModel,
        answer: toMaybeString(record[`${entity}_answer`]),
        correct: toBool(record[`${entity}_correct`]),
        promptTokens: toNumber(record[`${entity}_prompt_tokens`]),
        completionTokens: toNumber(record[`${entity}_completion_tokens`]),
        totalTokens,
        durationMs,
        loadUnits,
        modelFactor,
        middlewareMultiplier,
        proxyEnergy: loadUnits * modelFactor * middlewareMultiplier,
      });
    }
  }

  return energyRows;
}

function summarizeEnergy(report: ComparisonReport, energyRows: EnergyRow[]): EnergySummary[] {
  const entities = getEntityNames(report);
  return entities.map((entity) => {
    const rows = energyRows.filter((row) => row.entity === entity);
    const selectedModels: Record<string, number> = {};
    let correct = 0;
    let totalLoadUnits = 0;
    let totalProxyEnergy = 0;

    for (const row of rows) {
      if (row.correct) {
        correct++;
      }
      totalLoadUnits += row.loadUnits;
      totalProxyEnergy += row.proxyEnergy;
      selectedModels[row.selectedModel] = (selectedModels[row.selectedModel] ?? 0) + 1;
    }

    return {
      entity,
      kind: report.middlewareModels.includes(entity) ? "middleware" : "direct",
      rows: rows.length,
      correct,
      accuracy: rows.length > 0 ? correct / rows.length : 0,
      selectedModels,
      totalLoadUnits,
      totalProxyEnergy,
      proxyEnergyPerRow: rows.length > 0 ? totalProxyEnergy / rows.length : 0,
      proxyEnergyPerCorrect: correct > 0 ? totalProxyEnergy / correct : null,
    };
  });
}

function renderEnergyCsv(rows: EnergyRow[]): string {
  const header = [
    "entity",
    "kind",
    "row_index",
    "selected_model",
    "answer",
    "correct",
    "prompt_tokens",
    "completion_tokens",
    "total_tokens",
    "duration_ms",
    "load_units",
    "model_factor",
    "middleware_multiplier",
    "proxy_energy",
  ];

  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push([
      row.entity,
      row.kind,
      row.rowIndex,
      row.selectedModel,
      row.answer,
      row.correct,
      row.promptTokens,
      row.completionTokens,
      row.totalTokens,
      row.durationMs,
      row.loadUnits,
      row.modelFactor,
      row.middlewareMultiplier,
      row.proxyEnergy,
    ].map(escapeCsv).join(","));
  }
  return lines.join("\n") + "\n";
}

function renderMarkdown(report: ComparisonReport, config: EnergyConfig, summaries: EnergySummary[]): string {
  const tokensAvailable = report.summaries.some((summary) => (summary.totalCompletionTokens ?? 0) > 0);
  const maxEnergy = Math.max(...summaries.map((summary) => summary.totalProxyEnergy), 1);
  const energyBars = summaries.map((summary) => Number(summary.totalProxyEnergy.toFixed(2))).join(", ");
  const efficiencyBars = summaries.map((summary) => Number((summary.proxyEnergyPerCorrect ?? 0).toFixed(2))).join(", ");
  const labels = summaries.map((summary) => `"${summary.entity}"`).join(", ");
  const lines: string[] = [
    "# Energy Proxy Report",
    "",
    `- Source comparison: \`${report.dataset}\``,
    `- Rows evaluated: **${report.rowsEvaluated}**`,
    `- Token unit weight: **${config.tokenUnitWeight}**`,
    `- Duration unit weight: **${config.durationMsUnitWeight}** proxy units per ms`,
    tokensAvailable
      ? "- Current note: this run uses diagnostics-backed output tokens plus wall-clock duration."
      : "- Current note: token totals were unavailable, so this run is effectively duration-driven.",
    "",
    "## Formula",
    "",
    "```text",
    "load_units = total_tokens * tokenUnitWeight + duration_ms * durationMsUnitWeight",
    "proxy_energy = load_units * model_factor(selected_model) * middleware_multiplier(entity)",
    "```",
    "",
    "## Model Factors",
    "",
    ...Object.entries(config.modelFactors).map(([model, factor]) => `- \`${model}\`: ${factor}`),
    "",
    "## Middleware Multipliers",
    "",
    ...Object.entries(config.middlewareMultipliers).map(([name, factor]) => `- \`${name}\`: ${factor}`),
    "",
    "## Proxy Scoreboard",
    "",
    "| Entity | Kind | Accuracy | Total Proxy Energy | Proxy / Row | Proxy / Correct |",
    "| --- | --- | ---: | ---: | ---: | ---: |",
    ...summaries.map((summary) =>
      `| \`${summary.entity}\` | ${summary.kind} | ${(summary.accuracy * 100).toFixed(2)}% | ${summary.totalProxyEnergy.toFixed(2)} | ${summary.proxyEnergyPerRow.toFixed(2)} | ${summary.proxyEnergyPerCorrect?.toFixed(2) ?? "n/a"} |`,
    ),
    "",
    "## Total Proxy Energy",
    "",
    "```mermaid",
    "xychart-beta",
    '    title "Total Proxy Energy"',
    `    x-axis [${labels}]`,
    `    y-axis "proxy energy" 0 --> ${Math.ceil(maxEnergy * 1.15)}`,
    `    bar [${energyBars}]`,
    "```",
    "",
    "## Proxy Energy Per Correct Answer",
    "",
    "```mermaid",
    "xychart-beta",
    '    title "Proxy Energy Per Correct Answer"',
    `    x-axis [${labels}]`,
    `    y-axis "proxy / correct" 0 --> ${Math.ceil(Math.max(...summaries.map((summary) => summary.proxyEnergyPerCorrect ?? 0), 1) * 1.15)}`,
    `    bar [${efficiencyBars}]`,
    "```",
    "",
  ];

  for (const summary of summaries) {
    const routed = Object.entries(summary.selectedModels).map(([model, count]) => `\`${model}\` (${count})`).join(", ");
    lines.push(`### ${summary.entity}`);
    lines.push("");
    lines.push(`- Selected models: ${routed || "none"}`);
    lines.push(`- Total proxy energy: ${summary.totalProxyEnergy.toFixed(2)}`);
    lines.push(`- Proxy energy per correct answer: ${summary.proxyEnergyPerCorrect?.toFixed(2) ?? "n/a"}`);
    lines.push("");
  }

  return lines.join("\n");
}

function renderMiddlewareMarkdown(
  report: ComparisonReport,
  config: EnergyConfig,
  summaries: EnergySummary[],
): string {
  const middlewareRows: MiddlewareSummaryRow[] = report.middlewareModels.map((name) => {
    const comparison = report.summaries.find((summary) => summary.name === name);
    const energy = summaries.find((summary) => summary.entity === name);
    if (!comparison || !energy) {
      throw new Error(`Missing middleware summary for ${name}`);
    }
    return { comparison, energy };
  });

  const byEfficiency = [...middlewareRows].sort(
    (a, b) => (a.energy.proxyEnergyPerCorrect ?? Number.POSITIVE_INFINITY) - (b.energy.proxyEnergyPerCorrect ?? Number.POSITIVE_INFINITY),
  );
  const byAccuracy = [...middlewareRows].sort((a, b) => b.comparison.accuracy - a.comparison.accuracy);
  const accuracyLabels = middlewareRows.map((row) => `"${row.comparison.name}"`).join(", ");
  const accuracyBars = middlewareRows.map((row) => Number((row.comparison.accuracy * 100).toFixed(2))).join(", ");
  const energyBars = middlewareRows.map((row) => Number(row.energy.totalProxyEnergy.toFixed(2))).join(", ");
  const efficiencyBars = middlewareRows.map((row) => Number((row.energy.proxyEnergyPerCorrect ?? 0).toFixed(2))).join(", ");

  const lines: string[] = [
    "# Middleware Summary",
    "",
    `- Dataset: \`${report.dataset}\``,
    `- Rows evaluated: **${report.rowsEvaluated}**`,
    `- Small model factor: \`${report.smallModel}\` = ${config.modelFactors[report.smallModel] ?? 1}`,
    `- Large model factor: \`${report.largeModel}\` = ${config.modelFactors[report.largeModel] ?? 1}`,
    "",
    "## Most Interesting Takeaways",
    "",
    `- Best middleware by accuracy: \`${byAccuracy[0]!.comparison.name}\` at ${(byAccuracy[0]!.comparison.accuracy * 100).toFixed(2)}% (${byAccuracy[0]!.comparison.correct}/${byAccuracy[0]!.comparison.total}).`,
    `- Best middleware by proxy energy per correct answer: \`${byEfficiency[0]!.comparison.name}\` at ${(byEfficiency[0]!.energy.proxyEnergyPerCorrect ?? 0).toFixed(2)}.`,
    `- Most expensive middleware overall: \`${[...middlewareRows].sort((a, b) => b.energy.totalProxyEnergy - a.energy.totalProxyEnergy)[0]!.comparison.name}\` at ${[...middlewareRows].sort((a, b) => b.energy.totalProxyEnergy - a.energy.totalProxyEnergy)[0]!.energy.totalProxyEnergy.toFixed(2)} proxy units.`,
    "",
    "## Middleware Scoreboard",
    "",
    "| Middleware | Accuracy | Correct | Completion Tokens | Reasoning Tokens | Avg Duration (ms) | Proxy Energy | Proxy / Correct |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...middlewareRows.map(({ comparison, energy }) =>
      `| \`${comparison.name}\` | ${(comparison.accuracy * 100).toFixed(2)}% | ${comparison.correct}/${comparison.total} | ${(comparison.totalCompletionTokens ?? 0).toFixed(0)} | ${(comparison.totalReasoningTokensKnown ?? 0).toFixed(0)} | ${(comparison.averageDurationMs ?? 0).toFixed(1)} | ${energy.totalProxyEnergy.toFixed(2)} | ${energy.proxyEnergyPerCorrect?.toFixed(2) ?? "n/a"} |`,
    ),
    "",
    "## Accuracy",
    "",
    "```mermaid",
    "xychart-beta",
    '    title "Middleware Accuracy"',
    `    x-axis [${accuracyLabels}]`,
    '    y-axis "accuracy %" 0 --> 100',
    `    bar [${accuracyBars}]`,
    "```",
    "",
    "## Total Proxy Energy",
    "",
    "```mermaid",
    "xychart-beta",
    '    title "Middleware Total Proxy Energy"',
    `    x-axis [${accuracyLabels}]`,
    `    y-axis "proxy energy" 0 --> ${Math.ceil(Math.max(...middlewareRows.map((row) => row.energy.totalProxyEnergy), 1) * 1.15)}`,
    `    bar [${energyBars}]`,
    "```",
    "",
    "## Proxy Energy Per Correct Answer",
    "",
    "```mermaid",
    "xychart-beta",
    '    title "Middleware Proxy Energy Per Correct"',
    `    x-axis [${accuracyLabels}]`,
    `    y-axis "proxy / correct" 0 --> ${Math.ceil(Math.max(...middlewareRows.map((row) => row.energy.proxyEnergyPerCorrect ?? 0), 1) * 1.15)}`,
    `    bar [${efficiencyBars}]`,
    "```",
    "",
    "## Routing Details",
    "",
  ];

  for (const { comparison, energy } of middlewareRows) {
    const routed = Object.entries(comparison.routedModels ?? {})
      .map(([model, count]) => `\`${model}\` (${count})`)
      .join(", ");
    lines.push(`### ${comparison.name}`);
    lines.push("");
    lines.push(`- Routed backends: ${routed || "none"}`);
    lines.push(`- Accuracy: ${(comparison.accuracy * 100).toFixed(2)}% (${comparison.correct}/${comparison.total})`);
    lines.push(`- Output tokens: ${(comparison.totalCompletionTokens ?? 0).toFixed(0)} total, ${(comparison.totalReasoningTokensKnown ?? 0).toFixed(0)} reasoning, ${(comparison.totalAnswerTokensKnown ?? 0).toFixed(0)} answer`);
    lines.push(`- Average duration: ${(comparison.averageDurationMs ?? 0).toFixed(1)} ms`);
    lines.push(`- Proxy energy: ${energy.totalProxyEnergy.toFixed(2)} total, ${energy.proxyEnergyPerCorrect?.toFixed(2) ?? "n/a"} per correct answer`);
    lines.push(`- Agreement with direct models: small ${comparison.agreesWithSmall ?? 0}/${comparison.total}, large ${comparison.agreesWithLarge ?? 0}/${comparison.total}`);
    lines.push("");
  }

  return lines.join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = JSON.parse(await Bun.file(args.comparisonJson).text()) as ComparisonReport;
  const configPath = resolve(args.outputDir, "highscattered_first30_energy_proxy_config.json");
  const config = await loadConfig(configPath, report);
  const csvRows = parseCsv(await Bun.file(args.combinedCsv).text());
  const energyRows = buildEnergyRows(report, csvRows, config);
  const summaries = summarizeEnergy(report, energyRows);

  const energyCsvPath = resolve(args.outputDir, "highscattered_first30_energy_proxy_rows.csv");
  const energyJsonPath = resolve(args.outputDir, "highscattered_first30_energy_proxy_summary.json");
  const energyMarkdownPath = resolve(args.outputDir, "highscattered_first30_energy_proxy_report.md");
  const middlewareMarkdownPath = resolve(args.outputDir, "highscattered_first30_middleware_summary.md");

  await Bun.write(energyCsvPath, renderEnergyCsv(energyRows));
  await Bun.write(energyJsonPath, JSON.stringify({ config, summaries }, null, 2));
  await Bun.write(energyMarkdownPath, renderMarkdown(report, config, summaries));
  await Bun.write(middlewareMarkdownPath, renderMiddlewareMarkdown(report, config, summaries));

  console.log(`Wrote energy config:   ${configPath}`);
  console.log(`Wrote energy CSV:      ${energyCsvPath}`);
  console.log(`Wrote energy JSON:     ${energyJsonPath}`);
  console.log(`Wrote energy Markdown: ${energyMarkdownPath}`);
  console.log(`Wrote middleware MD:   ${middlewareMarkdownPath}`);
  console.log(JSON.stringify({ config, summaries }, null, 2));
}

await main();
