import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useDashboardStore } from "./useDashboardStore";
import {
  diagnosticIssueTitle,
  finishReasonSummary,
  finishReasonTitle,
  hasDiagnosticIssue,
  outcomeBadgeClass,
  outcomeLabel,
  outcomeTitle,
} from "../utils/requests-table-outcomes";
import {
  requestColumnTitles,
  requestFilterIconPath,
  requestIssueFilterOptions,
  requestNumericComparatorOptions,
  requestSortLabels,
  requestTypeFilterOptions,
  type RequestFilterKey,
  type RequestSortDirection,
  type RequestSortKey,
  type RequestTableFilters,
} from "../utils/requests-table";
import {
  formatLogDate,
  formatLogTime,
  energyUsageSummary,
  maxTokensSummary,
  noteSummary,
  routingMiddlewareLabel,
  routingProfileLabel,
  routingTitle,
  tokenCountSummary,
  tokenRateSummary,
} from "../utils/requests-table-display";
import {
  clearRequestFilter,
  createRequestTableFilters,
  filterRequestEntries,
  hasActiveRequestFilters,
  isRequestFilterActive,
  normalizeOutcomeFilterValue,
  resetRequestFilters,
  sortRequestEntries,
} from "../utils/requests-table-controls";
import {
  buildBackendOptions,
  buildFinishReasonOptions,
  buildMiddlewareOptions,
  buildModelOptions,
  buildOutcomeOptions,
  buildRoutingOptions,
} from "../utils/requests-table-options";
import {
  buildRequestCatalog,
  type RequestCatalogRow,
} from "../utils/request-catalog";

export function useRequestsTable() {
  const store = useDashboardStore();
  const route = useRoute();
  const router = useRouter();

  const openFilterKey = ref<RequestFilterKey | "">("");
  const sortKey = ref<RequestSortKey | "">("");
  const sortDirection = ref<RequestSortDirection>("");
  const filters = reactive(createRequestTableFilters());
  const draftFilters = reactive(createRequestTableFilters());

  const filterFieldMap: Record<RequestFilterKey, Array<keyof RequestTableFilters>> = {
    issues: ["issues"],
    time: ["time"],
    outcome: ["outcome"],
    finishReason: ["finishReason"],
    type: ["type"],
    request: ["request"],
    model: ["model"],
    middleware: ["middleware"],
    routing: ["routing"],
    backend: ["backend"],
    queue: ["queueComparator", "queueValue"],
    latency: ["latencyComparator", "latencyValue"],
    tokens: ["tokensComparator", "tokensValue"],
    maxTokens: ["maxTokensComparator", "maxTokensValue"],
    energy: ["energyComparator", "energyValue"],
    rate: ["rateComparator", "rateValue"],
    note: ["note"],
  };

  const tableEntries = computed<RequestCatalogRow[]>(() => buildRequestCatalog(store.state.snapshot));
  const hasActiveFilters = computed(() => hasActiveRequestFilters(filters));
  const outcomeOptions = computed(() => buildOutcomeOptions(tableEntries.value));
  const finishReasonOptions = computed(() => buildFinishReasonOptions(tableEntries.value));
  const modelOptions = computed(() => buildModelOptions(tableEntries.value));
  const middlewareOptions = computed(() => buildMiddlewareOptions(tableEntries.value));
  const routingOptions = computed(() => buildRoutingOptions(tableEntries.value));
  const backendOptions = computed(() => buildBackendOptions(tableEntries.value));
  const issueEntriesCount = computed(() => tableEntries.value.filter((entry) => hasDiagnosticIssue(entry)).length);
  const issuesFilterToggleDisabled = computed(() => issueEntriesCount.value === 0);
  const issuesFilterTitle = computed(() => {
    if (issueEntriesCount.value > 0) {
      return `Filter stored requests by whether llmproxy's heuristic diagnostics flagged them. ${issueEntriesCount.value} problematic request${issueEntriesCount.value === 1 ? "" : "s"} currently retained.`;
    }

    return "No heuristic issues have been detected in the retained request list.";
  });

  const filteredEntries = computed(() => (
    filterRequestEntries(tableEntries.value, filters, store.shortId)
  ));

  const sortedEntries = computed(() => (
    sortRequestEntries(filteredEntries.value, sortKey.value, sortDirection.value)
  ));

  function syncDraftFiltersFromApplied(): void {
    Object.assign(draftFilters, filters);
  }

  function copyFilterValue(
    source: RequestTableFilters,
    target: RequestTableFilters,
    filterKey: RequestFilterKey,
  ): void {
    for (const field of filterFieldMap[filterKey]) {
      target[field] = source[field];
    }
  }

  function toggleFilter(filterKey: RequestFilterKey): void {
    if (openFilterKey.value === filterKey) {
      openFilterKey.value = "";
      return;
    }

    syncDraftFiltersFromApplied();
    openFilterKey.value = filterKey;
  }

  function toggleSort(nextSortKey: RequestSortKey): void {
    if (sortKey.value !== nextSortKey) {
      sortKey.value = nextSortKey;
      sortDirection.value = nextSortKey === "time" ? "desc" : "asc";
      return;
    }

    if (sortDirection.value === "asc") {
      sortDirection.value = "desc";
      return;
    }

    if (sortDirection.value === "desc") {
      sortKey.value = "";
      sortDirection.value = "";
      return;
    }

    sortDirection.value = nextSortKey === "time" ? "desc" : "asc";
  }

  function isSortedBy(candidate: RequestSortKey): boolean {
    return sortKey.value === candidate && sortDirection.value !== "";
  }

  function sortTitle(candidate: RequestSortKey): string {
    const label = requestSortLabels[candidate];
    if (sortKey.value !== candidate || !sortDirection.value) {
      return `Sort by ${label}.`;
    }

    return sortDirection.value === "asc"
      ? `Sorted ascending by ${label}. Click to sort descending.`
      : `Sorted descending by ${label}. Click again to clear sorting.`;
  }

  function isFilterOpen(filterKey: RequestFilterKey): boolean {
    return openFilterKey.value === filterKey;
  }

  function isFilterActive(filterKey: RequestFilterKey): boolean {
    return isRequestFilterActive(filters, filterKey);
  }

  function resetFilters(): void {
    resetRequestFilters(filters);
    resetRequestFilters(draftFilters);
    openFilterKey.value = "";
  }

  function clearFilter(filterKey: RequestFilterKey): void {
    clearRequestFilter(draftFilters, filterKey);
  }

  function applyFilter(filterKey: RequestFilterKey): void {
    copyFilterValue(draftFilters, filters, filterKey);
    openFilterKey.value = "";
  }

  function promoteNumericComparator(
    targetFilters: RequestTableFilters,
    comparatorKey: "queueComparator" | "latencyComparator" | "tokensComparator" | "maxTokensComparator" | "energyComparator" | "rateComparator",
    value: string,
  ): void {
    if (value.trim().length === 0 || targetFilters[comparatorKey] !== "any") {
      return;
    }

    targetFilters[comparatorKey] = "gte";
  }

  function handleDocumentPointerDown(event: PointerEvent): void {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    if (!target.closest(".log-header-filter")) {
      openFilterKey.value = "";
    }
  }

  watch(
    () => route.query.outcome,
    (queryValue) => {
      const normalized = normalizeOutcomeFilterValue(queryValue);
      if (filters.outcome !== normalized) {
        filters.outcome = normalized;
      }
    },
    { immediate: true },
  );

  watch(
    () => filters.outcome,
    (value) => {
      const normalizedRouteOutcome = normalizeOutcomeFilterValue(route.query.outcome);
      if (value === normalizedRouteOutcome) {
        return;
      }

      const nextQuery = { ...route.query };
      if (value === "all") {
        delete nextQuery.outcome;
      } else {
        nextQuery.outcome = value;
      }

      void router.replace({ query: nextQuery });
    },
  );

  watch(() => filters.queueValue, (value) => {
    promoteNumericComparator(filters, "queueComparator", value);
  });

  watch(() => draftFilters.queueValue, (value) => {
    promoteNumericComparator(draftFilters, "queueComparator", value);
  });

  watch(() => filters.latencyValue, (value) => {
    promoteNumericComparator(filters, "latencyComparator", value);
  });

  watch(() => draftFilters.latencyValue, (value) => {
    promoteNumericComparator(draftFilters, "latencyComparator", value);
  });

  watch(() => filters.tokensValue, (value) => {
    promoteNumericComparator(filters, "tokensComparator", value);
  });

  watch(() => draftFilters.tokensValue, (value) => {
    promoteNumericComparator(draftFilters, "tokensComparator", value);
  });

  watch(() => filters.maxTokensValue, (value) => {
    promoteNumericComparator(filters, "maxTokensComparator", value);
  });

  watch(() => draftFilters.maxTokensValue, (value) => {
    promoteNumericComparator(draftFilters, "maxTokensComparator", value);
  });

  watch(() => filters.rateValue, (value) => {
    promoteNumericComparator(filters, "rateComparator", value);
  });

  watch(() => filters.energyValue, (value) => {
    promoteNumericComparator(filters, "energyComparator", value);
  });

  watch(() => draftFilters.rateValue, (value) => {
    promoteNumericComparator(draftFilters, "rateComparator", value);
  });

  watch(() => draftFilters.energyValue, (value) => {
    promoteNumericComparator(draftFilters, "energyComparator", value);
  });

  onMounted(() => {
    syncDraftFiltersFromApplied();
    document.addEventListener("pointerdown", handleDocumentPointerDown);
  });

  onBeforeUnmount(() => {
    document.removeEventListener("pointerdown", handleDocumentPointerDown);
  });

  return {
    applyFilter,
    backendOptions,
    clearFilter,
    columnTitles: requestColumnTitles,
    diagnosticIssueTitle,
    draftFilters,
    filterIconPath: requestFilterIconPath,
    finishReasonOptions,
    finishReasonSummary,
    finishReasonTitle,
    filters,
    filteredEntries,
    formatLogDate,
    formatLogTime,
    hasActiveFilters,
    hasDiagnosticIssue,
    issueFilterOptions: requestIssueFilterOptions,
    isFilterActive,
    isFilterOpen,
    isSortedBy,
    issueEntriesCount,
    issuesFilterTitle,
    issuesFilterToggleDisabled,
    maxTokensSummary,
    energyUsageSummary,
    middlewareOptions,
    modelOptions,
    noteSummary,
    numericComparatorOptions: requestNumericComparatorOptions,
    outcomeBadgeClass,
    outcomeLabel,
    outcomeOptions,
    outcomeTitle,
    resetFilters,
    routingOptions,
    routingMiddlewareLabel,
    routingProfileLabel,
    routingTitle,
    sortTitle,
    sortedEntries,
    tableEntries,
    typeOptions: requestTypeFilterOptions,
    toggleFilter,
    toggleSort,
    tokenCountSummary,
    tokenRateSummary,
  };
}
