<script setup lang="ts">
import type { DiagnosticReport } from "../types/dashboard";

const props = withDefaults(defineProps<{
  report?: DiagnosticReport | null;
  loading?: boolean;
  error?: string;
  waitingForFinal?: boolean;
}>(), {
  report: null,
  loading: false,
  error: "",
  waitingForFinal: false,
});

function severityLabel(severity: "info" | "warn" | "bad"): string {
  if (severity === "bad") {
    return "High";
  }

  if (severity === "warn") {
    return "Medium";
  }

  return "Info";
}
</script>

<template>
  <div class="diagnostics-report-view">
    <div v-if="loading" class="empty">Loading analyzer...</div>
    <div v-else-if="error" class="empty">{{ error }}</div>
    <template v-else-if="report">
      <div v-if="report.findings.length" class="diagnostics-findings">
        <article
          v-for="finding in report.findings"
          :key="finding.code"
          :class="['diagnostics-finding', `severity-${finding.severity}`]"
        >
          <div class="diagnostics-finding-head">
            <div>
              <div class="diagnostics-finding-title">{{ finding.title }}</div>
              <div class="diagnostics-finding-summary">{{ finding.summary }}</div>
            </div>
            <span :class="['diagnostics-severity-chip', `severity-${finding.severity}`]">
              {{ severityLabel(finding.severity) }}
            </span>
          </div>

          <div class="diagnostics-finding-block">
            <div class="diagnostics-section-label">Evidence</div>
            <ul class="diagnostics-list">
              <li v-for="evidence in finding.evidence" :key="evidence">{{ evidence }}</li>
            </ul>
          </div>

          <div class="diagnostics-finding-block">
            <div class="diagnostics-section-label">Troubleshooting</div>
            <ul class="diagnostics-list">
              <li v-for="step in finding.troubleshooting" :key="step">{{ step }}</li>
            </ul>
          </div>
        </article>
      </div>
      <div v-else class="empty mt-5">Analyzer did not detect likely issues for this request.</div>
    </template>
    <div v-else-if="waitingForFinal" class="empty">
      Analyzer becomes available after the request finishes and is retained in history.
    </div>
    <div v-else class="empty">No analyzer result is available for this request.</div>
  </div>
</template>
